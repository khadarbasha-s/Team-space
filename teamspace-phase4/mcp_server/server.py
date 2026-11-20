"""TeamSpace MCP server.

Lets an MCP client (Claude Code, Claude Desktop, ...) operate TeamSpace from
plain-English prompts. The client's model does the understanding; this server
only exposes TeamSpace actions as tools and performs them through the normal
REST/WebSocket API, logged in as ONE real user -- so every tenant and
team-membership rule the app enforces still applies. The agent can never do
more than that user can do in the UI.

Access: only org_admin and manager accounts may use it; see ROLE_TOOLS.

Two ways to run it:
  * stdio (default): launched by a local MCP client (Claude Code, Claude
    Desktop, Cursor...) with TEAMSPACE_API_KEY in its environment.
  * remote HTTP (MCP_TRANSPORT=http): a deployed server for ChatGPT and other
    remote clients. Each user connects with their OWN API key through an
    OAuth "Connect" page (see oauth_provider.py); one deployment serves many
    users. Extra environment variables for this mode:
      MCP_PUBLIC_URL             public https URL of this server (required)
      TEAMSPACE_URL              URL of the TeamSpace backend (required)
      MCP_HOST / MCP_PORT        bind address (default 0.0.0.0 / $PORT or 8080)
      MCP_DB_PATH                SQLite file for registered clients
                                 (default ./mcp_oauth.db)
      MCP_ALLOWED_REDIRECT_HOSTS comma list of client callback hosts allowed
                                 to register (default: chatgpt.com, openai.com,
                                 claude.ai, claude.com, localhost)

Config (environment variables):
  TEAMSPACE_URL       default http://localhost:8000
  TEAMSPACE_API_KEY   a personal API key (tsk_...) created in the portal under
                      Account > API keys. Recommended: revocable, no password.
Fallback (only if no API key is set):
  TEAMSPACE_ORG / TEAMSPACE_EMAIL / TEAMSPACE_PASSWORD  password login
"""
import asyncio
import functools
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests
import websockets
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

BASE_URL = os.environ.get("TEAMSPACE_URL", "http://localhost:8000").rstrip("/")
DEFAULT_TZ = os.environ.get("TEAMSPACE_TZ", "Asia/Kolkata")
TIMEOUT = 20

TRANSPORT = os.environ.get("MCP_TRANSPORT", "stdio").lower()
HTTP_MODE = TRANSPORT in ("http", "streamable-http")

_token: Optional[str] = None  # stdio mode only: env key or password-login token


def _request_token() -> Optional[str]:
    """The API key the CURRENT remote caller authenticated with (HTTP mode),
    or None in stdio mode. Never falls back to server-wide credentials in HTTP
    mode, so one user can't act with another's (or the server's) identity."""
    at = get_access_token()
    return at.token if at else None


def _env_key() -> str:
    return os.environ.get("TEAMSPACE_API_KEY", "").strip()


class TeamSpaceError(Exception):
    """Raised with a message that is safe and useful to show the model."""


