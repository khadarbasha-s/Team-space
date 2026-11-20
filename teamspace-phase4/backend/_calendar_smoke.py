import json
from datetime import datetime, timedelta, timezone

import requests

BASE = "http://localhost:8000"

PLATFORM_ADMIN = {"email": "khadar@rooman.com", "password": "CHANGE_ME", "org_slug": "rooman"}
ORG_ADMIN = {"email": "admin@walkthrough-demo.com", "password": "TestAdmin-63od3m5v", "org_slug": "walkthrough-demo"}
MEMBER = {"email": "member@walkthrough-demo.com", "password": "Vi9kbChH67xj", "org_slug": "walkthrough-demo"}


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds)
    r.raise_for_status()
    return r.json()["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


def check(label, cond):
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        raise SystemExit(f"Smoke test failed at: {label}")


# Make sure the walkthrough org isn't suspended from a previous run.
pa_token = login(PLATFORM_ADMIN)
orgs = requests.get(f"{BASE}/admin/organizations", headers=h(pa_token)).json()
wt_org = next(o for o in orgs if o["slug"] == "walkthrough-demo")
if wt_org.get("suspended"):
    r = requests.post(f"{BASE}/admin/organizations/{wt_org['id']}/unsuspend", headers=h(pa_token))
    print("un-suspended walkthrough-demo:", r.status_code)

admin_token = login(ORG_ADMIN)
member_token = login(MEMBER)

me = requests.get(f"{BASE}/auth/me", headers=h(admin_token)).json()
member_me = requests.get(f"{BASE}/auth/me", headers=h(member_token)).json()
admin_id = me["user"]["id"]
member_id = member_me["user"]["id"]
print("admin_id", admin_id, "member_id", member_id)

teams = requests.get(f"{BASE}/teams", headers=h(admin_token)).json()
my_team = next(t for t in teams if t.get("is_member"))
team_id = my_team["id"]
print("team_id", team_id, my_team["name"])

now = datetime.now(timezone.utc)

# ---- 1. Team event with attendee + RSVP ----
start = now + timedelta(hours=2)
end = start + timedelta(hours=1)
payload = {
    "title": "Smoke test: planning sync",
    "description": "created by calendar smoke test",
    "start_time": start.isoformat(),
    "end_time": end.isoformat(),
    "attendee_user_ids": [member_id],
    "enable_video": True,
}
r = requests.post(f"{BASE}/teams/{team_id}/events", json=payload, headers=h(admin_token))
check("create team event with attendee+video", r.status_code == 201)
event = r.json()
print(json.dumps(event, indent=2)[:800])
check("event has video_room", bool(event.get("video_room")))
check("event has 1 attendee", len(event["attendees"]) == 1)
check("attendee status is invited", event["attendees"][0]["status"] == "invited")
event_id = event["id"]

# member should see an invite notification
notifs = requests.get(f"{BASE}/notifications", headers=h(member_token)).json()
check("member got an invite notification", any(n["type"] == "event_invite" and n["event_id"] == event_id for n in notifs))

# ---- 2. RSVP as member ----
r = requests.post(f"{BASE}/calendar/events/{event_id}/rsvp", json={"status": "accepted"}, headers=h(member_token))
check("member RSVP accepted", r.status_code == 200 and r.json()["attendees"][0]["status"] == "accepted")

admin_notifs = requests.get(f"{BASE}/notifications", headers=h(admin_token)).json()
check("admin got an rsvp_update notification", any(n["type"] == "rsvp_update" and n["event_id"] == event_id for n in admin_notifs))

# ---- 3. Join video (token mint) ----
r = requests.post(f"{BASE}/calendar/events/{event_id}/video-token", headers=h(member_token))
check("member can get video token for event", r.status_code == 200 and r.json()["room"] == event["video_room"])

# ---- 4. Recurring event (weekly) + occurrence expansion ----
rec_start = now + timedelta(days=1, hours=3)
rec_end = rec_start + timedelta(minutes=30)
rec_payload = {
    "title": "Smoke test: weekly standup",
    "start_time": rec_start.isoformat(),
    "end_time": rec_end.isoformat(),
    "recurrence": {"freq": "weekly", "interval": 1, "count": 5},
}
r = requests.post(f"{BASE}/teams/{team_id}/events", json=rec_payload, headers=h(admin_token))
check("create recurring weekly event", r.status_code == 201)
rec_event = r.json()
check("recurrence description present", "Repeats weekly" in (rec_event["recurrence"]["description"] or ""))

window_start = now.isoformat()
window_end = (now + timedelta(days=45)).isoformat()
r = requests.get(
    f"{BASE}/teams/{team_id}/events", params={"start": window_start, "end": window_end}, headers=h(admin_token)
)
check("list team events ok", r.status_code == 200)
all_events = r.json()
rec_occurrences = [e for e in all_events if e["id"] == rec_event["id"]]
check(f"recurring event expanded into multiple occurrences (got {len(rec_occurrences)})", len(rec_occurrences) >= 3)

# ---- 5. Custom recurrence (Mon/Wed/Fri) ----
custom_start = now + timedelta(days=2, hours=5)
custom_end = custom_start + timedelta(minutes=45)
custom_payload = {
    "title": "Smoke test: MWF office hours",
    "start_time": custom_start.isoformat(),
    "end_time": custom_end.isoformat(),
    "recurrence": {"freq": "custom", "days_of_week": ["MO", "WE", "FR"], "count": 6},
}
r = requests.post(f"{BASE}/teams/{team_id}/events", json=custom_payload, headers=h(admin_token))
check("create custom MWF recurring event", r.status_code == 201)

# ---- 6. Personal calendar ----
personal_start = now + timedelta(hours=5)
personal_end = personal_start + timedelta(minutes=30)
r = requests.post(
    f"{BASE}/calendar/events",
    json={"title": "Smoke test: personal errand", "start_time": personal_start.isoformat(), "end_time": personal_end.isoformat()},
    headers=h(admin_token),
)
check("create personal event", r.status_code == 201)
personal_event = r.json()
check("personal event has no team_id", personal_event["team_id"] is None and personal_event["is_personal"] is True)

r = requests.get(f"{BASE}/calendar/events", headers=h(admin_token))
check("list personal events includes it", any(e["id"] == personal_event["id"] for e in r.json()))

r = requests.get(f"{BASE}/calendar/events", headers=h(member_token))
check("personal event NOT visible to another user", not any(e["id"] == personal_event["id"] for e in r.json()))

# ---- 7. Scheduling assistant / availability ----
r = requests.get(
    f"{BASE}/calendar/availability",
    params={"user_ids": f"{admin_id},{member_id}", "start": window_start, "end": window_end},
    headers=h(admin_token),
)
check("availability endpoint ok", r.status_code == 200)
avail = r.json()
admin_avail = next(a for a in avail if a["user_id"] == admin_id)
member_avail = next(a for a in avail if a["user_id"] == member_id)
check("admin shows busy for the smoke-test meeting", any("planning sync" in b["title"] for b in admin_avail["busy"]))
check("member shows busy for the smoke-test meeting (as accepted attendee)", any("planning sync" in b["title"] for b in member_avail["busy"]))

# ---- 8. Delete cleanup ----
r = requests.delete(f"{BASE}/teams/{team_id}/events/{event_id}", headers=h(admin_token))
check("delete team event", r.status_code == 204)
r = requests.delete(f"{BASE}/teams/{team_id}/events/{rec_event['id']}", headers=h(admin_token))
check("delete recurring event", r.status_code == 204)
r = requests.delete(f"{BASE}/calendar/events/{personal_event['id']}", headers=h(admin_token))
check("delete personal event", r.status_code == 204)

print("\nALL CALENDAR SMOKE TESTS PASSED")
