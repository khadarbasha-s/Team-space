import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Search, UserMinus, Hash } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Avatar from "./Avatar";
import { ROLE_LABELS, roleBadgeClass } from "../roles";

// A team's people: see who is in it and, for the team's owner or an org
// admin, add colleagues from the organization or remove them.
export default function TeamMembersModal({ teamId, teamName, onClose, onChanged }) {
  const { user } = useAuth();
  const [roster, setRoster] = useState(null); // { members, can_manage }
  const [orgPeople, setOrgPeople] = useState([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/teams/${teamId}/roster`);
      setRoster(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load this team.");
    }
  }, [teamId]);

  useEffect(() => {
    load();
    api.get("/organization/members").then(({ data }) => setOrgPeople(data)).catch(() => {});
  }, [load]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inTeam = useMemo(() => new Set((roster?.members || []).map((m) => m.id)), [roster]);
  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orgPeople.filter((p) => !inTeam.has(p.id)).filter((p) => !s || p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
  }, [orgPeople, inTeam, q]);

  async function add() {
    if (!picked.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/teams/${teamId}/members`, { user_ids: picked });
      setRoster((r) => ({ ...r, members: data.members }));
      setNotice(`Added ${data.added.join(", ")} to ${teamName}.`);
      setPicked([]);
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not add those people.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    const self = m.id === user.id;
    if (!window.confirm(self ? `Leave ${teamName}?` : `Remove ${m.name} from ${teamName}?`)) return;
    setError("");
    setNotice("");
    try {
      await api.delete(`/teams/${teamId}/members/${m.id}`);
      onChanged?.();
      if (self && user.org_role !== "org_admin") {
        onClose();
        return;
      }
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not remove that person.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal composer-modal wide team-modal" role="dialog" aria-modal="true" aria-label={`${teamName} members`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{teamName}</h3>
          <button type="button" className="link-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="team-modal-hint">
          <Hash size={13} />
          <span>
            Every team has a <strong>#general</strong> channel for team-wide chat. Anyone you add can read and post there, and in any other channel of the team.
          </span>
        </p>

        {roster && (
          <>
            <div className="event-form-section-label">Members ({roster.members.length})</div>
            <ul className="team-roster">
              {roster.members.map((m) => (
                <li key={m.id}>
                  <Avatar name={m.name} url={m.avatar_url} size={30} />
                  <span className="team-roster-main">
                    <strong>
                      {m.name}
                      {m.id === user.id && " (you)"}
                    </strong>
                    <em>{m.job_title || m.email}</em>
                  </span>
                  <span className={`status-badge ${m.team_role === "owner" ? "status-good" : "status-neutral"}`}>{m.team_role === "owner" ? "Owner" : "Member"}</span>
                  <span className={`status-badge ${roleBadgeClass(m.org_role)}`}>{ROLE_LABELS[m.org_role]}</span>
                  {(roster.can_manage || m.id === user.id) && (
                    <button type="button" className="icon-btn" onClick={() => remove(m)} aria-label={m.id === user.id ? "Leave team" : `Remove ${m.name}`} title={m.id === user.id ? "Leave team" : "Remove from team"}>
                      <UserMinus size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {roster.can_manage ? (
              <>
                <div className="event-form-section-label" style={{ marginTop: 14 }}>
                  Add people from your organization
                </div>
                <div className="search-field">
                  <Search size={14} />
                  <input placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people to add" />
                </div>
                <div className="pick-list">
                  {candidates.length === 0 && (
                    <div className="empty-state">{orgPeople.length <= inTeam.size ? "Everyone in your organization is already in this team." : "No one matches your search."}</div>
                  )}
                  {candidates.map((p) => (
                    <label key={p.id} className="pick-row">
                      <input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} />
                      <Avatar name={p.name} url={p.avatar_url} size={26} />
                      <span className="person-name">
                        {p.name}
                        <em className="pick-email">{p.email}</em>
                      </span>
                      <span className={`status-badge ${roleBadgeClass(p.org_role)}`}>{ROLE_LABELS[p.org_role]}</span>
                    </label>
                  ))}
                </div>
                <div className="modal-actions">
                  <button type="button" className="primary-btn" onClick={add} disabled={busy || picked.length === 0}>
                    {busy ? "Adding..." : picked.length ? `Add ${picked.length} to team` : "Add to team"}
                  </button>
                </div>
              </>
            ) : (
              <p className="poll-hint">Only the team's owner or an organization admin can add or remove people.</p>
            )}
          </>
        )}
        {notice && <div className="billing-notice">{notice}</div>}
        {error && <div className="form-error">{error}</div>}
      </div>
    </div>
  );
}