def _login() -> str:
    global _token
    if HTTP_MODE:
        raise TeamSpaceError("Not authenticated. Reconnect the TeamSpace app with a valid API key.")
    api_key = _env_key()
    if api_key:
        # A key is used as-is as the bearer token; there is nothing to log in
        # to or refresh. If it was revoked or expired, calls fail with 401.
        _token = api_key
        return _token
    missing = [k for k in ("TEAMSPACE_ORG", "TEAMSPACE_EMAIL", "TEAMSPACE_PASSWORD") if not os.environ.get(k)]
    if missing:
        raise TeamSpaceError(f"Missing environment variables: {', '.join(missing)}")
    try:
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={
                "org_slug": os.environ["TEAMSPACE_ORG"],
                "email": os.environ["TEAMSPACE_EMAIL"],
                "password": os.environ["TEAMSPACE_PASSWORD"],
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        raise TeamSpaceError(f"Cannot reach TeamSpace at {BASE_URL}: {e.__class__.__name__}")
    if r.status_code != 200:
        raise TeamSpaceError(f"Login failed ({r.status_code}): {_detail(r)}")
    _token = r.json()["access_token"]
    return _token


def _detail(r: requests.Response) -> str:
    try:
        d = r.json().get("detail")
        return d if isinstance(d, str) else json.dumps(d)
    except Exception:
        return r.text[:200]


def _call(method: str, path: str, **kw):
    """Authenticated request; logs in lazily and once more on a 401."""
    global _token
    req_token = _request_token()
    key_mode = bool(req_token or _env_key())
    for attempt in (1, 2):
        token = req_token or _token or _login()
        try:
            r = requests.request(
                method, f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT, **kw
            )
        except requests.RequestException as e:
            raise TeamSpaceError(f"Cannot reach TeamSpace at {BASE_URL}: {e.__class__.__name__}")
        if r.status_code == 401 and key_mode:
            raise TeamSpaceError(
                "The API key was rejected: it has been revoked or has expired, or its owner is no longer "
                "an admin/manager. Create a new key in TeamSpace under Account > API keys."
            )
        if r.status_code == 401 and attempt == 1:
            _token = None
            continue
        break
    if r.status_code == 402:
        raise TeamSpaceError("This workspace is suspended.")
    if r.status_code == 403 and key_mode and "API key" in _detail(r):
        raise TeamSpaceError("This API key is not allowed to do that.")
    if r.status_code >= 400:
        raise TeamSpaceError(f"{method} {path} failed ({r.status_code}): {_detail(r)}")
    return r.json() if r.content else None


def _resolve_team(team: str) -> dict:
    """Accept a team id or a (case-insensitive) team name."""
    teams = _call("GET", "/teams")
    for t in teams:
        if t["id"] == team:
            return t
    matches = [t for t in teams if t["name"].lower() == team.strip().lower()]
    if len(matches) == 1:
        return matches[0]
    names = ", ".join(t["name"] for t in teams) or "none"
    raise TeamSpaceError(f"No unique team '{team}'. Teams you can see: {names}")


def _resolve_channel(channel: str, team: Optional[str] = None) -> dict:
    """Accept a channel id, or a channel name (needs team if ambiguous)."""
    teams = [_resolve_team(team)] if team else [t for t in _call("GET", "/teams") if t.get("is_member")]
    found = []
    for t in teams:
        for c in _call("GET", f"/teams/{t['id']}/channels"):
            if c["id"] == channel or c["name"].lower() == channel.strip().lstrip("#").lower():
                found.append({**c, "team_name": t["name"]})
    if len(found) == 1:
        return found[0]
    if not found:
        raise TeamSpaceError(f"Channel '{channel}' not found among teams you belong to.")
    where = ", ".join(f"#{c['name']} in {c['team_name']}" for c in found)
    raise TeamSpaceError(f"'{channel}' is ambiguous ({where}); pass the team too.")


# ------------------------------------------------------------ role policy
# Who may use which tool, by the account's ORG role as the backend reports it
# (never trusted from config). Roles not listed here -- team_lead, member --
# are refused everything: this agent is for admins and managers only.
# This is an extra gate on top of the app's own permission checks, not a
# replacement for them.
READ_TOOLS = {"whoami", "list_teams", "list_channels", "list_team_members",
              "read_messages", "summarize_channel", "list_events", "list_files"}
ROLE_TOOLS = {
    "org_admin": READ_TOOLS | {"create_team", "create_channel", "send_message", "create_event", "delete_event"},
    "manager": READ_TOOLS | {"create_channel", "send_message", "create_event"},
}
ROLE_TTL_SECONDS = 60
_role_cache: dict[str, tuple[float, str, str]] = {}  # token -> (fetched_at, role, user_name)


def _current_role() -> tuple[str, str]:
    """(org_role, user name) of the caller; refreshed every ROLE_TTL_SECONDS
    so a demotion or removal takes effect without restarting the server.
    Cached per caller token, so users never see each other's role."""
    token = _request_token() or _token or ""
    now = time.monotonic()
    hit = _role_cache.get(token)
    if hit is None or now - hit[0] > ROLE_TTL_SECONDS:
        me = _call("GET", "/auth/me")
        hit = (now, me["user"]["org_role"], me["user"]["name"])
        if len(_role_cache) > 1000:
            _role_cache.clear()
        _role_cache[token] = hit
    return hit[1], hit[2]


def _authorize(tool_name: str) -> None:
    role, who = _current_role()
    if tool_name not in ROLE_TOOLS.get(role, set()):
        print(f"[teamspace-mcp] DENIED {tool_name} for {who} ({role})", file=sys.stderr)
        raise TeamSpaceError(
            f"Not allowed: your role '{role}' cannot use '{tool_name}'. "
            "This agent is limited to admins and managers; ask an org admin."
        )
    print(f"[teamspace-mcp] {tool_name} by {who} ({role})", file=sys.stderr)


def guarded(fn):
    """Check the caller's role before running the tool (sync or async)."""
    if asyncio.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def awrapper(*a, **kw):
            await asyncio.to_thread(_authorize, fn.__name__)
            return await fn(*a, **kw)
        return awrapper

    # Sync tools do blocking HTTP calls. Run them in a worker thread so one
    # slow request can't stall every other connected user (context, including
    # the caller's identity, is copied into the thread).
    @functools.wraps(fn)
    async def wrapper(*a, **kw):
        await asyncio.to_thread(_authorize, fn.__name__)
        return await asyncio.to_thread(fn, *a, **kw)
    return wrapper


def _build_mcp() -> FastMCP:
    if not HTTP_MODE:
        return FastMCP("teamspace")
    from oauth_provider import DEFAULT_REDIRECT_HOSTS, KeyAuthProvider

    public = os.environ.get("MCP_PUBLIC_URL", "").rstrip("/")
    if not public.startswith("https://") and not public.startswith("http://localhost"):
        sys.exit("MCP_PUBLIC_URL must be the public https:// URL of this server (http://localhost allowed for local tests).")
    redirect_hosts = tuple(
        h.strip().lower() for h in os.environ.get("MCP_ALLOWED_REDIRECT_HOSTS", "").split(",") if h.strip()
    ) or DEFAULT_REDIRECT_HOSTS
    provider = KeyAuthProvider(
        backend_url=BASE_URL,
        public_url=public,
        db_path=os.environ.get("MCP_DB_PATH", "./mcp_oauth.db"),
        allowed_roles=tuple(ROLE_TOOLS),
        redirect_hosts=redirect_hosts,
    )
    host = urlparse(public).netloc
    server = FastMCP(
        "teamspace",
        host=os.environ.get("MCP_HOST", "0.0.0.0"),
        port=int(os.environ.get("MCP_PORT") or os.environ.get("PORT") or 8080),
        stateless_http=True,  # no per-session server state: works behind load balancers and restarts
        json_response=True,
        auth_server_provider=provider,
        auth=AuthSettings(
            issuer_url=public,
            resource_server_url=f"{public}/mcp",
            client_registration_options=ClientRegistrationOptions(enabled=True),
            validate_token_resource=False,
        ),
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[host, *[h.strip() for h in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]],
            allowed_origins=[public, "https://chatgpt.com", "https://chat.openai.com", "https://claude.ai"],
        ),
    )
    server.custom_route("/connect", methods=["GET", "POST"])(provider.connect_page)

    @server.custom_route("/health", methods=["GET"])
    async def health(_request):
        from starlette.responses import JSONResponse

        return JSONResponse({"status": "ok"})

    return server


