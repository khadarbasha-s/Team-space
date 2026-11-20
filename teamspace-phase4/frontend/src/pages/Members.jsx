import { useEffect, useState } from "react";
import {
  Users,
  Copy,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserMinus,
  Clock,
  Activity as ActivityIcon,
  UserPlus,
} from "lucide-react";
import { api, assetUrl } from "../api";
import ProfileModal from "../components/ProfileModal";
import { ROLE_OPTIONS, ROLE_LABELS, roleBadgeClass } from "../roles";
import { useAuth } from "../auth";
import { usePresence } from "../presence";
import Shell from "../Shell";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Event copy for the Activity tab -- actor_name is null for a self-service
// "left" event (there's no separate actor in that case, see members.py).
function describeEvent(ev) {
  if (ev.event_type === "left") {
    return `${ev.target_name} left the organization`;
  }
  if (ev.event_type === "removed") {
    return `${ev.actor_name || "An admin"} removed ${ev.target_name}`;
  }
  if (ev.event_type === "added") {
    return `${ev.actor_name || "An admin"} added ${ev.target_name}${ev.detail ? ` (${ev.detail})` : ""}`;
  }
  // role_changed
  return `${ev.actor_name || "An admin"} changed ${ev.target_name}'s role${ev.detail ? ` (${ev.detail})` : ""}`;
}

