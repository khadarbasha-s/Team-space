import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Video, FolderOpen, CalendarDays, Sparkles } from "lucide-react";
import { useAuth } from "../auth";
import Brand from "../components/Brand";
import PasswordInput from "../components/PasswordInput";

const HIGHLIGHTS = [
  { icon: MessageCircle, text: "Real-time chat, per channel" },
  { icon: Video, text: "Group video calls & screen share" },
  { icon: FolderOpen, text: "File sharing that just works" },
  { icon: CalendarDays, text: "A calendar your whole team sees" },
  { icon: Sparkles, text: "AI-style recaps of busy channels" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", orgSlug: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form);
      navigate("/");
    } catch (err) {
      if (!err?.response) {
        // No answer at all: the server is off or unreachable -- not a wrong password.
        setError("Can't reach the TeamSpace server. Make sure it's running (start it with ./start.sh), then try again.");
      } else if (err.response.status === 401 || err.response.status === 404) {
        setError("Invalid organization, email, or password.");
      } else if (err.response.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError("Something went wrong on the server. Please try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen auth-screen-split">
      <aside className="auth-aside">
        <Brand className="auth-aside-brand" />
        <h2 className="auth-aside-heading">Welcome back to your workspace.</h2>
        <p className="auth-aside-sub">
          Everything your team talks about, meets about, and shares -- right where you
          left it.
        </p>
        <ul className="auth-aside-list">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <li key={h.text}>
                <span className="auth-aside-icon">
                  <Icon size={16} strokeWidth={2} />
                </span>
                {h.text}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <Brand className="auth-card-brand" />
          <h1 className="auth-title">Log in</h1>
          <p className="auth-subtitle">Log in to your organization</p>

          <label>
            Organization slug
            <input
              required
              placeholder="acme-corp"
              value={form.orgSlug}
              onChange={(e) => setForm({ ...form, orgSlug: e.target.value })}
            />
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
              
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>

          <p className="auth-footer">
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