mcp = _build_mcp()


# ---------------------------------------------------------------- read tools


@mcp.tool()
@guarded
def whoami() -> dict:
    """Show which TeamSpace user and organization this agent is acting as."""
    me = _call("GET", "/auth/me")
    return {"user": me["user"]["name"], "email": me["user"]["email"], "organization": me["organization"]["name"]}


@mcp.tool()
@guarded
def list_teams() -> list[dict]:
    """List teams in the organization, and whether the user is a member."""
    return [{"id": t["id"], "name": t["name"], "is_member": t["is_member"], "my_role": t.get("my_role")} for t in _call("GET", "/teams")]


@mcp.tool()
@guarded
def list_channels(team: str) -> list[dict]:
    """List channels of a team. `team` is a team name or id."""
    t = _resolve_team(team)
    return [{"id": c["id"], "name": c["name"], "team": t["name"]} for c in _call("GET", f"/teams/{t['id']}/channels")]


@mcp.tool()
@guarded
def list_team_members(team: str) -> list[dict]:
    """List members of a team (name, email, id). `team` is a name or id."""
    t = _resolve_team(team)
    return _call("GET", f"/teams/{t['id']}/members")


@mcp.tool()
@guarded
def read_messages(channel: str, team: Optional[str] = None, limit: int = 20) -> list[dict]:
    """Read the most recent messages of a channel (oldest first).
    `channel` is a name or id; give `team` if the name exists in several teams."""
    c = _resolve_channel(channel, team)
    rows = _call("GET", f"/channels/{c['id']}/messages")
    limit = max(1, min(limit, 100))
    return [
        {"id": m["id"], "from": m.get("user_name"), "at": m.get("created_at"), "text": m.get("content")}
        for m in rows[-limit:]
    ]


