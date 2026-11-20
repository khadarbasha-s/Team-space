# TeamSpace -- Phase 1 + Phase 2 + Phase 3 + Phase 4 + Platform Admin

A working, multi-tenant Slack/Teams-style app: organizations, teams, channels,
real-time chat, group video calling with screen share, file sharing, a team
calendar, and a local AI-style channel recap. Phase 1 (chat/channels), Phase 2
(group video, "Months 4-6: Group video (managed)"), Phase 3 (files +
calendar, "Months 7-8: Files+calendar"), and Phase 4 (the roadmap's looser
"SFU+AI (optional)" phase -- screen sharing as the SFU extension, plus a
local channel-recap feature standing in for "AI") are all built and tested
here, standalone, so it can grow into its own product. On top of that, a
platform-admin layer adds a root-level view across every organization,
manual billing/invoices, and the ability to actually suspend (and
reactivate) a non-paying org's access -- see "How the platform-admin console
actually works" below.

Stack: **FastAPI + SQLAlchemy + PostgreSQL** (backend), **React + Vite**
(frontend), **WebSockets** for real-time chat, **JWT** for auth, **LiveKit**
(WebRTC SFU) for group video + screen share, local disk storage for files
(Phase 3), a local word-frequency summarizer for channel recaps (Phase 4).

## What's actually working

- Multi-tenant signup: create a brand-new organization (you become its org
  admin) or join an existing one by its slug.
- JWT login, scoped to one organization.
- Create teams; the creator becomes the team's owner, with a `general`
  channel created automatically.
- Join a team as a member; create more channels within a team you belong to.
- Real-time chat over WebSockets, with messages persisted to Postgres and
  loaded as history when you open a channel.
- **Group video calls, per channel**: a "Start/Join video call" button in any
  channel mints a scoped LiveKit access token for that user (same
  tenant+membership check as chat) and joins a WebRTC room named after the
  channel. Multiple participants publish camera+mic and see every other
  participant's live video tile; leaving the call tears the connection down
  cleanly for everyone else still in it.
- **File sharing, per channel**: upload a file from the channel's "Files"
  tab (toggled next to "Messages" in the channel header); it's stored on
  disk, recorded in Postgres, and visible/downloadable by anyone else who
  can see that channel, with the original bytes verified to round-trip
  exactly.
- **Team calendar**: a new "Calendar" item in the left nav rail lets any
  team member schedule an event (title, optional description, start/end
  time) visible to the whole team; only the event's creator can delete it.
  Events are scoped to the team the same way channels are.
- **Screen sharing in calls**: a "Share screen"/"Stop sharing" toggle in the
  call header publishes a second, distinctly-bordered video track to
  everyone else in the call, labeled "`<name>`'s screen", alongside (not
  replacing) everyone's camera tiles. Stopping it -- whether from the
  in-app button or the browser's own native "Stop sharing" bar -- cleanly
  removes the tile for everyone.
- **AI channel recap**: a third tab ("AI Recap") next to "Messages"/"Files"
  in any channel gives a quick-read summary of that channel's messages: a
  message/participant count, the most-repeated non-generic keywords as
  chips, and the handful of messages that carry the most real signal,
  pulled out in chronological order. See "How the AI recap actually works"
  below for exactly what this is (and isn't).
- Multi-tenant isolation enforced at every layer, including video, files,
  calendar, and the recap endpoint: every query is scoped to the current
  user's organization, a channel/file/team in another org returns 404 (not
  403 -- it never reveals that it exists), and a cross-tenant WebSocket
  connection is rejected before it's accepted. This was tested directly,
  not assumed (see "What was tested" below).
- **Platform admin console**: a user flagged `is_platform_admin` gets a new
  "Admin" nav item and `/admin` page listing every organization on the
  platform with its plan, member count, and a live billing status (Active /
  Overdue / Suspended). From there an admin can create a manual invoice for
  an org, mark one paid, and suspend or reactivate the org outright --
  suspending it immediately blocks every non-admin member's REST requests
  (402) and chat WebSocket connections (even ones already open, closed with
  code 4402) across every business router, with a clear "this workspace is
  suspended" screen shown to blocked members until an admin reactivates it.

