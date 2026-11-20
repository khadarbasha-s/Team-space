"""OAuth 2.1 front door for the remote (HTTP) MCP server, so ChatGPT and other
remote MCP clients can connect with a normal "Connect" flow.

How it works -- the TeamSpace API key IS the credential:

  1. The client (ChatGPT) registers itself (dynamic client registration) and
     sends the user to /authorize (handled by the MCP SDK).
  2. We send the user to our own /connect page. They paste a TeamSpace API key
     (created under Account > API keys in TeamSpace).
  3. We check that key against TeamSpace (it must be live and owned by an
     admin/manager), then complete the OAuth redirect with a one-time code.
  4. The client exchanges the code (PKCE-protected) for an access token. That
     token is simply the TeamSpace API key itself.

Consequences worth knowing:
  - Nothing secret is stored at rest. Pending requests and one-time codes live
    in memory for minutes; only registered client metadata is in SQLite. (So
    run ONE instance, or use sticky routing -- see README.)
  - Revoking the key in the TeamSpace portal revokes the client's access: the
    next request fails (tool calls hit TeamSpace with the key every time, and
    our own check of the key is cached for only 20 seconds).
  - Only clients whose redirect URIs are on an allowlist can register, so a
    random site can't use this server's consent page to phish keys.
"""
import asyncio
import html
import json
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import requests
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse

KEY_PREFIX = "tsk_"
PENDING_TTL = 600  # seconds the user has to finish the consent page
CODE_TTL = 300
VERIFY_CACHE_TTL = 20
MAX_ATTEMPTS = 5  # wrong keys per consent request before it is cancelled
MAX_PENDING = 1000

DEFAULT_REDIRECT_HOSTS = (
    "chatgpt.com",
    "openai.com",
    "claude.ai",
    "claude.com",
    "localhost",
    "127.0.0.1",
)


@dataclass
class _Pending:
    client: OAuthClientInformationFull
    params: AuthorizationParams
    expires: float
    attempts: int = 0


def host_allowed(host: str, allowed: tuple[str, ...]) -> bool:
    host = (host or "").lower()
    return any(host == a or host.endswith("." + a) for a in allowed)


