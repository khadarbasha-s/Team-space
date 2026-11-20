import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, MessageCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import Brand from "../components/Brand";
import PasswordInput from "../components/PasswordInput";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A shared invite link looks like /signup?invite=<code> -- if it's
  // present, assume the visitor is joining that org and prefill/lock them
  // into "join" mode rather than making them re-type the code.
  const inviteFromLink = searchParams.get("invite") || "";
  const [mode, setMode] = useState(inviteFromLink ? "join" : "create"); // "create" a new org, or "join" an existing one
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "", inviteCode: inviteFromLink });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Someone joining will often paste the whole shared link rather than just
  // the code after it -- pull the code back out of an "?invite=..." URL if
  // that's what landed in the field, so either form works.
  function extractInviteCode(raw) {
    const trimmed = raw.trim();
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("invite") || trimmed;
    } catch {
      return trimmed;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        orgName: mode === "create" ? form.orgName : undefined,
        inviteCode: mode === "join" ? extractInviteCode(form.inviteCode) : undefined,
      });
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen auth-screen-split">
      <aside className="auth-aside">
        <Brand className="auth-aside-brand" />
        <h2 className="auth-aside-heading">Bring your team into one place.</h2>
        <p className="auth-aside-sub">
          Chat, group video calls, file sharing, a shared calendar, and AI-style
          channel recaps -- set up your organization in under a minute.
        </p>
        <ul className="auth-aside-list">
          <li>
            <span className="auth-aside-icon">
              <Building2 size={16} strokeWidth={2} />
            </span>
            Create your org, or join one with an invite link
          </li>
          <li>
            <span className="auth-aside-icon">
              <MessageCircle size={16} strokeWidth={2} />
            </span>
            Teams and channels, ready instantly
          </li>
          <li>
            <span className="auth-aside-icon">
              <ShieldCheck size={16} strokeWidth={2} />
            </span>
            Every org's data kept fully separate
          </li>
        </ul>
      </aside>

      <div className="auth-form-side">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand className="auth-card-brand" />
        <h1 className="auth-title">Sign up</h1>
        <p className="auth-subtitle">Create your account</p>

        <div className="mode-toggle">
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
            Create a new organization
          </button>
          <button type="button" className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>
            Join an existing one
          </button>
        </div>

        <label>
          Your name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <PasswordInput
            required
            minLength={8}
            
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>

        {mode === "create" ? (
          <label>
            Organization name
            <input
              required
              placeholder="Acme Corp"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            />
          </label>
        ) : (
          <label>
            Invite code
            <input
              required
              placeholder="Paste the invite code or link your admin shared"
              value={form.inviteCode}
              onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
            />
          </label>
        )}

        {error && <div className="form-error">{error}</div>}

        <button className="primary-btn" type="submit" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
      </div>
    </div>
  );
}