export default function Members() {
  const { user, organization, refreshMe } = useAuth();
  const { presence } = usePresence();
  const isAdmin = user?.org_role === "org_admin";

  const [tab, setTab] = useState("members"); // "members" or "activity" (admin-only)
  const [members, setMembers] = useState([]);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenExpiry, setRegenExpiry] = useState(""); // yyyy-mm-dd, optional
  const [removeTarget, setRemoveTarget] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", org_role: "member" });
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [createdMember, setCreatedMember] = useState(null); // { name, email, temp_password }
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [profileFor, setProfileFor] = useState(null);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState(null); // { sent, failed, already_members } | { error }
  const [orgName, setOrgName] = useState(organization?.name || "");
  const [orgNameBusy, setOrgNameBusy] = useState(false);
  const [orgNameError, setOrgNameError] = useState("");
  const [orgNameSaved, setOrgNameSaved] = useState(false);

  // Keep the field in sync if the org loads/changes after this page's own
  // state was initialized (e.g. refreshMe() resolving after mount).
  useEffect(() => {
    setOrgName(organization?.name || "");
  }, [organization?.name]);

  async function saveOrgName(e) {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed || trimmed === organization?.name) return;
    setOrgNameBusy(true);
    setOrgNameError("");
    setOrgNameSaved(false);
    try {
      await api.patch("/organization", { name: trimmed });
      await refreshMe();
      setOrgNameSaved(true);
      setTimeout(() => setOrgNameSaved(false), 2500);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setOrgNameError(typeof detail === "string" ? detail : "Could not update the organization name.");
    } finally {
      setOrgNameBusy(false);
    }
  }

  async function sendInviteEmails(e) {
    e.preventDefault();
    const emails = inviteEmails.split(/[\s,;]+/).filter(Boolean);
    if (!emails.length) return;
    setInviteBusy(true);
    setInviteResult(null);
    try {
      const { data } = await api.post("/organization/invite/email", { emails });
      setInviteResult(data);
      if (data.sent.length) setInviteEmails("");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setInviteResult({ error: typeof detail === "string" ? detail : "Could not send the invitations. Check the email addresses." });
    } finally {
      setInviteBusy(false);
    }
  }

  async function loadMembers() {
    const { data } = await api.get("/organization/members");
    setMembers(data);
  }

  async function loadInvite() {
    if (!isAdmin) return;
    const { data } = await api.get("/organization/invite");
    setInviteCode(data.invite_code);
    setInviteExpiresAt(data.expires_at);
  }

  async function loadActivity() {
    if (!isAdmin) return;
    const { data } = await api.get("/organization/activity");
    setActivity(data);
  }

  useEffect(() => {
    loadMembers();
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "activity") loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const inviteLink = inviteCode ? `${window.location.origin}/signup?invite=${inviteCode}` : "";
  const inviteExpired = inviteExpiresAt && new Date(inviteExpiresAt) < new Date();

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked by the browser -- the link is still
      // visible and selectable in the input, so this is a soft failure.
    }
  }

  async function regenerateInvite() {
    setError("");
    try {
      // regenExpiry is a yyyy-mm-dd string from a plain <input type="date">
      // -- end-of-day in the browser's own timezone, so "the day the admin
      // picked" is still valid for the whole day for someone joining later
      // that same day. Leaving it blank keeps the link open indefinitely,
      // same as before this field existed.
      const expires_at = regenExpiry ? new Date(`${regenExpiry}T23:59:59`).toISOString() : null;
      const { data } = await api.post("/organization/invite/regenerate", { expires_at });
      setInviteCode(data.invite_code);
      setInviteExpiresAt(data.expires_at);
      setShowRegenModal(false);
      setRegenExpiry("");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not regenerate the invite link.");
      setShowRegenModal(false);
    }
  }

  async function changeRole(member, nextRole) {
    setError("");
    try {
      await api.patch(`/organization/members/${member.id}/role`, { org_role: nextRole });
      await loadMembers();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not change that member's role.");
    }
  }

  async function removeMember(member) {
    setError("");
    try {
      await api.delete(`/organization/members/${member.id}`);
      setRemoveTarget(null);
      await loadMembers();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not remove that member.");
      setRemoveTarget(null);
    }
  }

  async function addMember(e) {
    e.preventDefault();
    setAddError("");
    setAddBusy(true);
    try {
      const { data } = await api.post("/organization/members", addForm);
      setShowAddModal(false);
      setAddForm({ name: "", email: "", org_role: "member" });
      setCreatedMember(data);
      await loadMembers();
    } catch (err) {
      setAddError(err?.response?.data?.detail || "Could not add that member.");
    } finally {
      setAddBusy(false);
    }
  }

  async function copyTempPassword() {
    if (!createdMember) return;
    try {
      await navigator.clipboard.writeText(createdMember.temp_password);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 1800);
    } catch {
      // Soft failure -- the password is still visible and selectable.
    }
  }

  return (
    <Shell>
      <main className="detailpanel">
        <div className="conv-header">
          <strong>
            <Users size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Members
          </strong>
          <span className="conv-channel">
            {members.length} member{members.length === 1 ? "" : "s"}
          </span>
        </div>

        {isAdmin && (
          <div className="conv-tabs">
            <button className={`tab-btn ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>
              Members
            </button>
            <button className={`tab-btn ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>
              <ActivityIcon size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Activity
            </button>
          </div>
        )}

        <div className="admin-body">
          {error && <div className="form-error">{error}</div>}

          {tab === "members" && (
            <>
              {isAdmin && (
                <form className="members-invite-box" onSubmit={saveOrgName}>
                  <div>
                    <strong>Organization details</strong>
                    <p className="members-invite-sub">This name appears in the topbar, invite emails, and billing.</p>
                  </div>
                  <div className="members-invite-row">
                    <input
                      value={orgName}
                      onChange={(e) => {
                        setOrgName(e.target.value);
                        setOrgNameSaved(false);
                      }}
                      maxLength={200}
                      aria-label="Organization name"
                      placeholder="Organization name"
                    />
                    <button
                      type="submit"
                      className="small-btn"
                      disabled={orgNameBusy || !orgName.trim() || orgName.trim() === organization?.name}
                    >
                      {orgNameBusy ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {orgNameError && <div className="members-invite-fail">{orgNameError}</div>}
                  {orgNameSaved && <div className="members-invite-result">Organization name updated.</div>}
                </form>
              )}

              {isAdmin && (
                <div className="members-invite-box">
                  <div>
                    <strong>Invite people to this organization</strong>
                    <p className="members-invite-sub">
                      Anyone with this link can join as a member. Regenerating it invalidates the old one.
                      {inviteExpiresAt && (
                        <>
                          {" "}
                          <span className={inviteExpired ? "members-invite-expired" : ""}>
                            <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                            {inviteExpired ? "Expired" : "Expires"} {formatDateTime(inviteExpiresAt)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="members-invite-row">
                    <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
                    <button type="button" className="small-btn" onClick={copyInviteLink} disabled={!inviteLink}>
                      <Copy size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button type="button" className="small-btn" onClick={() => setShowRegenModal(true)}>
                      <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      Regenerate
                    </button>
                  </div>
                  <form className="members-invite-row members-invite-email" onSubmit={sendInviteEmails}>
                    <input
                      type="text"
                      placeholder="Email addresses to invite (comma separated)"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      aria-label="Email addresses to invite"
                    />
                    <button type="submit" className="small-btn" disabled={inviteBusy || !inviteEmails.trim()}>
                      <Mail size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      {inviteBusy ? "Sending..." : "Email invite"}
                    </button>
                  </form>
                  {inviteResult && (
                    <div className="members-invite-result" role="status">
                      {inviteResult.error && <span className="members-invite-fail">{inviteResult.error}</span>}
                      {inviteResult.sent?.length > 0 && <div>Invitation sent to: {inviteResult.sent.join(", ")}</div>}
                      {inviteResult.already_members?.length > 0 && (
                        <div>Already in this organization: {inviteResult.already_members.join(", ")}</div>
                      )}
                      {inviteResult.failed?.length > 0 && (
                        <div className="members-invite-fail">
                          Could not email: {inviteResult.failed.join(", ")}. Share the invite link above instead.
                        </div>
                      )}
                    </div>
                  )}
                  <p className="members-invite-sub members-invite-or">
                    Or add someone directly if you don't want to wait for them to sign up.
                  </p>
                  <button
                    type="button"
                    className="small-btn"
                    onClick={() => {
                      setAddError("");
                      setAddForm({ name: "", email: "", org_role: "member" });
                      setShowAddModal(true);
                    }}
                  >
                    <UserPlus size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    Add member
                  </button>
                </div>
              )}

              <table className="file-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.id === user?.id;
                    const isMemberAdmin = member.org_role === "org_admin";
                    return (
                      <tr key={member.id}>
                        <td>
                          <span className="avatar members-avatar" title={member.name}>
                            {member.avatar_url ? <img className="avatar-photo" src={assetUrl(member.avatar_url)} alt="" /> : initials(member.name)}
                            {presence[member.id]?.online && (
                              <span
                                className={`avatar-presence online presence-${presence[member.id]?.status || "available"}`}
                                aria-label={`Online -- ${presence[member.id]?.status || "available"}`}
                              />
                            )}
                          </span>
                          <button type="button" className="name-btn" onClick={() => setProfileFor(member.id)}>
                            {member.name}
                          </button>
                          {isSelf && <span className="conv-channel"> (you)</span>}
                          {member.job_title && <div className="conv-channel">{member.job_title}</div>}
                        </td>
                        <td className="file-col-quiet">{member.email}</td>
                        <td>
                          <span className={`status-badge ${roleBadgeClass(member.org_role)}`}>
                            {isMemberAdmin && <ShieldCheck size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />}
                            {ROLE_LABELS[member.org_role] || member.org_role}
                          </span>
                        </td>
                        <td className="file-col-quiet">{formatDate(member.created_at)}</td>
                        {isAdmin && (
                          <td className="members-actions">
                            <select
                              className="role-select"
                              value={member.org_role}
                              aria-label={`Role for ${member.name}`}
                              onChange={(e) => changeRole(member, e.target.value)}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="small-btn admin-btn-bad"
                              onClick={() => setRemoveTarget(member)}
                            >
                              <UserMinus size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {tab === "activity" && isAdmin && (
            <ul className="members-activity-list">
              {activity.length === 0 && <li className="members-activity-empty">No activity yet.</li>}
              {activity.map((ev) => (
                <li key={ev.id} className="members-activity-item">
                  <span>{describeEvent(ev)}</span>
                  <span className="file-col-quiet">{formatDateTime(ev.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showRegenModal && (
          <div className="modal-overlay" onClick={() => setShowRegenModal(false)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Regenerate invite link"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Regenerate the invite link?</h3>
                <button type="button" className="link-btn" onClick={() => setShowRegenModal(false)}>
                  Cancel
                </button>
              </div>
              <p className="admin-suspend-warning">
                The current invite link will stop working immediately. Anyone you've already shared it with
                will need the new one.
              </p>
              <div className="event-form-row">
                <label>
                  Expires on (optional)
                  <input type="date" value={regenExpiry} onChange={(e) => setRegenExpiry(e.target.value)} />
                </label>
                <button type="button" className="admin-btn-bad" onClick={regenerateInvite}>
                  Regenerate link
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddModal && (
          <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Add member"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Add a member directly</h3>
                <button type="button" className="link-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
              </div>
              <p className="admin-suspend-warning">
                Their account is created right away with the role you pick, and we email them a login link and a
                temporary password.
              </p>
              <form className="event-form" onSubmit={addMember}>
                <div className="event-form-row">
                  <label>
                    Name
                    <input
                      required
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      required
                      type="email"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={addForm.org_role}
                      onChange={(e) => setAddForm({ ...addForm, org_role: e.target.value })}
                    >
                      {[...ROLE_OPTIONS].reverse().map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={addBusy || !addForm.name.trim() || !addForm.email.trim()}>
                    {addBusy ? "Adding..." : "Add member"}
                  </button>
                </div>
                {addError && <div className="form-error">{addError}</div>}
              </form>
            </div>
          </div>
        )}

        {profileFor && <ProfileModal userId={profileFor} onClose={() => setProfileFor(null)} />}

        {createdMember && (
          <div className="modal-overlay" onClick={() => setCreatedMember(null)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Member added"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>{createdMember.name} has been added</h3>
                <button type="button" className="link-btn" onClick={() => setCreatedMember(null)}>
                  Close
                </button>
              </div>
              {createdMember.email_sent ? (
                <p className="members-invite-sub">
                  A welcome email with the login link and temporary password was sent to{" "}
                  <strong>{createdMember.email}</strong>.
                </p>
              ) : (
                <p className="members-invite-fail">
                  We could not email {createdMember.email}, so please share the details below yourself.
                </p>
              )}
              <p className="admin-suspend-warning">
                This temporary password is shown only once. {createdMember.email_sent ? "It is also in their email. " : "Share it with " + createdMember.name + " so they can log in. "}
                They can change it from their own Account page afterward.
              </p>
              <div className="members-invite-row">
                <input readOnly value={createdMember.temp_password} onFocus={(e) => e.target.select()} />
                <button type="button" className="small-btn" onClick={copyTempPassword}>
                  <Copy size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {passwordCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}

        {removeTarget && (
          <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Remove member"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Remove {removeTarget.name}?</h3>
                <button type="button" className="link-btn" onClick={() => setRemoveTarget(null)}>
                  Cancel
                </button>
              </div>
              <p className="admin-suspend-warning">
                They'll immediately lose access to this organization. Their past messages and files stay
                visible under their name.
              </p>
              <div className="event-form-row">
                <button type="button" className="admin-btn-bad" onClick={() => removeMember(removeTarget)}>
                  Remove member
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