class KeyAuthProvider:
    """Implements the MCP SDK's OAuthAuthorizationServerProvider protocol."""

    def __init__(self, *, backend_url: str, public_url: str, db_path: str, allowed_roles: tuple[str, ...], redirect_hosts: tuple[str, ...]):
        self.backend = backend_url.rstrip("/")
        self.public = public_url.rstrip("/")
        self.allowed_roles = allowed_roles
        self.redirect_hosts = redirect_hosts
        self._pending: dict[str, _Pending] = {}
        self._codes: dict[str, tuple[AuthorizationCode, str]] = {}  # code -> (code info, api key)
        self._verified: dict[str, tuple[float, AccessToken]] = {}
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db_lock = threading.Lock()
        with self._db_lock:
            self._db.execute("CREATE TABLE IF NOT EXISTS clients (client_id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            self._db.commit()

    # ------------------------------------------------------------- clients
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with self._db_lock:
            row = self._db.execute("SELECT data FROM clients WHERE client_id = ?", (client_id,)).fetchone()
        return OAuthClientInformationFull.model_validate_json(row[0]) if row else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        for uri in client_info.redirect_uris or []:
            u = urlparse(str(uri))
            local = u.hostname in ("localhost", "127.0.0.1")
            if u.scheme != "https" and not (u.scheme == "http" and local):
                raise RegistrationError(error="invalid_redirect_uri", error_description="redirect_uri must use https.")
            if not host_allowed(u.hostname or "", self.redirect_hosts):
                raise RegistrationError(
                    error="invalid_redirect_uri",
                    error_description=f"redirect host '{u.hostname}' is not allowed by this server.",
                )
        with self._db_lock:
            self._db.execute(
                "INSERT OR REPLACE INTO clients (client_id, data) VALUES (?, ?)",
                (client_info.client_id, client_info.model_dump_json()),
            )
            self._db.commit()

    # --------------------------------------------------------- authorize flow
    def _purge(self) -> None:
        now = time.time()
        for store in (self._pending,):
            for k in [k for k, v in store.items() if v.expires < now]:
                del store[k]
        for k in [k for k, (c, _key) in self._codes.items() if c.expires_at < now]:
            del self._codes[k]

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        self._purge()
        if len(self._pending) >= MAX_PENDING:
            raise TokenError(error="invalid_request", error_description="Server is busy; try again shortly.")
        req = secrets.token_urlsafe(24)
        self._pending[req] = _Pending(client=client, params=params, expires=time.time() + PENDING_TTL)
        return f"{self.public}/connect?req={req}"

    def _check_key(self, key: str) -> dict | None:
        """Blocking: ask TeamSpace who this key belongs to. None if the key is
        dead or its owner isn't an allowed role."""
        if not key.startswith(KEY_PREFIX):
            return None
        try:
            r = requests.get(f"{self.backend}/auth/me", headers={"Authorization": f"Bearer {key}"}, timeout=10)
        except requests.RequestException:
            return None
        if r.status_code != 200:
            return None
        user = r.json().get("user", {})
        if user.get("org_role") not in self.allowed_roles:
            return None
        return user

    async def connect_page(self, request: Request) -> HTMLResponse:
        self._purge()
        if request.method == "POST":
            body = parse_qs((await request.body())[:8192].decode("utf-8", "replace"))
            req = (body.get("req") or [""])[0]
            key = (body.get("api_key") or [""])[0].strip()
        else:
            req, key = request.query_params.get("req", ""), ""
        pending = self._pending.get(req)
        if not pending:
            return _page("This connection request has expired or is invalid. Go back to your AI app and try connecting again.", status=400)

        if request.method == "POST":
            pending.attempts += 1
            user = await asyncio.to_thread(self._check_key, key)
            if user:
                del self._pending[req]
                code = secrets.token_urlsafe(32)
                p = pending.params
                self._codes[code] = (
                    AuthorizationCode(
                        code=code,
                        scopes=p.scopes or [],
                        expires_at=time.time() + CODE_TTL,
                        client_id=pending.client.client_id,
                        code_challenge=p.code_challenge,
                        redirect_uri=p.redirect_uri,
                        redirect_uri_provided_explicitly=p.redirect_uri_provided_explicitly,
                        resource=p.resource,
                        subject=user.get("id"),
                    ),
                    key,
                )
                return RedirectResponse(construct_redirect_uri(str(p.redirect_uri), code=code, state=p.state), status_code=302, headers=_NO_STORE)
            if pending.attempts >= MAX_ATTEMPTS:
                del self._pending[req]
                return _page("Too many invalid attempts. Go back to your AI app and start the connection again.", status=400)
            return _consent_html(pending, req, error="That key wasn't accepted. It must be a live TeamSpace API key owned by an admin or manager.")
        return _consent_html(pending, req)

    # ------------------------------------------------------------ token flow
    async def load_authorization_code(self, client: OAuthClientInformationFull, authorization_code: str) -> AuthorizationCode | None:
        entry = self._codes.get(authorization_code)
        if not entry or entry[0].client_id != client.client_id or entry[0].expires_at < time.time():
            return None
        return entry[0]

    async def exchange_authorization_code(self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode) -> OAuthToken:
        entry = self._codes.pop(authorization_code.code, None)  # single use
        if not entry:
            raise TokenError(error="invalid_grant", error_description="Authorization code was already used or has expired.")
        # No refresh token and no expires_in: the TeamSpace key carries its own
        # expiry/revocation, and a 401 sends the client back through /connect.
        return OAuthToken(access_token=entry[1], token_type="Bearer", scope=" ".join(authorization_code.scopes) or None)

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        return None

    async def exchange_refresh_token(self, client, refresh_token, scopes) -> OAuthToken:
        raise TokenError(error="unsupported_grant_type", error_description="Refresh tokens are not issued.")

    async def load_access_token(self, token: str) -> AccessToken | None:
        now = time.time()
        hit = self._verified.get(token)
        if hit and hit[0] > now:
            return hit[1]
        user = await asyncio.to_thread(self._check_key, token)
        if not user:
            self._verified.pop(token, None)
            return None
        at = AccessToken(token=token, client_id="teamspace-api-key", scopes=[], expires_at=None, subject=user.get("id"))
        if len(self._verified) > 2000:
            self._verified.clear()
        self._verified[token] = (now + VERIFY_CACHE_TTL, at)
        return at

    async def revoke_token(self, token) -> None:  # revocation endpoint is disabled; keys are revoked in the portal
        return None


# ------------------------------------------------------------------ HTML
_NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}
_SEC_HEADERS = {
    **_NO_STORE,
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
}
_CSS = """
body{font-family:system-ui,sans-serif;background:#faf6ee;color:#1d1a14;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{background:#fff;border:1px solid #e6dfd0;border-radius:12px;padding:28px;max-width:460px;width:calc(100% - 32px)}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.5;margin:8px 0}
.who{background:#faf6ee;border-radius:8px;padding:10px 12px;font-size:13px}
input[type=password],input[type=text]{width:100%;box-sizing:border-box;padding:10px;font:14px ui-monospace,monospace;border:1px solid #cfc6b2;border-radius:8px;margin:6px 0 12px}
button{background:#e8890c;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
.err{color:#b3261e;font-size:13px;margin:6px 0}.hint{color:#6b6454;font-size:12px}
"""


