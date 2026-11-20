import { useEffect, useState } from "react";
import { X, MapPin, Phone, Mail, Clock, Users, MessageSquare } from "lucide-react";
import { api } from "../api";
import { ROLE_LABELS, roleBadgeClass } from "../roles";
import Avatar from "./Avatar";

function localTime(tz) {
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" }).format(new Date());
  } catch {
    return null;
  }
}

// Read-only profile card for anyone in the org. `onMessage` (optional) adds a
// "Message" button -- only shown when the viewer is allowed to message them.
export default function ProfileModal({ userId, onClose, onMessage }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/people/${userId}/profile`)
      .then(({ data }) => setP(data))
      .catch((err) => setError(err?.response?.data?.detail || "Could not load this profile."));
  }, [userId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const time = p ? localTime(p.timezone) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" role="dialog" aria-modal="true" aria-label="Profile" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        {error && <div className="form-error">{error}</div>}
        {!p && !error && <div className="empty-state">Loading...</div>}
        {p && (
          <>
            <div className="profile-head">
              <Avatar name={p.name} url={p.avatar_url} size={72} />
              <div>
                <h3>
                  {p.name}
                  {p.pronouns && <span className="profile-pronouns"> ({p.pronouns})</span>}
                </h3>
                {(p.job_title || p.department) && (
                  <div className="profile-title">{[p.job_title, p.department].filter(Boolean).join(" · ")}</div>
                )}
                <span className={`status-badge ${roleBadgeClass(p.org_role)}`}>{ROLE_LABELS[p.org_role] || p.org_role}</span>
              </div>
            </div>

            {p.status_message && <div className="profile-status">{p.status_message}</div>}
            {p.bio && <p className="profile-bio">{p.bio}</p>}

            <ul className="profile-facts">
              <li>
                <Mail size={14} /> <a href={`mailto:${p.email}`}>{p.email}</a>
              </li>
              {p.phone && (
                <li>
                  <Phone size={14} /> {p.phone}
                </li>
              )}
              {p.location && (
                <li>
                  <MapPin size={14} /> {p.location}
                </li>
              )}
              {time && (
                <li>
                  <Clock size={14} /> Local time {time}
                </li>
              )}
              {p.shared_teams.length > 0 && (
                <li>
                  <Users size={14} /> Teams in common: {p.shared_teams.join(", ")}
                </li>
              )}
              <li className="profile-joined">Joined {new Date(p.joined).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</li>
            </ul>

            {onMessage && p.can_message && (
              <button type="button" className="primary-btn profile-message" onClick={() => onMessage(p)}>
                <MessageSquare size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Message
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
