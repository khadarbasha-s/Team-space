import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Check, Trash2 } from "lucide-react";
import { api } from "../api";

const EXPIRY_CHOICES = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: "", label: "Never expires" },
];

const STATUS_CLASS = { active: "status-good", expired: "status-warn", revoked: "status-bad" };

function fmt(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      // Clipboard can be blocked (non-HTTPS, permissions): the text is
      // still selectable on screen, so just leave it.
    }
  };
  return (
    <button type="button" className="small-btn" onClick={copy}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

// Personal API keys for tools such as the TeamSpace MCP server. Only rendered
// for admins and managers (the backend enforces this too).
export default function ApiKeysPanel({ isAdmin }) {
  const [keys, setKeys] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // {key, name} -- shown once
  const [confirmId, setConfirmId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(() => {
    api
      .get("/api-keys")
      .then(({ data }) => {
        setKeys(data);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.response?.data?.detail || "Couldn't load API keys."));
  }, []);

  useEffect(load, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/api-keys", { name: name.trim(), expires_in_days: expiry === "" ? null : Number(expiry) });
      setCreated({ key: data.key, name: data.name });
      setName("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create the key.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    setRevokingId(id);
    setError("");
    try {
      await api.delete(`/api-keys/${id}`);
      setConfirmId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't revoke the key.");
    } finally {
      setRevokingId(null);
    }
  };

  const apiUrl = api.defaults.baseURL || "http://localhost:8000";
  // Set VITE_MCP_URL (e.g. https://mcp.example.com) once the remote MCP server is deployed.
  const mcpUrl = import.meta.env.VITE_MCP_URL ? `${import.meta.env.VITE_MCP_URL.replace(/\/$/, "")}/mcp` : "https://<your-mcp-server>/mcp";
  const cliSnippet = created
    ? `claude mcp add teamspace \\\n  -e TEAMSPACE_URL=${apiUrl} \\\n  -e TEAMSPACE_API_KEY=${created.key} \\\n  -- <path-to>/mcp_server/.venv/bin/python <path-to>/mcp_server/server.py`
    : "";
  const jsonSnippet = created
    ? JSON.stringify(
        {
          mcpServers: {
            teamspace: {
              command: "<path-to>/mcp_server/.venv/bin/python",
              args: ["<path-to>/mcp_server/server.py"],
              env: { TEAMSPACE_URL: apiUrl, TEAMSPACE_API_KEY: created.key },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <section className="account-section">
      <h3>
        <Bot size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 5 }} />
        API keys
      </h3>
      <p className="account-hint">
        Let an AI assistant (through the TeamSpace MCP server) act as you without sharing your password. A key can only read and post in your
        workspace and manage events, teams and channels; it can never manage members, billing, or other keys. Revoke it here at any time -- it stops
        working immediately.
      </p>

      {created && (
        <div className="apikey-reveal" role="status">
          <strong>Copy your new key now.</strong> It's shown only once and can't be retrieved later.
          <div className="apikey-secret">
            <code>{created.key}</code>
            <CopyButton text={created.key} label="Copy key" />
          </div>
          <details>
            <summary>Connect it to an MCP client</summary>
            <p className="account-hint">Claude Code:</p>
            <pre className="apikey-snippet">{cliSnippet}</pre>
            <CopyButton text={cliSnippet} />
            <p className="account-hint">Claude Desktop, Cursor and other JSON-config clients:</p>
            <pre className="apikey-snippet">{jsonSnippet}</pre>
            <CopyButton text={jsonSnippet} />
            <p className="account-hint">
              ChatGPT and other remote clients: add a custom MCP server with the URL <code>{mcpUrl}</code>, choose OAuth, and when the
              TeamSpace "Connect" page opens, paste this key.
            </p>
          </details>
          <button type="button" className="small-btn" onClick={() => setCreated(null)}>
            I've saved it
          </button>
        </div>
      )}

      <form className="account-form" onSubmit={create}>
        <div className="account-grid">
          <label>
            Key name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Claude Code on my laptop" required />
          </label>
          <label>
            Expires
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.label} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="account-actions">
          <button type="submit" className="primary-btn" disabled={busy || !name.trim()}>
            {busy ? "Creating..." : "Create API key"}
          </button>
          {error && <div className="form-error">{error}</div>}
        </div>
      </form>

      <h4 className="account-sub">{isAdmin ? "Keys in this organization" : "Your keys"}</h4>
      {loadError && <div className="form-error">{loadError}</div>}
      {!loadError && keys.length === 0 && <p className="account-hint">No API keys yet.</p>}
      <ul className="apikey-list">
        {keys.map((k) => (
          <li key={k.id} className={k.status !== "active" ? "apikey-inactive" : ""}>
            <div className="apikey-main">
              <div className="apikey-title">
                <strong>{k.name}</strong>
                <span className={`status-badge ${STATUS_CLASS[k.status] || ""}`}>{k.status}</span>
              </div>
              <div className="account-hint">
                <code>{k.prefix}...</code>
                {!k.is_mine && <> · owner {k.owner_name}</>} · created {fmt(k.created_at)}
                {k.expires_at && k.status === "active" && <> · expires {fmt(k.expires_at)}</>}
                {k.revoked_at && <> · revoked {fmt(k.revoked_at)}</>}
                {" · "}
                {k.last_used_at ? `last used ${fmt(k.last_used_at)}` : "never used"}
              </div>
            </div>
            {k.status === "active" &&
              (confirmId === k.id ? (
                <span className="apikey-confirm">
                  <button type="button" className="small-btn admin-btn-bad" onClick={() => revoke(k.id)} disabled={revokingId === k.id}>
                    {revokingId === k.id ? "Revoking..." : "Yes, revoke"}
                  </button>
                  <button type="button" className="small-btn" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="small-btn" onClick={() => setConfirmId(k.id)}>
                  <Trash2 size={13} /> Revoke
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