@mcp.tool()
@guarded
def summarize_channel(channel: str, team: Optional[str] = None) -> dict:
    """TeamSpace's built-in recap of a channel (keywords + key messages)."""
    c = _resolve_channel(channel, team)
    return _call("GET", f"/channels/{c['id']}/summary")


@mcp.tool()
@guarded
def list_events(team: Optional[str] = None, days_ahead: int = 14) -> list[dict]:
    """List calendar events starting from now. With `team`, that team's
    calendar; without it, the user's personal calendar. Times are UTC ISO."""
    now = datetime.now(timezone.utc)
    params = {"start": now.isoformat(), "end": (now + timedelta(days=max(1, min(days_ahead, 365)))).isoformat()}
    path = f"/teams/{_resolve_team(team)['id']}/events" if team else "/calendar/events"
    return [
        {"id": e["id"], "title": e["title"], "start": e["start_time"], "end": e["end_time"], "team": e.get("team_name"), "location": e.get("location")}
        for e in _call("GET", path, params=params)
    ]


@mcp.tool()
@guarded
def list_files(channel: str, team: Optional[str] = None) -> list[dict]:
    """List files shared in a channel."""
    c = _resolve_channel(channel, team)
    return _call("GET", f"/channels/{c['id']}/files")


# --------------------------------------------------------------- write tools


@mcp.tool()
@guarded
def create_team(name: str) -> dict:
    """Create a new team (a #general channel is added automatically). The
    user becomes its owner."""
    t = _call("POST", "/teams", json={"name": name})
    return {"id": t["id"], "name": t["name"]}


@mcp.tool()
@guarded
def create_channel(team: str, name: str) -> dict:
    """Create a channel inside a team the user belongs to."""
    t = _resolve_team(team)
    c = _call("POST", f"/teams/{t['id']}/channels", json={"name": name})
    return {"id": c["id"], "name": c["name"], "team": t["name"]}


async def _ws_send(channel_id: str, text: str) -> None:
    ws_base = os.environ.get("TEAMSPACE_WS_URL") or BASE_URL.replace("http", "ws", 1)
    token = _request_token() or _token or _login()
    async with websockets.connect(f"{ws_base}/ws/channels/{channel_id}?token={token}", open_timeout=TIMEOUT) as ws:
        await ws.send(json.dumps({"type": "message", "content": text}))
        # The server echoes new messages to open sockets; wait briefly for the
        # echo so a rejected send (closed socket) surfaces as an error.
        try:
            await asyncio.wait_for(ws.recv(), timeout=5)
        except asyncio.TimeoutError:
            pass


