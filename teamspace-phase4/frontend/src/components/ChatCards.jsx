import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, MapPin, Video, Phone, Mail, User, Check } from "lucide-react";
import Avatar from "./Avatar";
import { ROLE_LABELS, roleBadgeClass } from "../roles";

// ---------------------------------------------------------------- Poll
export function PollCard({ poll, meId, onVote }) {
  const myVotes = poll.votes.flatMap((v, i) => (v.some((x) => x.id === meId) ? [i] : []));
  const total = poll.total_voters;

  function toggle(i) {
    if (poll.multiple) {
      onVote(myVotes.includes(i) ? myVotes.filter((x) => x !== i) : [...myVotes, i]);
    } else {
      onVote(myVotes.includes(i) ? [] : [i]);
    }
  }

  return (
    <div className="card poll-card">
      <div className="card-title">
        <BarChart3 size={15} /> Poll
      </div>
      <div className="poll-question">{poll.question}</div>
      <div className="poll-hint">{poll.multiple ? "Select one or more" : "Select one"}</div>
      <ul className="poll-options">
        {poll.options.map((opt, i) => {
          const count = poll.votes[i].length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = myVotes.includes(i);
          return (
            <li key={i}>
              <button
                type="button"
                className={`poll-option ${mine ? "mine" : ""}`}
                onClick={() => toggle(i)}
                title={count ? poll.votes[i].map((v) => v.name).join(", ") : "No votes yet"}
                aria-pressed={mine}
              >
                <span className="poll-bar" style={{ width: `${pct}%` }} />
                <span className={`poll-check ${poll.multiple ? "square" : ""}`}>{mine && <Check size={11} strokeWidth={3} />}</span>
                <span className="poll-label">{opt}</span>
                <span className="poll-count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="poll-foot">
        {total} {total === 1 ? "person has" : "people have"} voted
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Contact
export function ContactCard({ contact, meId, onMessage, onProfile }) {
  const isMe = contact.user_id && contact.user_id === meId;
  return (
    <div className="card contact-card">
      <div className="card-title">
        <User size={15} /> Contact
      </div>
      <div className="contact-head">
        <Avatar name={contact.name} url={contact.avatar_url} size={44} />
        <div className="contact-main">
          <strong>{contact.name}</strong>
          {contact.is_member && (
            <span className="contact-sub">
              {contact.job_title && <>{contact.job_title} </>}
              <span className={`status-badge ${roleBadgeClass(contact.role)}`}>{ROLE_LABELS[contact.role] || contact.role}</span>
            </span>
          )}
          {contact.unavailable && <span className="contact-sub">No longer in this organization</span>}
        </div>
      </div>
      <ul className="contact-lines">
        {contact.phone && (
          <li>
            <Phone size={13} /> <a href={`tel:${contact.phone}`}>{contact.phone}</a>
          </li>
        )}
        {contact.email && (
          <li>
            <Mail size={13} /> <a href={`mailto:${contact.email}`}>{contact.email}</a>
          </li>
        )}
      </ul>
      {contact.is_member && (
        <div className="card-actions">
          <button type="button" className="small-btn" onClick={() => onProfile(contact.user_id)}>
            View profile
          </button>
          {!isMe && (
            <button type="button" className="small-btn" onClick={() => onMessage(contact)}>
              Message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Event
function fmt(iso, opts) {
  return new Date(iso).toLocaleString(undefined, opts);
}

export function EventCard({ event }) {
  if (event.deleted) {
    return (
      <div className="card event-card muted">
        <div className="card-title">
          <CalendarDays size={15} /> Event
        </div>
        <div className="event-title">{event.title}</div>
        <div className="poll-hint">This event was removed from the calendar.</div>
      </div>
    );
  }
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const sameDay = start.toDateString() === end.toDateString();
  return (
    <div className="card event-card">
      <div className="card-title">
        <CalendarDays size={15} /> Event
      </div>
      <div className="event-row">
        <div className="event-date" aria-hidden="true">
          <span>{start.toLocaleString(undefined, { month: "short" }).toUpperCase()}</span>
          <strong>{start.getDate()}</strong>
        </div>
        <div className="event-main">
          <div className="event-title">{event.title}</div>
          <div className="event-when">
            {fmt(event.start_time, { weekday: "short", hour: "numeric", minute: "2-digit" })} –{" "}
            {sameDay ? fmt(event.end_time, { hour: "numeric", minute: "2-digit" }) : fmt(event.end_time, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
          {event.location && (
            <div className="event-where">
              <MapPin size={12} /> {event.location}
            </div>
          )}
          {event.description && <div className="event-desc">{event.description}</div>}
          {event.organizer && <div className="event-org">Organised by {event.organizer}</div>}
        </div>
      </div>
      <div className="card-actions">
        <Link className="small-btn" to="/calendar">
          <CalendarDays size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Open calendar
        </Link>
        {event.has_video && (
          <Link className="small-btn join" to={`/calendar?meet=${event.id}`}>
            <Video size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Join video meeting
          </Link>
        )}
      </div>
    </div>
  );
}
