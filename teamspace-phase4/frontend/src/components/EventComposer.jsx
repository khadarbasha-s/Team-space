import { istDate, istHHMM, istMinutes, fromIST, fmtIST } from "../ist";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, CalendarPlus, Users, Clock, MapPin, Video, AlignLeft, ChevronLeft, ChevronRight, Repeat, CalendarDays, Search } from "lucide-react";

const pad = (n) => String(n).padStart(2, "0");
const dateValue = (d) => istDate(d);
const timeValue = (d) => istHHMM(d);
const combine = (dateStr, timeStr) => fromIST(dateStr, timeStr);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (d) => fmtIST(d);
const timeLabel = (hhmm) => fmtTime(combine("2000-01-01", hhmm));

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);

const CUSTOM_DAYS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

const PX_PER_HOUR = 56;

function durationLabel(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------------------------------------------------------------- attendees
function AttendeeField({ members, selected, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const chosen = members.filter((m) => selected.includes(m.id));
  const matches = members
    .filter((m) => !selected.includes(m.id))
    .filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()) || m.email.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="ec-attendees" ref={wrapRef}>
      <div className="ec-chips">
        {chosen.map((m) => (
          <span key={m.id} className="ec-chip">
            {m.name}
            <button type="button" aria-label={`Remove ${m.name}`} onClick={() => onChange(selected.filter((id) => id !== m.id))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="ec-chip-input"
          placeholder={chosen.length ? "Add more people" : "Invite required attendees"}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          aria-label="Invite attendees"
        />
      </div>
      {open && (
        <div className="ec-suggest" role="listbox">
          {matches.length === 0 ? (
            <div className="ec-suggest-empty">{members.length === 0 ? "No other people in your organization yet." : "No matches."}</div>
          ) : (
            matches.map((m) => (
              <button
                type="button"
                key={m.id}
                role="option"
                onClick={() => {
                  onChange([...selected, m.id]);
                  setQ("");
                }}
              >
                <strong>{m.name}</strong>
                <span>{m.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the dialog
export default function EventComposer({ initial, teams, members, personalId, eventsOnDay, renderScheduler, onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [calendarChoice, setCalendarChoice] = useState(personalId);
  const [date, setDate] = useState(dateValue(initial.start));
  const [startT, setStartT] = useState(timeValue(initial.start));
  const [endT, setEndT] = useState(timeValue(initial.end));
  const [video, setVideo] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState([]);
  const [recurFreq, setRecurFreq] = useState("none");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurDays, setRecurDays] = useState([]);
  const [recurCount, setRecurCount] = useState(12);
  const [showScheduler, setShowScheduler] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  const start = combine(date, startT);
  const end = combine(date, endT);
  const minutes = Math.round((end - start) / 60000);
  const todayStr = dateValue(new Date());

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function changeStart(value) {
    // Keep the same length when the start moves, like Outlook/Teams do.
    const len = Math.max(minutes, 15);
    const ns = combine(date, value);
    const ne = new Date(ns.getTime() + len * 60000);
    setStartT(value);
    setEndT(ne.getDate() === ns.getDate() ? timeValue(ne) : "23:59");
  }

  function shiftDay(delta) {
    const d = combine(date, "12:00");
    d.setDate(d.getDate() + delta);
    if (dateValue(d) < todayStr) return; // completed days aren't selectable
    setDate(dateValue(d));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Add a title for the event.");
      return;
    }
    if (date < todayStr) {
      setError("Events can only be scheduled for today or later.");
      return;
    }
    if (!(end > start)) {
      setError("The event must end after it starts.");
      return;
    }
    if (end <= new Date()) {
      setError("That time has already passed. Pick a time from now on.");
      return;
    }
    if (recurFreq === "custom" && recurDays.length === 0) {
      setError("Pick at least one day of the week to repeat on.");
      return;
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      enable_video: video,
      attendee_user_ids: attendeeIds,
      recurrence:
        recurFreq === "none"
          ? null
          : {
              freq: recurFreq,
              interval: recurFreq === "custom" ? 1 : Math.max(1, Number(recurInterval) || 1),
              days_of_week: recurFreq === "custom" ? recurDays : null,
              count: recurCount ? Math.max(1, Number(recurCount)) : null,
            },
    };
    const problem = await onSubmit({ calendarChoice, payload, startDate: start });
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  }

  // ----- the day timeline on the right
  const dayStart = combine(date, "00:00");
  const busyBlocks = useMemo(() => eventsOnDay(dayStart), [date, eventsOnDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const topOf = (d) => (istMinutes(d) / 60) * PX_PER_HOUR;
  const heightOf = (a, b) => Math.max(((b - a) / 3600000) * PX_PER_HOUR, 22);
  const now = new Date();
  const isToday = date === todayStr;

  useEffect(() => {
    // Scroll the timeline so the proposed time is visible.
    if (bodyRef.current) bodyRef.current.scrollTop = Math.max(0, topOf(start) - PX_PER_HOUR * 1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const startOptions = TIME_OPTIONS.includes(startT) ? TIME_OPTIONS : [startT, ...TIME_OPTIONS].sort();
  const endOptions = TIME_OPTIONS.includes(endT) ? TIME_OPTIONS : [endT, ...TIME_OPTIONS].sort();

  return (
    <div className="modal-overlay ec-overlay" onClick={onClose}>
      <form className="ec-dialog" role="dialog" aria-modal="true" aria-label="New event" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="ec-titlebar">
          <span>New event</span>
          <button type="button" className="ec-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="ec-toolbar">
          <span className="ec-pill active">
            <CalendarDays size={14} /> Event
          </span>
          <label className="ec-select" title="Calendar">
            <CalendarPlus size={14} />
            <select value={calendarChoice} onChange={(e) => setCalendarChoice(e.target.value)} aria-label="Calendar">
              <option value={personalId}>My calendar</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (team)
                </option>
              ))}
            </select>
          </label>
          <label className="ec-select" title="Repeat">
            <Repeat size={14} />
            <select value={recurFreq} onChange={(e) => setRecurFreq(e.target.value)} aria-label="Repeat">
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom days of week…</option>
            </select>
          </label>
          <span className="ec-spacer" />
          <button type="submit" className="ec-save" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="ec-main">
          <div className="ec-left">
            <div className="ec-row">
              <CalendarPlus size={18} className="ec-icon" />
              <input
                className="ec-title"
                placeholder="Add title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
                aria-label="Event title"
              />
            </div>

            <div className="ec-row">
              <Users size={18} className="ec-icon" />
              <AttendeeField members={members} selected={attendeeIds} onChange={setAttendeeIds} />
            </div>

            <div className="ec-row">
              <Clock size={18} className="ec-icon" />
              <div className="ec-when">
                <input type="date" value={date} min={todayStr} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
                <select value={startT} onChange={(e) => changeStart(e.target.value)} aria-label="Start time">
                  {startOptions.map((t) => (
                    <option key={t} value={t}>
                      {timeLabel(t)}
                    </option>
                  ))}
                </select>
                <span className="ec-dash">–</span>
                <select value={endT} onChange={(e) => setEndT(e.target.value)} aria-label="End time">
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {timeLabel(t)}
                    </option>
                  ))}
                </select>
                {minutes > 0 && <span className="ec-duration">{durationLabel(minutes)}</span>}
                {attendeeIds.length > 0 && (
                  <button type="button" className="ec-link" onClick={() => setShowScheduler((v) => !v)}>
                    {showScheduler ? "Hide" : "Check"} availability
                  </button>
                )}
              </div>
            </div>

            {recurFreq !== "none" && (
              <div className="ec-row ec-recur">
                <span className="ec-icon" />
                <div className="ec-recur-body">
                  {recurFreq === "custom" ? (
                    <div className="recur-day-picker">
                      {CUSTOM_DAYS.map((d) => (
                        <button
                          type="button"
                          key={d.code}
                          className={`recur-day-chip ${recurDays.includes(d.code) ? "active" : ""}`}
                          onClick={() => setRecurDays((p) => (p.includes(d.code) ? p.filter((x) => x !== d.code) : [...p, d.code]))}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <label className="ec-inline">
                      Every
                      <input type="number" min={1} max={365} value={recurInterval} onChange={(e) => setRecurInterval(e.target.value)} />
                      {recurFreq === "daily" ? "day(s)" : recurFreq === "weekly" ? "week(s)" : "month(s)"}
                    </label>
                  )}
                  <label className="ec-inline">
                    for
                    <input type="number" min={1} max={730} value={recurCount} onChange={(e) => setRecurCount(e.target.value)} />
                    occurrences
                  </label>
                </div>
              </div>
            )}

            {showScheduler && attendeeIds.length > 0 && (
              <div className="ec-row">
                <span className="ec-icon" />
                <div className="ec-scheduler">{renderScheduler({ day: start, startTime: `${date}T${startT}`, endTime: `${date}T${endT}`, userIds: attendeeIds })}</div>
              </div>
            )}

            <div className="ec-row">
              <MapPin size={18} className="ec-icon" />
              <input className="ec-line" placeholder="Add a room or location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} aria-label="Location" />
            </div>

            <div className="ec-row">
              <Video size={18} className="ec-icon" />
              <label className="ec-switch">
                <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
                <span className="ec-switch-track" aria-hidden="true" />
                <span>Add a video meeting</span>
              </label>
            </div>
            {video && <div className="ec-hint">After saving, open the event to share a link with people outside your organization.</div>}

            <div className="ec-row ec-row-top">
              <AlignLeft size={18} className="ec-icon" />
              <textarea className="ec-desc" placeholder="Add details or an agenda" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={5} aria-label="Description" />
            </div>

            {error && <div className="form-error ec-error">{error}</div>}
          </div>

          <aside className="ec-right" aria-label="Day view">
            <div className="ec-day-head">
              <button type="button" onClick={() => shiftDay(-1)} disabled={date <= todayStr} aria-label="Previous day">
                <ChevronLeft size={16} />
              </button>
              <strong>{combine(date, "12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</strong>
              <button type="button" onClick={() => shiftDay(1)} aria-label="Next day">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="ec-day-scroll" ref={bodyRef}>
              <div className="ec-day" style={{ height: `${24 * PX_PER_HOUR}px` }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="ec-hour" style={{ top: `${h * PX_PER_HOUR}px`, height: `${PX_PER_HOUR}px` }}>
                    <span>{h === 0 ? "" : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`}</span>
                  </div>
                ))}
                {busyBlocks.map((b) => (
                  <div key={`${b.id}-${b.start.toISOString()}`} className="ec-busy" style={{ top: `${topOf(b.start)}px`, height: `${heightOf(b.start, b.end)}px` }} title={b.title}>
                    {b.title}
                  </div>
                ))}
                {isToday && <div className="ec-now" style={{ top: `${topOf(now)}px` }} />}
                {end > start && (
                  <div className="ec-proposed" style={{ top: `${topOf(start)}px`, height: `${heightOf(start, end)}px` }}>
                    {fmtTime(start)} – {fmtTime(end)}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
