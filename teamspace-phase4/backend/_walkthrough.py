import asyncio
import json
import requests
import websockets

BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

PLATFORM_ADMIN = {"email": "khadar@rooman.com", "password": "CHANGE_ME", "org_slug": "rooman"}
ORG_ADMIN = {"email": "admin@walkthrough-demo.com", "password": "TestAdmin-63od3m5v", "org_slug": "walkthrough-demo"}
MEMBER = {"email": "member@walkthrough-demo.com", "password": "Vi9kbChH67xj", "org_slug": "walkthrough-demo"}

report = []


def note(section, line):
    report.append(f"[{section}] {line}")
    print(f"[{section}] {line}")


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds)
    r.raise_for_status()
    return r.json()["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Platform admin ----------------
note("PLATFORM", "logging in...")
pa_token = login(PLATFORM_ADMIN)
note("PLATFORM", "login OK")

r = requests.get(f"{BASE}/admin/organizations", headers=h(pa_token))
note("PLATFORM", f"GET /admin/organizations -> {r.status_code}, {len(r.json())} orgs")
orgs = r.json()
wt_org = next(o for o in orgs if o["slug"] == "walkthrough-demo")
note("PLATFORM", f"walkthrough-demo suspended={wt_org.get('suspended')}, pending_invoices={wt_org.get('pending_invoice_count')}")

r = requests.get(f"{BASE}/admin/organizations/{wt_org['id']}/invoices", headers=h(pa_token))
note("PLATFORM", f"GET invoices for walkthrough-demo -> {r.status_code}, {len(r.json())} invoices")

r = requests.post(
    f"{BASE}/admin/organizations/{wt_org['id']}/invoices",
    json={"description": "Walkthrough test invoice", "amount_cents": 4900, "due_date": "2026-12-01"},
    headers=h(pa_token),
)
note("PLATFORM", f"POST create invoice -> {r.status_code}")
invoice = r.json()

r = requests.post(
    f"{BASE}/admin/organizations/{wt_org['id']}/invoices/{invoice['id']}/mark-paid",
    headers=h(pa_token),
)
note("PLATFORM", f"POST mark-paid -> {r.status_code}, status={r.json().get('status')}")

r = requests.post(f"{BASE}/admin/organizations/{wt_org['id']}/suspend", json={"reason": "walkthrough test"}, headers=h(pa_token))
note("PLATFORM", f"POST suspend -> {r.status_code}, suspended_at={r.json().get('suspended_at')}")

# verify a member of a suspended org is blocked (402)
member_token_pre = login(MEMBER)
r = requests.get(f"{BASE}/organization/members", headers=h(member_token_pre))
note("PLATFORM", f"suspended org member hits GET /organization/members -> {r.status_code} (expect 402)")

r = requests.post(f"{BASE}/admin/organizations/{wt_org['id']}/reactivate", headers=h(pa_token))
note("PLATFORM", f"POST reactivate -> {r.status_code}, suspended_at={r.json().get('suspended_at')}")

# non-platform-admin blocked from /admin
oa_token_check = login(ORG_ADMIN)
r = requests.get(f"{BASE}/admin/organizations", headers=h(oa_token_check))
note("PLATFORM", f"org_admin (non-platform) hits GET /admin/organizations -> {r.status_code} (deliberately 404, not 403, to not reveal the admin API exists)")

# ---------------- Org admin ----------------
note("ORG_ADMIN", "logging in...")
oa_token = login(ORG_ADMIN)
note("ORG_ADMIN", "login OK")

r = requests.get(f"{BASE}/organization/members", headers=h(oa_token))
note("ORG_ADMIN", f"GET /organization/members -> {r.status_code}, {len(r.json())} members")

r = requests.get(f"{BASE}/organization/invite", headers=h(oa_token))
note("ORG_ADMIN", f"GET /organization/invite -> {r.status_code}, code={r.json().get('invite_code')}")

r = requests.post(f"{BASE}/organization/invite/regenerate", json={}, headers=h(oa_token))
note("ORG_ADMIN", f"POST /organization/invite/regenerate -> {r.status_code}")

r = requests.get(f"{BASE}/organization/activity", headers=h(oa_token))
note("ORG_ADMIN", f"GET /organization/activity -> {r.status_code}, {len(r.json())} events")

import uuid
team_name = f"Engineering-{uuid.uuid4().hex[:6]}"
r = requests.post(f"{BASE}/teams", json={"name": team_name}, headers=h(oa_token))
note("ORG_ADMIN", f"POST /teams -> {r.status_code} (auto-creates a 'general' channel)")
team = r.json()

r = requests.post(f"{BASE}/teams/{team['id']}/channels", json={"name": "incidents"}, headers=h(oa_token))
note("ORG_ADMIN", f"POST /teams/{{id}}/channels (new channel 'incidents') -> {r.status_code}")
channel = r.json()

# duplicate-name guard sanity check (expected 400)
r = requests.post(f"{BASE}/teams/{team['id']}/channels", json={"name": "general"}, headers=h(oa_token))
note("ORG_ADMIN", f"POST duplicate channel name 'general' -> {r.status_code} (expect 400, dup guard works)")

r = requests.get(f"{BASE}/teams", headers=h(oa_token))
note("ORG_ADMIN", f"GET /teams -> {r.status_code}, {len(r.json())} teams")

# ---------------- Member ----------------
note("MEMBER", "logging in...")
m_token = login(MEMBER)
note("MEMBER", "login OK")

r = requests.get(f"{BASE}/teams", headers=h(m_token))
note("MEMBER", f"GET /teams (before joining) -> {r.status_code}, {len(r.json())} teams visible")

r = requests.post(f"{BASE}/teams/{team['id']}/join", headers=h(m_token))
note("MEMBER", f"POST /teams/{{id}}/join -> {r.status_code}")

r = requests.get(f"{BASE}/teams/{team['id']}/channels", headers=h(m_token))
note("MEMBER", f"GET channels after joining -> {r.status_code}, {len(r.json())} channels")

r = requests.get(f"{BASE}/channels/{channel['id']}/messages", headers=h(m_token))
note("MEMBER", f"GET /channels/{{id}}/messages -> {r.status_code}, {len(r.json())} messages")

# calendar
r = requests.post(
    f"{BASE}/teams/{team['id']}/events",
    json={"title": "Standup", "start_time": "2026-11-12T09:00:00Z", "end_time": "2026-11-12T09:15:00Z"},
    headers=h(m_token),
)
note("MEMBER", f"POST /teams/{{id}}/events -> {r.status_code}")

r = requests.get(f"{BASE}/teams/{team['id']}/events", headers=h(m_token))
note("MEMBER", f"GET /teams/{{id}}/events -> {r.status_code}, {len(r.json())} events")

# file upload
with open("/tmp/walkthrough_test_file.txt", "w") as f:
    f.write("hello from the walkthrough\n")
with open("/tmp/walkthrough_test_file.txt", "rb") as f:
    r = requests.post(
        f"{BASE}/channels/{channel['id']}/files",
        files={"file": ("walkthrough_test_file.txt", f, "text/plain")},
        headers=h(m_token),
    )
note("MEMBER", f"POST /channels/{{id}}/files (upload) -> {r.status_code}")
uploaded = r.json() if r.status_code == 201 else None

r = requests.get(f"{BASE}/channels/{channel['id']}/files", headers=h(m_token))
note("MEMBER", f"GET /channels/{{id}}/files -> {r.status_code}, {len(r.json())} files")

if uploaded:
    r = requests.get(f"{BASE}/files/{uploaded['id']}/download", headers=h(m_token))
    note("MEMBER", f"GET /files/{{id}}/download -> {r.status_code}, {len(r.content)} bytes")

# video token
r = requests.post(f"{BASE}/channels/{channel['id']}/video-token", headers=h(m_token))
note("MEMBER", f"POST /channels/{{id}}/video-token -> {r.status_code}, has_token={'token' in r.json()}")

# websocket chat: send a couple of messages, then test AI summary
async def chat_over_ws():
    uri = f"{WS_BASE}/ws/channels/{channel['id']}?token={m_token}"
    try:
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({"content": "Hey team, deploy went out fine."}))
            await ws.send(json.dumps({"content": "Noticed elevated latency on the API after deploy."}))
            await asyncio.sleep(0.5)
            msgs = []
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    msgs.append(msg)
            except asyncio.TimeoutError:
                pass
            return msgs
    except Exception as e:
        return f"ERROR: {e}"

ws_result = asyncio.run(chat_over_ws())
note("MEMBER", f"WebSocket chat round-trip -> received {len(ws_result) if isinstance(ws_result, list) else ws_result}")

r = requests.get(f"{BASE}/channels/{channel['id']}/messages", headers=h(m_token))
note("MEMBER", f"GET messages after ws send -> {r.status_code}, {len(r.json())} messages")

r = requests.get(f"{BASE}/channels/{channel['id']}/summary", headers=h(m_token))
note("MEMBER", f"GET /channels/{{id}}/summary (AI recap) -> {r.status_code}, keys={list(r.json().keys()) if r.status_code==200 else r.text}")

# forgot-password check (expect 404, not implemented)
r = requests.post(f"{BASE}/auth/forgot-password", json={"email": MEMBER["email"]})
note("MEMBER", f"POST /auth/forgot-password (expect 404, not built) -> {r.status_code}")

print("\n\n=== FULL REPORT ===")
for line in report:
    print(line)
