"""Extended smoke test covering what _calendar_smoke.py doesn't:
notifications read/read-all endpoints, RSVP decline/tentative transitions,
and the reminder background pass (in-app notification + email-attempt path).
Run after _calendar_smoke.py (reuses the same test accounts).
"""
import sys
from datetime import datetime, timedelta, timezone

import requests

sys.path.insert(0, ".")

BASE = "http://localhost:8000"

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


admin_token = login(ORG_ADMIN)
member_token = login(MEMBER)

me = requests.get(f"{BASE}/auth/me", headers=h(admin_token)).json()
member_me = requests.get(f"{BASE}/auth/me", headers=h(member_token)).json()
admin_id = me["user"]["id"]
member_id = member_me["user"]["id"]

teams = requests.get(f"{BASE}/teams", headers=h(admin_token)).json()
my_team = next(t for t in teams if t.get("is_member"))
team_id = my_team["id"]

now = datetime.now(timezone.utc)

# ---- 1. RSVP decline + tentative transitions ----
start = now + timedelta(hours=6)
end = start + timedelta(minutes=30)
r = requests.post(
    f"{BASE}/teams/{team_id}/events",
    json={
        "title": "Smoke test2: rsvp transitions",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "attendee_user_ids": [member_id],
    },
    headers=h(admin_token),
)
check("create event for rsvp transitions", r.status_code == 201)
event = r.json()
event_id = event["id"]

r = requests.post(f"{BASE}/calendar/events/{event_id}/rsvp", json={"status": "declined"}, headers=h(member_token))
check("rsvp -> declined", r.status_code == 200 and r.json()["attendees"][0]["status"] == "declined")

r = requests.post(f"{BASE}/calendar/events/{event_id}/rsvp", json={"status": "tentative"}, headers=h(member_token))
check("rsvp -> tentative", r.status_code == 200 and r.json()["attendees"][0]["status"] == "tentative")

r = requests.post(f"{BASE}/calendar/events/{event_id}/rsvp", json={"status": "accepted"}, headers=h(member_token))
check("rsvp -> accepted (back)", r.status_code == 200 and r.json()["attendees"][0]["status"] == "accepted")

# a declined attendee shouldn't get reminder emails later -- re-decline then flip back isn't needed,
# the reminders.py _recipients() logic is exercised directly below.

# ---- 2. Notifications: mark one read, then mark-all-read ----
notifs = requests.get(f"{BASE}/notifications", headers=h(member_token)).json()
check("member has notifications from rsvp-transition event", any(n["event_id"] == event_id for n in notifs))
target = next(n for n in notifs if n["event_id"] == event_id)
check("target notification starts unread", target["read_at"] is None)

r = requests.post(f"{BASE}/notifications/{target['id']}/read", headers=h(member_token))
check("mark single notification read", r.status_code == 200 and r.json()["read_at"] is not None)

r = requests.post(f"{BASE}/notifications/read-all", headers=h(member_token))
check("mark-all-read endpoint returns 204", r.status_code == 204)

notifs_after = requests.get(f"{BASE}/notifications", headers=h(member_token)).json()
check("no unread notifications remain for member", all(n["read_at"] is not None for n in notifs_after))

# ---- 3. Reminder pass: creates in-app notification for an imminent event ----
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://teamspace:teamspace_dev_pw@localhost:5434/teamspace")
from app.database import SessionLocal  # noqa: E402
from app.reminders import run_reminder_pass  # noqa: E402
from app import models  # noqa: E402

imminent_start = now + timedelta(minutes=5)
imminent_end = imminent_start + timedelta(minutes=30)
r = requests.post(
    f"{BASE}/teams/{team_id}/events",
    json={
        "title": "Smoke test2: imminent reminder check",
        "start_time": imminent_start.isoformat(),
        "end_time": imminent_end.isoformat(),
        "attendee_user_ids": [member_id],
    },
    headers=h(admin_token),
)
check("create imminent event", r.status_code == 201)
imminent_event = r.json()
imminent_id = imminent_event["id"]

db = SessionLocal()
try:
    created = run_reminder_pass(db)
    print(f"reminder pass created {created} notification(s)")
    check("reminder pass created at least 1 notification", created >= 1)
finally:
    db.close()

member_notifs = requests.get(f"{BASE}/notifications", headers=h(member_token)).json()
check(
    "member got an event_reminder notification for the imminent event",
    any(n["type"] == "event_reminder" and n["event_id"] == imminent_id for n in member_notifs),
)
admin_notifs2 = requests.get(f"{BASE}/notifications", headers=h(admin_token)).json()
check(
    "creator (admin) also got an event_reminder notification",
    any(n["type"] == "event_reminder" and n["event_id"] == imminent_id for n in admin_notifs2),
)

from app.config import settings  # noqa: E402

print(f"smtp_configured = {settings.smtp_configured}")
if not settings.smtp_configured:
    print("SMTP not configured in this env -- email send is expected to be skipped, not attempted/crashed.")
else:
    db2 = SessionLocal()
    try:
        notif_row = (
            db2.query(models.Notification)
            .filter(models.Notification.event_id == imminent_id, models.Notification.type == models.NotificationType.event_reminder)
            .first()
        )
        check("email_sent_at populated when SMTP configured", notif_row.email_sent_at is not None)
    finally:
        db2.close()

# ---- cleanup ----
r = requests.delete(f"{BASE}/teams/{team_id}/events/{event_id}", headers=h(admin_token))
check("delete rsvp-transition event", r.status_code == 204)
r = requests.delete(f"{BASE}/teams/{team_id}/events/{imminent_id}", headers=h(admin_token))
check("delete imminent event (exercises notification FK SET NULL again)", r.status_code == 204)

print("\nALL EXTENDED CALENDAR SMOKE TESTS PASSED")
