# TeamSpace MCP server

Lets Claude Code (or any MCP client) operate TeamSpace from plain prompts,
e.g. *"create a team Sales, add a channel leads, and post 'kickoff at 10'
there"* or *"schedule a design review in Design next Friday at 3pm"*.
No API key or local model needed: your MCP client does the understanding.

It logs in as ONE real TeamSpace user and uses the normal REST/WebSocket API,
so it can never do more than that user can in the UI.

## Tools
Read: whoami, list_teams, list_channels, list_team_members, read_messages,
summarize_channel, list_events, list_files.
Write: create_team, create_channel, send_message, create_event, delete_event.

## Get an API key (recommended)
1. Sign in to TeamSpace as an **admin or manager**, open **Account > API keys**.
2. Name the key, choose an expiry, click **Create API key**.
3. Copy it immediately -- it is shown **once** (only a hash is stored).
   The panel also shows ready-to-paste connection snippets.
4. To cut off access, click **Revoke** on that same page. It takes effect on
   the very next request (REST and chat). Admins can revoke any key in their
   organization; managers see and revoke only their own.

A key only works while its owner is still an admin/manager and active; demote
or remove the user and their keys stop working. A key can read and post in
the workspace and manage teams, channels and events -- it can never manage
members, billing, other keys, or the account.

## Register with Claude Code

    claude mcp add teamspace \
      -e TEAMSPACE_URL=http://localhost:8000 \
      -e TEAMSPACE_API_KEY=tsk_xxxxxxxx \
      -- /home/khadar-basha/Downloads/teamspace-phase4/mcp_server/.venv/bin/python \
         /home/khadar-basha/Downloads/teamspace-phase4/mcp_server/server.py

Claude Desktop / Cursor / Cline / other JSON-config clients:

    {"mcpServers": {"teamspace": {
      "command": "/home/khadar-basha/Downloads/teamspace-phase4/mcp_server/.venv/bin/python",
      "args": ["/home/khadar-basha/Downloads/teamspace-phase4/mcp_server/server.py"],
      "env": {"TEAMSPACE_URL": "http://localhost:8000", "TEAMSPACE_API_KEY": "tsk_xxxxxxxx"}}}}

Restart the client, check the server shows as connected (/mcp in Claude
Code), then type your request. Optional: TEAMSPACE_TZ (default Asia/Kolkata).
Fallback without a key: set TEAMSPACE_ORG, TEAMSPACE_EMAIL and
TEAMSPACE_PASSWORD instead (the password then lives in the client config --
prefer a key).

## Deploy for ChatGPT (remote MCP)

ChatGPT can't launch a program on your computer; it connects to a **public
HTTPS MCP server**. The same code runs in that mode (`MCP_TRANSPORT=http`),
and one deployment serves many people -- each connects with their **own**
TeamSpace API key, so everyone acts with their own role and permissions.

### 1. Run it
    docker build -t teamspace-mcp mcp_server
    docker run -d --name teamspace-mcp --restart unless-stopped \
      -p 8080:8080 -v teamspace-mcp-data:/data \
      -e MCP_PUBLIC_URL=https://mcp.example.com \
      -e TEAMSPACE_URL=https://api.example.com \
      teamspace-mcp

- `MCP_PUBLIC_URL` is the exact public https URL users/ChatGPT will reach.
- `TEAMSPACE_URL` is your TeamSpace backend as reachable from this container
  (it must be deployed too; `localhost` only works for tests).
- Put a TLS-terminating reverse proxy / load balancer in front (Caddy, nginx,
  a cloud LB...) that forwards to port 8080 and **preserves the Host header**.
  Don't buffer or time out responses aggressively.
- Run **one instance** (or sticky routing): pending sign-ins live in memory.
  Registered clients are in the SQLite file on the `/data` volume.
- Health check: `GET /health`. Sample env: `.env.example`.

### 2. Connect from ChatGPT
1. In ChatGPT, add a custom MCP server / connector (the menu has moved
   between versions: look under Settings > Connectors/Apps, Developer mode, or
   the Plugins page; availability depends on plan, so check OpenAI's current
   help pages). Use the URL `https://mcp.example.com/mcp`, authentication
   **OAuth**.
2. ChatGPT opens the TeamSpace **Connect** page. In TeamSpace (as an admin or
   manager) create a key under Account > API keys and paste it there.
3. Done: ask ChatGPT to use the TeamSpace tools. Revoking the key in
   TeamSpace cuts ChatGPT off; it will ask you to reconnect.

Raw bearer keys also work (`Authorization: Bearer tsk_...` at `/mcp`) for any
remote client that lets you set a header.

### Security notes
- Only clients whose callback host is allowlisted can register
  (`MCP_ALLOWED_REDIRECT_HOSTS`, default chatgpt.com, openai.com, claude.ai,
  claude.com, localhost). Add your own host if another client needs it.
- The consent page shows which app is asking and where it returns, and locks
  a request after 5 wrong keys. The access token IS the TeamSpace key: no
  secrets are stored on this server.
- Anyone holding a key can act as its owner within the allowed endpoints, so
  treat keys like passwords and revoke any you no longer need.
- Not verified against live ChatGPT: the OAuth flow was tested end to end with
  a scripted client (discovery, registration, PKCE, tokens, revocation), not
  with ChatGPT itself, whose connector UI and requirements change.

## Not included (deliberately)
Member removal, org/billing/admin actions, and file upload are not exposed.
Delete only exists for calendar events.
