import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserCircle, KeyRound, LogOut, Camera, Bell, Palette, ShieldCheck, Building2, MonitorSmartphone } from "lucide-react";
import { api, saveSession } from "../api";
import { useAuth } from "../auth";
import Shell from "../Shell";
import Avatar from "../components/Avatar";
import PasswordInput from "../components/PasswordInput";
import ApiKeysPanel from "../components/ApiKeysPanel";
import { ROLE_LABELS, roleBadgeClass } from "../roles";

const REMINDER_CHOICES = [
  { value: "", label: "Server default" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
];

function allTimezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"];
  }
}

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Very strong"];
  return { score, label: pw ? labels[score] : "", pct: pw ? Math.max(8, (score / 5) * 100) : 0 };
}

function describeAgent(detail) {
  if (!detail) return "Unknown device";
  const [ip, ...rest] = detail.split(" - ");
  const ua = rest.join(" - ");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua.slice(0, 30) || "Unknown browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""} · ${ip}`;
}

function Notice({ error, saved, savedText = "Saved." }) {
  if (error) return <div className="form-error">{error}</div>;
  if (saved) return <span className="account-saved">{savedText}</span>;
  return null;
}

export default function Account() {
  const { user, organization, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const timezones = useMemo(allTimezones, []);

  // ----- profile -----
  const fromUser = (u) => ({
    name: u?.name || "",
    job_title: u?.job_title || "",
    department: u?.department || "",
    phone: u?.phone || "",
    location: u?.location || "",
    pronouns: u?.pronouns || "",
    status_message: u?.status_message || "",
    bio: u?.bio || "",
  });
  const [profile, setProfile] = useState(fromUser(user));
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  // ----- preferences -----
  const [prefs, setPrefs] = useState({
    timezone: user?.timezone || "",
    theme: user?.theme || "system",
    notify_email: user?.notify_email ?? true,
    notify_mentions: user?.notify_mentions ?? true,
    notify_reminders: user?.notify_reminders ?? true,
    reminder_minutes: user?.reminder_minutes ?? "",
  });
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsError, setPrefsError] = useState("");
  const [prefsSaved, setPrefsSaved] = useState(false);

  // ----- security -----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutDone, setLogoutDone] = useState(false);

  // ----- organization -----
  const [myTeams, setMyTeams] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);

  useEffect(() => {
    api.get("/teams").then(({ data }) => setMyTeams(data.filter((t) => t.is_member))).catch(() => {});
    loadSessions();
  }, []);

  function loadSessions() {
    api.get("/auth/me/sessions").then(({ data }) => setSessions(data)).catch(() => {});
  }

  const strength = passwordStrength(newPassword);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setProfileBusy(true);
    try {
      await api.patch("/auth/me", profile);
      await refreshMe();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      const d = err?.response?.data?.detail;
      setProfileError(typeof d === "string" ? d : "Please check your entries -- the phone number may contain only digits, +, -, ( ) and spaces.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/auth/me/avatar", form);
      await refreshMe();
    } catch (err) {
      setPhotoError(err?.response?.data?.detail || "Could not upload that photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      await api.delete("/auth/me/avatar");
      await refreshMe();
    } catch {
      setPhotoError("Could not remove your photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function savePrefs(e) {
    e.preventDefault();
    setPrefsError("");
    setPrefsSaved(false);
    setPrefsBusy(true);
    try {
      await api.patch("/auth/me", { ...prefs, reminder_minutes: prefs.reminder_minutes === "" ? null : Number(prefs.reminder_minutes) });
      await refreshMe();
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch (err) {
      setPrefsError(err?.response?.data?.detail || "Could not save your preferences.");
    } finally {
      setPrefsBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords don't match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      // Other devices were signed out; keep this one signed in with the fresh token.
      saveSession({ token: data.access_token, orgSlug: localStorage.getItem("orgSlug") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 3500);
    } catch (err) {
      const d = err?.response?.data?.detail;
      setPasswordError(typeof d === "string" ? d : "Could not change your password (use at least 8 characters).");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logoutEverywhere() {
    setLogoutBusy(true);
    try {
      const { data } = await api.post("/auth/logout-all");
      saveSession({ token: data.access_token, orgSlug: localStorage.getItem("orgSlug") });
      setLogoutDone(true);
      setTimeout(() => setLogoutDone(false), 3500);
    } finally {
      setLogoutBusy(false);
    }
  }

  async function leaveOrganization() {
    setLeaveError("");
    setLeaveBusy(true);
    try {
      await api.post("/organization/leave");
      logout();
      navigate("/login");
    } catch (err) {
      setLeaveError(err?.response?.data?.detail || "Could not leave the organization.");
      setLeaveBusy(false);
      setShowLeaveModal(false);
    }
  }

  const field = (key, label, props = {}) => (
    <label>
      {label}
      <input value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} {...props} />
    </label>
  );

  return (
    <Shell>
      <main className="detailpanel">
        <div className="conv-header">
          <strong>
            <UserCircle size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            My profile
          </strong>
          <span className="conv-channel">{user?.email}</span>
        </div>

        <div className="admin-body account-page">
          {/* ---------------- Profile ---------------- */}
          <section className="account-section">
            <div className="account-hero">
              <Avatar name={user?.name} url={user?.avatar_url} size={84} />
              <div className="account-hero-main">
                <h2>{user?.name}</h2>
                <div className="account-hero-sub">
                  {[user?.job_title, user?.department].filter(Boolean).join(" · ") || "Add your job title below"}
                </div>
                <span className={`status-badge ${roleBadgeClass(user?.org_role)}`}>{ROLE_LABELS[user?.org_role] || user?.org_role}</span>
                <span className="conv-channel"> {organization?.name}</span>
              </div>
              <div className="account-hero-actions">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadPhoto} />
                <button type="button" className="small-btn" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                  <Camera size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {photoBusy ? "Uploading..." : user?.avatar_url ? "Change photo" : "Upload photo"}
                </button>
                {user?.avatar_url && (
                  <button type="button" className="link-btn" onClick={removePhoto} disabled={photoBusy}>
                    Remove
                  </button>
                )}
                <span className="account-hint">PNG, JPG or WebP, up to 2 MB</span>
                {photoError && <div className="form-error">{photoError}</div>}
              </div>
            </div>

            <h3 className="account-sub">About you</h3>
            <form className="account-form" onSubmit={saveProfile}>
              <div className="account-grid">
                {field("name", "Full name", { required: true, maxLength: 200 })}
                {field("job_title", "Job title", { maxLength: 100, placeholder: "e.g. Senior Engineer" })}
                {field("department", "Department", { maxLength: 100, placeholder: "e.g. Platform" })}
                {field("pronouns", "Pronouns", { maxLength: 30, placeholder: "e.g. she/her" })}
                {field("location", "Location", { maxLength: 100, placeholder: "e.g. Hyderabad, India" })}
                {field("phone", "Phone", { maxLength: 30, placeholder: "+91 98765 43210", inputMode: "tel" })}
                <label className="account-wide">
                  Status message
                  <input
                    value={profile.status_message}
                    onChange={(e) => setProfile({ ...profile, status_message: e.target.value })}
                    maxLength={100}
                    placeholder="e.g. In a meeting until 3 PM"
                  />
                </label>
                <label className="account-wide">
                  Bio <span className="account-hint">{profile.bio.length}/500</span>
                  <textarea
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    maxLength={500}
                    rows={3}
                    placeholder="A line or two about what you do"
                  />
                </label>
                <label className="account-wide">
                  Email
                  <input value={user?.email || ""} readOnly disabled />
                  <span className="account-hint">Your email is your login, so it can't be changed here.</span>
                </label>
              </div>
              <div className="account-actions">
                <button type="submit" className="primary-btn" disabled={profileBusy || !profile.name.trim()}>
                  {profileBusy ? "Saving..." : "Save profile"}
                </button>
                <Notice error={profileError} saved={profileSaved} savedText="Profile saved." />
                <span className="account-hint">Your phone number is visible only to you and to admins, managers and team leads. Everything else is visible to your organization.</span>
              </div>
            </form>
          </section>

          {/* ---------------- Preferences ---------------- */}
          <section className="account-section">
            <h3>
              <Palette size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Preferences
            </h3>
            <form className="account-form" onSubmit={savePrefs}>
              <div className="account-grid">
                <label>
                  Timezone
                  <select value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>
                    <option value="">Not set (use browser)</option>
                    {(!prefs.timezone || timezones.includes(prefs.timezone) ? timezones : [prefs.timezone, ...timezones]).map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="link-btn account-link"
                    onClick={() => setPrefs({ ...prefs, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                  >
                    Use my browser's timezone
                  </button>
                </label>
                <div>
                  <span className="account-label">Theme</span>
                  <div className="segmented" role="radiogroup" aria-label="Theme">
                    {[
                      ["system", "System"],
                      ["light", "Light"],
                      ["dark", "Dark"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={prefs.theme === v}
                        className={`segment ${prefs.theme === v ? "active" : ""}`}
                        onClick={() => setPrefs({ ...prefs, theme: v })}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <h4 className="account-sub">
                <Bell size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                Notifications
              </h4>
              <div className="account-checks">
                <label className="check-row">
                  <input type="checkbox" checked={prefs.notify_mentions} onChange={(e) => setPrefs({ ...prefs, notify_mentions: e.target.checked })} />
                  <span>
                    <strong>Mentions</strong>
                    <em>Notify me when someone @mentions me in a channel</em>
                  </span>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={prefs.notify_reminders} onChange={(e) => setPrefs({ ...prefs, notify_reminders: e.target.checked })} />
                  <span>
                    <strong>Event reminders</strong>
                    <em>Remind me shortly before my calendar events</em>
                  </span>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={prefs.notify_email} onChange={(e) => setPrefs({ ...prefs, notify_email: e.target.checked })} />
                  <span>
                    <strong>Email notifications</strong>
                    <em>Also send meeting invites, RSVPs and reminders to my email</em>
                  </span>
                </label>
              </div>
              <label className="account-narrow">
                Remind me
                <select
                  value={prefs.reminder_minutes}
                  disabled={!prefs.notify_reminders}
                  onChange={(e) => setPrefs({ ...prefs, reminder_minutes: e.target.value })}
                >
                  {REMINDER_CHOICES.map((c) => (
                    <option key={c.label} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="account-actions">
                <button type="submit" className="primary-btn" disabled={prefsBusy}>
                  {prefsBusy ? "Saving..." : "Save preferences"}
                </button>
                <Notice error={prefsError} saved={prefsSaved} savedText="Preferences saved." />
              </div>
            </form>
          </section>

          {/* ---------------- Security ---------------- */}
          <section className="account-section">
            <h3>
              <KeyRound size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Password
            </h3>
            <form className="account-form" onSubmit={changePassword}>
              <div className="account-grid">
                <label>
                  Current password
                  <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
                </label>
                <span />
                <label>
                  New password
                  <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
                  {newPassword && (
                    <span className="strength" aria-live="polite">
                      <span className={`strength-bar s${strength.score}`} style={{ width: `${strength.pct}%` }} />
                      <em>{strength.label}</em>
                    </span>
                  )}
                </label>
                <label>
                  Confirm new password
                  <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
                  {confirmPassword && newPassword !== confirmPassword && <span className="account-hint bad">Doesn't match yet</span>}
                </label>
              </div>
              <div className="account-actions">
                <button type="submit" className="primary-btn" disabled={passwordBusy || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}>
                  {passwordBusy ? "Updating..." : "Update password"}
                </button>
                <Notice error={passwordError} saved={passwordSaved} savedText="Password updated. Your other devices were signed out." />
              </div>
            </form>
          </section>

          <section className="account-section">
            <h3>
              <MonitorSmartphone size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Sessions &amp; sign-ins
            </h3>
            <p className="account-hint">If you used a shared computer or think someone else has your password, sign out everywhere.</p>
            <div className="account-actions">
              <button type="button" className="small-btn" onClick={logoutEverywhere} disabled={logoutBusy}>
                {logoutBusy ? "Signing out..." : "Log out of all devices"}
              </button>
              {logoutDone && <span className="account-saved">Done -- every other device was signed out.</span>}
            </div>
            <h4 className="account-sub">Recent sign-ins</h4>
            {sessions.length === 0 ? (
              <p className="account-hint">No sign-ins recorded yet.</p>
            ) : (
              <ul className="session-list">
                {sessions.map((s, i) => (
                  <li key={i}>
                    <ShieldCheck size={14} />
                    <span>{describeAgent(s.detail)}</span>
                    <em>{new Date(s.when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(user?.org_role === "org_admin" || user?.org_role === "manager") && <ApiKeysPanel isAdmin={user?.org_role === "org_admin"} />}

          {/* ---------------- Organization ---------------- */}
          <section className="account-section">
            <h3>
              <Building2 size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Organization
            </h3>
            <dl className="account-facts">
              <div>
                <dt>Organization</dt>
                <dd>{organization?.name}</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{ROLE_LABELS[user?.org_role] || user?.org_role}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "--"}</dd>
              </div>
            </dl>
            <h4 className="account-sub">My teams</h4>
            {myTeams.length === 0 ? (
              <p className="account-hint">You're not in any team yet.</p>
            ) : (
              <div className="team-chips">
                {myTeams.map((t) => (
                  <span key={t.id} className="team-chip">
                    {t.name}
                    {t.my_role === "owner" && <em>owner</em>}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="account-section account-danger-zone">
            <h3>Leave organization</h3>
            <p className="account-hint">
              You'll immediately lose access to this organization's chats, files, and calendar. Someone else will need to invite you back if you change your mind.
            </p>
            <button type="button" className="admin-btn-bad" onClick={() => setShowLeaveModal(true)}>
              <LogOut size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Leave organization
            </button>
          </section>
        </div>

        {showLeaveModal && (
          <div className="modal-overlay" onClick={() => setShowLeaveModal(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Leave organization" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Leave this organization?</h3>
                <button type="button" className="link-btn" onClick={() => setShowLeaveModal(false)}>
                  Cancel
                </button>
              </div>
              <p className="admin-suspend-warning">This can't be undone yourself -- you'll need a new invite link to rejoin.</p>
              {leaveError && <div className="form-error">{leaveError}</div>}
              <div className="event-form-row">
                <button type="button" className="admin-btn-bad" onClick={leaveOrganization} disabled={leaveBusy}>
                  {leaveBusy ? "Leaving..." : "Leave organization"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