## How video calling actually works

`POST /channels/{channel_id}/video-token` reuses `access.py`'s tenant +
team-membership check (the same one `/channels/{id}/messages` and the chat
websocket use), then mints a LiveKit JWT via the `livekit-api` package,
scoped to `room_join` on room `channel-{channel_id}` for that one user. The
frontend (`livekit-client`) takes that token + the LiveKit URL, connects,
publishes the local camera/mic, and renders a tile per participant as
tracks are subscribed/unsubscribed.

This sandbox has no account/payment access to a managed video API (LiveKit
Cloud, Daily, etc.), so Phase 2 runs against a **self-hosted open-source
LiveKit server** (`backend/bin/livekit-server`, config in
`backend/livekit.yaml`) as a stand-in. This is a disclosed, reversible
simplification, not a different architecture: the client/server SDK and
signaling protocol are identical to a managed LiveKit Cloud deployment --
switching later is only `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
`LIVEKIT_API_SECRET` changing to point at the managed service, with zero
application code changes.

## How the AI recap actually works

`GET /channels/{channel_id}/summary` reuses the same tenant + membership
check as everything else, pulls the channel's recent messages, and runs them
through `backend/app/ai_summary.py`: a frequency-weighted extractive
summarizer. It tokenizes every message, drops a stopword list (including
common chat filler like "lol", "ok", "thanks"), counts how often each
remaining word appears across the whole conversation, and scores each
message by how much of that repeated, non-generic vocabulary it uses. The
top-scoring words become the keyword chips; the top-scoring messages (only
ones that actually score above zero -- a short, all-filler conversation
yields fewer highlights, not padded-out junk ones) become the highlights, in
original chronological order.

**This is not a call to an LLM.** This sandbox has no account or API key for
a managed LLM (OpenAI, Anthropic, etc.) -- the same kind of access gap that
led Phase 2 to self-host LiveKit instead of a managed video API. Unlike
video, there's no practical self-hosted substitute for a capable LLM here
(no GPU, and pulling a multi-gigabyte model into this sandbox isn't
reasonable), so rather than fake a "powered by AI" response, this is an
honest, classic, zero-dependency NLP technique that really runs on every
request and really reflects that channel's actual words -- disclosed as
such directly in the UI ("generated locally... not an external AI model").
It's written so a real LLM can be swapped in later (`ai_summary.py`'s
`summarize_messages` is the one function to replace; the router and
frontend wouldn't need to change) once there's a real provider and key to
point at.

## How the platform-admin console actually works

`is_platform_admin` is a boolean on `User`, orthogonal to the existing
`org_role`/`org_id` -- it's a platform-level role, not a tenant one, and it
bypasses every tenant/suspension check rather than fitting inside them.
`require_platform_admin` (in `app/routers/admin.py`) gates all six
`/admin/*` endpoints and, like `access.py`'s tenant checks, returns 404 (not
403) for a non-admin caller, so a regular user can't even learn the
platform-admin API exists.

Billing is modeled as a provider-agnostic `Invoice` row (`org_id`,
description, `amount_cents`, `due_date`, `status` pending/paid, `paid_at`),
created and marked paid manually from the admin UI today. There's no payment
processor wired up yet -- this sandbox has no Stripe account/keys to use, the
same kind of disclosed stand-in as self-hosting LiveKit for video and the
local recap for "AI" above -- but the shape is deliberately the one a Stripe
webhook would write into later with zero API reshaping. "Overdue" is never
stored; it's computed at read time as `status == pending and due_date <
now()`, so it can't drift out of sync with the invoice it describes.

Suspension is the actual enforcement mechanism: `org.suspended_at` /
`suspended_reason` get set by `POST /admin/organizations/{id}/suspend` and
cleared by `.../reactivate`. A new `get_active_user` dependency (`app/deps.py`)
wraps the existing `get_current_user`, lets platform admins straight through,
and otherwise raises 402 if the caller's org is suspended; it's applied to
every business router (teams, messages, video, files, calendar, ai) but
deliberately not to `auth.py` (so `/auth/me` keeps working for a suspended
user -- the frontend needs it to render the "suspended" screen) or `admin.py`
(platform admins are never blocked, anywhere). The chat WebSocket can't use a
FastAPI `Depends()`, so the same check is done by hand at connect time (close
code 4402) and again on every inbound message, so an already-open tab from
before the suspension can't keep posting through a stale socket either.

On the frontend, `RequireActiveWorkspace` (in `App.jsx`) wraps every
suspension-sensitive route and renders a dedicated `Suspended` screen instead
of the page, mirroring the backend gate; `RequirePlatformAdmin` gates `/admin`
the same way `require_platform_admin` gates the API.

## What's deliberately NOT here yet (see the planning doc's roadmap)

A real payment processor (Stripe or similar) and telephony are still ahead
of where this project has gotten to -- billing today is the manual-invoice
system described above, a disclosed stand-in for a processor this sandbox
has no account/keys for. The `general` auto-channel, the `org_admin`/team
`owner`/`member` roles, the platform-admin role, and the tenant-scoped data
model are all built so those later phases slot in without reworking the
foundation.

## Project layout

```
teamspace/
  backend/
    app/
      main.py          FastAPI app, CORS, router registration
      config.py         Settings -- dev defaults for DATABASE_URL/JWT_SECRET/
                           LiveKit creds/CORS; outside development
                           (ENVIRONMENT=production|staging) every one of
                           those is required and the app refuses to boot
                           if any is missing or still at its dev value
      database.py       SQLAlchemy engine/session
      models.py         Organization, User, Team, TeamMember, Channel, Message,
                           Invoice (plus plan/suspended_at/suspended_reason on
                           Organization, is_platform_admin on User)
      schemas.py        Pydantic request/response models
      security.py       Password hashing (bcrypt) + JWT
      deps.py           get_current_user + get_active_user (suspension gate)
      access.py         Shared tenant + team-membership access check
      ws_manager.py     In-memory per-channel WebSocket connection registry
      routers/
        auth.py          /auth/signup, /auth/login, /auth/me
        teams.py         /teams, /teams/{id}/join, /teams/{id}/channels
        messages.py      /channels/{id}/messages, /ws/channels/{id}
        video.py         /channels/{id}/video-token (LiveKit token mint)
        files.py         /channels/{id}/files (upload/list), /files/{id}/download
        calendar.py      /teams/{id}/events (create/list/delete)
        ai.py            /channels/{id}/summary (channel recap)
        admin.py         /admin/organizations (list w/ billing summary),
                           .../invoices (create/list/mark-paid),
                           .../suspend, .../reactivate -- platform-admin only
      ai_summary.py        The local extractive-summarization engine itself
    bin/livekit-server    Self-hosted LiveKit server binary (dev stand-in)
    livekit.yaml          LiveKit server config (ports, dev API key/secret)
    uploads/               Uploaded files on disk, org_id/channel_id-scoped
    migrations/            Alembic env + versioned schema migrations
    alembic.ini
    requirements.txt
  frontend/
    src/
      api.js             axios instance + token storage
      auth.jsx            Auth context (signup/login/logout/me)
      App.jsx              Routes + auth guards
      Shell.jsx            Shared app chrome (topbar + nav rail) for every page
      VideoCall.jsx        Group video call UI incl. screen share (livekit-client)
      FilesPanel.jsx       Per-channel file upload/list/download UI
      RecapPanel.jsx       Per-channel "AI Recap" UI
      pages/
        Signup.jsx, Login.jsx, Chat.jsx (chat + files + recap + calls),
        Calendar.jsx (per-team event scheduling)
        Admin.jsx (platform-admin dashboard: orgs, billing, suspend/reactivate)
        Suspended.jsx (shown to members of a suspended org instead of the app)
      index.css
    package.json
  e2e_test.py              Playwright test: two users, two orgs, real browser
  e2e_video_test.py        Playwright test: two users joining the same video
                           call with fake media devices, verifying real WebRTC
                           frames flow both ways
  e2e_phase3_test.py       Playwright test: real file upload/download byte
                           verification + shared team calendar create/delete
  e2e_screenshare_test.py  Playwright test: real screen capture (via Chromium's
                           fake-desktop-capture flags) published/subscribed as
                           a distinct WebRTC track between two real sessions
  e2e_ai_recap_test.py     Playwright test: posts a realistic mixed
                           substantive/filler conversation and checks the
                           recap surfaces the real content, not the filler
  test_ws.py               Direct WebSocket test of the chat protocol
```

## Running it yourself

### 1. Database

```bash
# Postgres must be running, then:
sudo -u postgres psql -c "CREATE USER teamspace WITH PASSWORD 'teamspace_dev_pw';"
sudo -u postgres psql -c "CREATE DATABASE teamspace OWNER teamspace;"
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg2://teamspace:teamspace_dev_pw@localhost:5432/teamspace"
export JWT_SECRET="change-me-to-something-random"
uvicorn app.main:app --reload --port 8000
```

In local development (the default -- no `ENVIRONMENT` var needed), tables are
created automatically on startup (`Base.metadata.create_all`) and the dev
JWT/DB/LiveKit secrets and `localhost:5173` CORS origin all have working
fallback defaults, so the commands above are all you need.

Outside development, schema changes go through Alembic instead -- run this
once per deployment/update instead of relying on `create_all` (which can't
alter an existing table):

```bash
alembic upgrade head
```

To add a new migration after changing `models.py`:

```bash
alembic revision --autogenerate -m "describe the change"
```

Set `ENVIRONMENT=production` (or `staging`) before starting the app anywhere
that isn't a laptop. Doing so turns every dev-only fallback into a hard
startup failure instead of a silent insecure default: you must also set
`DATABASE_URL`, `JWT_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and
`CORS_ORIGINS` (a comma-separated list of allowed frontend origins -- no
wildcard CORS outside development). The app refuses to boot and tells you
exactly which of these are missing rather than quietly running with a known
secret or an open CORS policy.

### 3. LiveKit (for video calls)

```bash
cd backend
./bin/livekit-server --config livekit.yaml --dev
```

Runs on port 7880 (HTTP/WS signaling), with RTC media on TCP 7881 and UDP
50000-50100. The dev API key/secret in `livekit.yaml` match the defaults in
`app/config.py`; override `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
`LIVEKIT_API_SECRET` to point at a different LiveKit server (including a
managed one) instead.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The frontend expects the API at
`http://localhost:8000` (see `frontend/.env` -- `VITE_API_BASE` /
`VITE_WS_BASE`).

### 5. Try it

1. Sign up, creating a new organization (e.g. "Acme Corp" -> slug `acme-corp`).
2. Create a team -- a `general` channel is created for you automatically.
3. Open a second browser (or incognito window), sign up again choosing
   "Join an existing one" with the slug `acme-corp`, join the team, and
   chat back and forth -- messages arrive in real time on both sides and
   survive a page reload.
4. In the channel header, click "Start/Join video call" on both browsers --
   each should show both participants' live camera tiles.
5. In the channel header, click "Files" and upload something -- it shows up
   for the other browser's Files tab too, and is downloadable there.
6. Click "Calendar" in the left nav rail, pick the team, and schedule an
   event -- it appears on the other browser's calendar for the same team.
7. In an active call, click "Share screen" (Chrome will ask you to pick a
   window/screen) -- the other browser sees a distinctly-bordered "screen"
   tile alongside the camera tiles. Click "Stop sharing" (or use the
   browser's own sharing indicator) to end it.
8. Click the "AI Recap" tab in a channel with some messages in it -- you'll
   see a message/people count, keyword chips, and a handful of highlighted
   messages pulled from the real conversation.

## What was tested (not just assumed)

- Full REST flow via `curl`: signup (new org + joining org), login, `/me`,
  team creation/listing, join-gating (403 before joining, works after),
  channel creation/listing.
- `test_ws.py`: two authenticated users on the same channel's WebSocket,
  confirming both sides receive every message and persistence round-trips.
- Cross-tenant isolation: a second organization's user gets an empty team
  list, a 404 (not 403) reading another org's channel history, and an
  outright rejected WebSocket handshake against another org's channel.
- `e2e_test.py`: a real Chromium browser (via Playwright), two separate
  users signing up into the same organization, creating a team, joining it,
  exchanging real-time messages, and confirming history persists after a
  reload. This is the `screenshot_chat.png` you may have already seen.
- `e2e_video_test.py`: two separate Chromium browser contexts (via
  Playwright, launched with `--use-fake-device-for-media-stream` so each
  gets a real synthetic camera feed, not a mock), two different users in the
  same org and team, both joining the same channel's video call. Verifies:
  the REST token endpoint issues a working per-user token; both sides
  actually connect over WebRTC to the self-hosted LiveKit server; each
  participant's `<video>` element has non-zero `videoWidth`/`videoHeight`
  (i.e. a real decoded video frame is flowing, not just a connected but
  blank track); the UI's participant-count label updates correctly; and
  leaving the call on one side correctly drops the tile count on the other.
  This is the `screenshot_video_call.png` you may have already seen --
  both tiles show Chromium's animated synthetic test pattern, correctly
  labeled with each user's real name.
- Cross-tenant isolation re-verified for the new endpoint: a user from a
  different organization gets a 404 (never a hint the channel exists) when
  requesting a video token for a channel in another org.
- `e2e_phase3_test.py`: two different users, same org/team/channel, real
  browsers. One uploads a real file; the other -- a separate browser
  context/session -- sees it in their own Files tab and downloads it, and
  the test reads both files off disk and asserts the bytes are byte-for-byte
  identical (not just "a download happened"). Separately, one user
  schedules a calendar event for the team; the other sees it on their own
  Calendar page, is confirmed to have no delete button on an event they
  didn't create, the creator deletes it, and a page reload on the other
  browser confirms the deletion actually persisted server-side rather than
  just updating local UI state. `screenshot_files_tab.png` and
  `screenshot_calendar.png` are from this real run.
- Cross-tenant isolation re-verified via `curl` for files and calendar too:
  a second organization's user gets a 404 downloading a file or listing
  events that belong to the first organization's channel/team.
- `e2e_screenshare_test.py`: two real browser sessions in a call. Rather than
  mocking screen capture, Chromium is launched with
  `--auto-select-desktop-capture-source` so `getDisplayMedia` really runs and
  really returns a live track (confirmed separately: capturing the sandbox's
  actual virtual display at 1280x720). One user starts sharing; the test
  confirms both sides get a distinctly-styled screen tile with non-zero
  video dimensions, correctly labeled with the sharer's name, that camera
  tiles are unaffected throughout, and that stopping the share removes the
  tile on both sides. `screenshot_screenshare.png` is from this run.
- `e2e_ai_recap_test.py`: posts ten real messages through the actual chat UI
  -- a deliberate mix of filler ("hey", "lol", "thanks") and substantive,
  topically-related messages (about a database migration) -- then opens the
  AI Recap tab and asserts the keyword chips and highlighted messages
  reflect the real topic words and real substantive messages, not the
  filler, and that an empty channel correctly shows an empty state rather
  than a fabricated summary. `screenshot_ai_recap.png` is from this run.
- Platform admin, verified end-to-end via `curl` + a direct WebSocket client
  (and cleaned up afterwards): `/admin/organizations` returns an accurate
  billing summary for the platform admin's token; creating an invoice with a
  past due date is correctly reported `is_overdue: true` and rolls up into
  the org's pending/overdue totals; marking it paid clears that; suspending
  the org immediately makes a non-admin member's `GET /teams` return 402 and
  an open chat WebSocket close with code 4402, while that same member's
  `GET /auth/me` keeps returning 200 (so the frontend can render the
  suspended screen) and the platform admin's own requests are unaffected the
  whole time; reactivating restores the member's 200/connect immediately.

## Subscriptions and billing (self-serve)

Every new workspace gets a 14-day free trial (`TRIAL_DAYS`). Org admins see a
**Billing** page (side rail) with plan status, member count, next payment,
and invoice history, and subscribe with one click. The Team plan is priced
per active member for a 30-day period (`PRICE_PER_SEAT_CENTS`,
`BILLING_PERIOD_DAYS`).

Flow: `POST /billing/checkout` creates an invoice + a provider order ->
the browser opens Razorpay Checkout -> on success the browser calls
`POST /billing/confirm` (payment signature verified server-side) and
Razorpay also calls `POST /billing/webhook/razorpay` (HMAC-verified, the
source of truth if the tab closes). Either path runs the same idempotent
`apply_payment` (app/billing.py): invoice paid, period extended 30 days, and
an *automatic* suspension lifted. A background loop (hourly) suspends orgs
whose trial ended or whose paid period lapsed more than `BILLING_GRACE_DAYS`
ago; suspended admins can still open Billing to pay. A manual suspension by
a platform admin is never lifted by a payment. Orgs created before this
feature have no trial clock and are never auto-suspended.

Local dev needs no payment account: with no `RAZORPAY_*` keys the app uses a
fake "sandbox" checkout (refused outside `ENVIRONMENT=development`). See
`backend/.env.example` for the three Razorpay variables and webhook setup.

## Known gaps to close before this is production-grade

- No password reset / email verification flow.
- No private channels or per-channel membership (channel access = team
  membership) -- fine for Phase 1, revisit before building Guests.
- The WebSocket connection registry is in-memory and per-process; a
  multi-instance deployment needs a shared pub/sub layer (e.g. Redis) so a
  broadcast reaches sockets held by other instances.
- No rate limiting, no input sanitization beyond length limits.
- The LiveKit server here is self-hosted, single-node, and run in `--dev`
  mode as a stand-in for a managed API/account this sandbox has no access
  to -- fine for proving the feature works, but swap to LiveKit Cloud (or
  run LiveKit's server in production mode behind real TLS/TURN) before any
  real users rely on it. The client/token code needs no changes either way.
- TURN/firewall traversal for real-world restrictive-NAT scenarios wasn't
  exercised here (both test browsers run in the same sandboxed network), so
  WebRTC connectivity across arbitrary real-world networks is unverified.
- No call controls beyond mute-by-leaving and screen share yet: no
  mute/camera-off toggle, no call recording, no call notifications/ringing
  for people not already in the channel. Only one person's screen share is
  really meant to be looked at at a time, but the UI doesn't enforce or
  warn if two people share simultaneously -- both tiles just render.
- Files are stored on local disk (`backend/uploads/`), not object storage
  (S3/GCS) -- fine for one backend instance, but won't work across multiple
  instances or survive a container being replaced. The plan always called
  for object storage; this is the same kind of disclosed interim choice as
  self-hosting LiveKit.
- File uploads are capped at 25 MB (`MAX_UPLOAD_BYTES`) and there's no
  virus/malware scanning, thumbnailing, or preview -- just store and
  download.
- Calendar events are visible to every team member with no separate
  per-event invite list or RSVP, and there's no reminder/notification system
  or recurring events yet.
- The AI recap is a local word-frequency summarizer, not an LLM (see "How
  the AI recap actually works" above for the honest reasoning) -- it's good
  at surfacing real, repeated topic words and the messages that use them,
  but it doesn't paraphrase, answer questions, understand context across
  unrelated topics in the same channel, or scale its quality the way a real
  LLM summary would on a very long or very topically-scattered conversation.
  It also only looks at the most recent 200 messages by default
  (`limit` query param, capped at 1000).
- Still open from the Phase 1 review and not yet acted on: self-enrollment
  into an org via a guessable slug has no invite/approval gate (notably,
  this also means someone can still sign up into an already-suspended org --
  `/auth` is deliberately not suspension-gated so `/auth/me` keeps working
  for existing members, but it means signup isn't blocked either); `Channel`,
  `Message`, and the new `FileAsset`/`CalendarEvent` tables don't carry
  their own `org_id` (tenant scoping is correct but transitive via `Team`).
- Billing has no real payment processor behind it yet -- invoices are
  created and marked paid manually by a platform admin, not generated from
  usage/plan or paid by the customer themselves. No dunning emails, no
  automatic suspension when an invoice goes overdue (a human has to click
  "Suspend"), and no self-serve way for an org to see or pay its own
  invoices -- only the platform admin can see billing at all right now.
- Suspension is all-or-nothing: every non-admin member loses every business
  feature (chat, calls, files, calendar, AI recap) the instant an org is
  suspended, with no grace period, read-only mode, or partial restriction.