def _page(message: str, status: int = 200) -> HTMLResponse:
    body = f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>TeamSpace</title><style>{_CSS}</style><main><h1>TeamSpace</h1><p>{html.escape(message)}</p></main>"
    return HTMLResponse(body, status_code=status, headers=_SEC_HEADERS)


def _consent_html(pending: _Pending, req: str, error: str = "") -> HTMLResponse:
    name = html.escape(pending.client.client_name or "An AI app")
    host = html.escape(urlparse(str(pending.params.redirect_uri)).hostname or "unknown")
    err = f'<div class="err" role="alert">{html.escape(error)}</div>' if error else ""
    body = f"""<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<title>Connect to TeamSpace</title><style>{_CSS}</style>
<main><h1>Connect to TeamSpace</h1>
<div class="who"><strong>{name}</strong> (returns to <strong>{host}</strong>) wants to act in TeamSpace as you: read and post messages, and manage teams, channels and events. It can never manage members, billing or keys.</div>
<p>Paste a TeamSpace API key. Create one in TeamSpace under <strong>Account &rarr; API keys</strong> (admins and managers only). You can revoke it there any time to cut this app off.</p>
<form method="post" action="/connect" autocomplete="off">
<input type="hidden" name="req" value="{html.escape(req)}">
<label for="k" class="hint">API key (starts with tsk_)</label>
<input id="k" name="api_key" type="password" required autofocus spellcheck="false">
{err}
<button type="submit">Connect</button>
</form>
<p class="hint">Only continue if you started this connection from {name}. Otherwise close this page.</p></main>"""
    return HTMLResponse(body, headers=_SEC_HEADERS)


class RegistrationCompat:
    """ASGI middleware: the MCP SDK's /register handler insists clients list
    BOTH authorization_code and refresh_token grants, but some real clients
    only ask for authorization_code. We never issue refresh tokens, so adding
    the grant to the registration request is harmless and keeps those clients
    from being rejected."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/register":
            return await self.app(scope, receive, send)
        body = b""
        more = True
        while more:
            msg = await receive()
            body += msg.get("body", b"")
            more = msg.get("more_body", False)
            if len(body) > 65536:
                break
        try:
            data = json.loads(body)
            grants = data.get("grant_types")
            if isinstance(grants, list) and "authorization_code" in grants and "refresh_token" not in grants:
                data["grant_types"] = [*grants, "refresh_token"]
                body = json.dumps(data).encode()
        except (ValueError, AttributeError):
            pass  # let the SDK produce its normal validation error

        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        # Content-Length must match the (possibly rewritten) body.
        headers = [(k, v) for k, v in scope["headers"] if k != b"content-length"] + [(b"content-length", str(len(body)).encode())]
        await self.app({**scope, "headers": headers}, replay, send)