@mcp.tool()
@guarded
async def send_message(channel: str, text: str, team: Optional[str] = None) -> dict:
    """Post a chat message to a channel as the logged-in user. This is visible
    to everyone in the channel, so only send what the user asked for."""
    c = await asyncio.to_thread(_resolve_channel, channel, team)
    if not text.strip():
        raise TeamSpaceError("Message is empty.")
    if len(text) > 4000:
        raise TeamSpaceError("Message is longer than 4000 characters.")
    try:
        await _ws_send(c["id"], text)
    except websockets.exceptions.InvalidStatus as e:
        raise TeamSpaceError(f"Could not open the channel connection ({e.response.status_code}).")
    except websockets.exceptions.ConnectionClosed as e:
        raise TeamSpaceError(f"Message rejected (connection closed, code {e.rcvd.code if e.rcvd else '?'}).")
    except OSError as e:
        raise TeamSpaceError(f"Cannot reach TeamSpace websocket: {e.__class__.__name__}")
    # Verify rather than assume: confirm it is now in the channel history.
    recent = await asyncio.to_thread(_call, "GET", f"/channels/{c['id']}/messages")
    ok = any(m.get("content") == text for m in recent[-5:])
    return {"sent": ok, "channel": c["name"], "team": c["team_name"]}


@mcp.tool()
@guarded
def create_event(
    title: str,
    start: str,
    duration_minutes: int = 60,
    team: Optional[str] = None,
    description: Optional[str] = None,
    location: Optional[str] = None,
    attendee_emails: Optional[list[str]] = None,
    timezone_name: Optional[str] = None,
) -> dict:
    """Create a calendar event. `start` is local ISO date-time like
    '2026-11-20T10:00' (interpreted in `timezone_name`, default the user's
    zone, Asia/Kolkata). With `team` it goes on that team's calendar
    (visible to the team); otherwise it is a personal event. Convert phrases
    like "tomorrow at 10" into an explicit date first. `attendee_emails`
    must belong to people in the organization; attendees get notified."""
    try:
        tz = ZoneInfo(timezone_name or DEFAULT_TZ)
    except Exception:
        raise TeamSpaceError(f"Unknown timezone '{timezone_name}'.")
    try:
        start_dt = datetime.fromisoformat(start)
    except ValueError:
        raise TeamSpaceError("start must look like 2026-11-20T10:00")
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=tz)
    if not 1 <= duration_minutes <= 24 * 60:
        raise TeamSpaceError("duration_minutes must be between 1 and 1440.")
    body = {
        "title": title,
        "description": description,
        "location": location,
        "start_time": start_dt.astimezone(timezone.utc).isoformat(),
        "end_time": (start_dt + timedelta(minutes=duration_minutes)).astimezone(timezone.utc).isoformat(),
    }
    if attendee_emails:
        people = _call("GET", "/people")
        by_email = {p["email"].lower(): p["id"] for p in people}
        unknown = [e for e in attendee_emails if e.lower() not in by_email]
        if unknown:
            raise TeamSpaceError(f"Not in this organization: {', '.join(unknown)}")
        body["attendee_user_ids"] = [by_email[e.lower()] for e in attendee_emails]
    path = f"/teams/{_resolve_team(team)['id']}/events" if team else "/calendar/events"
    e = _call("POST", path, json=body)
    return {"id": e["id"], "title": e["title"], "start": e["start_time"], "end": e["end_time"], "team": e.get("team_name")}


@mcp.tool()
@guarded
def delete_event(event_id: str, team: Optional[str] = None) -> dict:
    """DELETE a calendar event permanently (only its creator can). Confirm
    with the user before calling this."""
    path = f"/teams/{_resolve_team(team)['id']}/events/{event_id}" if team else f"/calendar/events/{event_id}"
    _call("DELETE", path)
    return {"deleted": event_id}


if __name__ == "__main__":
    if urlparse(BASE_URL).scheme not in ("http", "https"):
        sys.exit("TEAMSPACE_URL must start with http:// or https://")
    if HTTP_MODE:
        import uvicorn
        from oauth_provider import RegistrationCompat

        # Run uvicorn ourselves (instead of mcp.run) so we can add the
        # registration compatibility layer and honour X-Forwarded-* headers
        # from the TLS-terminating proxy in front of us.
        uvicorn.run(
            RegistrationCompat(mcp.streamable_http_app()),
            host=mcp.settings.host,
            port=mcp.settings.port,
            proxy_headers=True,
            forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"),
            log_level="info",
        )
    else:
        mcp.run()
