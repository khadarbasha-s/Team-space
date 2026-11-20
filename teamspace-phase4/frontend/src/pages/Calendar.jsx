import { istMinutes, fmtIST, istDate, istHHMM } from "../ist";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Video, Check, X as XIcon, HelpCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../Shell";
import VideoCall from "../VideoCall";
import EventComposer from "../components/EventComposer";
import MeetingRecordings from "../components/MeetingRecordings";

// ---------- date helpers ----------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const HOUR_PX = 48;
const AUTO_SCROLL_HOUR = 7;

// "personal" is a pseudo-calendar id standing in for the user's own
// My Calendar (team_id == null server-side) -- it's mixed into the same
// visibleIds/color/sidebar machinery as real teams so the grids don't need
// to know the difference.
const PERSONAL_ID = "personal";
const PERSONAL_COLOR = "#334155";


const RSVP_OPTIONS = [
  { value: "accepted", label: "Accept", icon: Check },
  { value: "tentative", label: "Maybe", icon: HelpCircle },
  { value: "declined", label: "Decline", icon: XIcon },
];

// A palette cycled through per-team so each team's calendar gets a stable,
// distinct color -- mirrors Outlook/Teams' "My calendars" color coding.
// Starts with TeamSpace's own brand accents before falling back to a few
// extra hues, so it still reads as "this app" rather than a copy of
// Microsoft's blue/white scheme.
const TEAM_COLORS = [
  "#4f46e5", // brand accent (indigo)
  "#9333ea", // brand accent-2 (purple)
  "#0d9488", // teal
  "#d97706", // amber
  "#e11d48", // rose
  "#2563eb", // blue
  "#16a34a", // green
  "#64748b", // slate
];

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function addMonths(d, n) {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n, 1);
  return c;
}

function startOfWeek(d) {
  const c = startOfDay(d);
  c.setDate(c.getDate() - c.getDay());
  return c;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toLocalInputValue(date) {
  return `${istDate(date)}T${istHHMM(date)}`;
}

// Returns the array of Date objects a grid should render as columns, for
// each of the four view modes. "month" has its own grid (MonthGrid) and
// isn't driven by this.
function daysForView(viewMode, anchorDate) {
  if (viewMode === "day") return [startOfDay(anchorDate)];
  if (viewMode === "workweek") {
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i + 1)); // Mon..Fri
  }
  const weekStart = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function formatRangeLabel(viewMode, anchorDate) {
  if (viewMode === "month") {
    return `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
  }
  if (viewMode === "day") {
    return `${DAY_NAMES[anchorDate.getDay()]}, ${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getDate()}, ${anchorDate.getFullYear()}`;
  }
  const days = daysForView(viewMode, anchorDate);
  const start = days[0];
  const end = days[days.length - 1];
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth
    ? `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`
    : `${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()}`;
  const endLabel = `${sameMonth ? "" : MONTH_NAMES[end.getMonth()].slice(0, 3) + " "}${end.getDate()}, ${end.getFullYear()}`;
  return `${startLabel} \u2013 ${endLabel}`;
}

// Greedy interval-overlap layout: clusters of overlapping events share a
// fixed set of side-by-side columns (same approach Outlook/Google use), so
// two meetings at the same time end up narrow and next to each other
// instead of stacked on top of one another.
function layoutDayEvents(events) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const laidOut = [];
  let cluster = [];
  let columns = [];
  let clusterEnd = null;

  function flushCluster() {
    if (cluster.length === 0) return;
    const totalCols = columns.length;
    cluster.forEach((item) => laidOut.push({ ...item, cols: totalCols }));
    cluster = [];
    columns = [];
  }

  for (const ev of sorted) {
    if (clusterEnd !== null && ev.start >= clusterEnd) {
      flushCluster();
      clusterEnd = null;
    }
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] <= ev.start) {
        columns[i] = ev.end;
        cluster.push({ ...ev, col: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push(ev.end);
      cluster.push({ ...ev, col: columns.length - 1 });
    }
    clusterEnd = clusterEnd === null ? ev.end : new Date(Math.max(clusterEnd, ev.end));
  }
  flushCluster();
  return laidOut;
}

// ---------- mini month navigator ----------

function MiniMonth({ cursorDate, selectedDate, today, onNavigate, onPick }) {
  const monthStart = startOfMonth(cursorDate);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="mini-month">
      <div className="mini-month-header">
        <strong>
          {MONTH_NAMES[cursorDate.getMonth()]} {cursorDate.getFullYear()}
        </strong>
        <div className="mini-month-nav">
          <button type="button" aria-label="Previous month" onClick={() => onNavigate(-1)}>
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onNavigate(1)}>
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="mini-month-weekdays">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d[0]}</span>
        ))}
      </div>
      <div className="mini-month-grid">
        {days.map((d) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selectedDate);
          return (
            <button
              type="button"
              key={d.toISOString()}
              className={`mini-month-day ${inMonth ? "" : "outside"} ${isToday ? "today" : ""} ${
                isSelected ? "selected" : ""
              }`}
              onClick={() => onPick(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- day/week/work-week time grid ----------
// Takes the list of day columns to render directly (see daysForView) so the
// same component serves Day (1 col), Work Week (5 cols) and Week (7 cols).

function WeekGrid({ days, today, eventsByDay, onEventClick, scrollRef, slotSel, onSlotClick }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="week-grid">
      <div className="week-grid-daynames">
        <div className="week-grid-gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`week-grid-dayname ${sameDay(d, today) ? "today" : ""}`}>
            <span className="week-grid-dayname-dow">{DAY_NAMES[d.getDay()]}</span>
            <span className="week-grid-dayname-num">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="week-grid-scroll" ref={scrollRef}>
        <div className="week-grid-body" style={{ height: `${24 * HOUR_PX}px` }}>
          <div className="week-grid-gutter">
            {hours.map((h) => (
              <div key={h} className="week-grid-hour-label" style={{ height: `${HOUR_PX}px` }}>
                {h === 0 ? "" : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const key = d.toDateString();
            const laidOut = layoutDayEvents(eventsByDay[key] || []);
            const isToday = sameDay(d, new Date());
            const isPastDay = startOfDay(d).getTime() < startOfDay(new Date()).getTime();
            const nowMins = istMinutes(new Date());
            function pick(e) {
              if (e.target.closest(".week-grid-event")) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const mins = Math.floor((e.clientY - rect.top) / (HOUR_PX / 60) / 30) * 30; // snap to the half hour
              const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins);
              onSlotClick(start, new Date(start.getTime() + 30 * 60 * 1000), e.clientX, e.clientY);
            }
            return (
              <div
                key={key}
                className={`week-grid-day-col ${sameDay(d, today) ? "today" : ""} ${isPastDay ? "past" : ""}`}
                onClick={pick}
                onContextMenu={(e) => {
                  e.preventDefault();
                  pick(e);
                }}
              >
                {hours.map((h) => (
                  <div key={h} className="week-grid-hour-row" style={{ height: `${HOUR_PX}px` }} />
                ))}
                {isToday && <div className="week-grid-past-shade" style={{ height: `${nowMins * (HOUR_PX / 60)}px` }} />}
                {slotSel && slotSel.kind === "slot" && sameDay(slotSel.start, d) && (
                  <div
                    className="week-grid-slot"
                    style={{
                      top: `${istMinutes(slotSel.start) * (HOUR_PX / 60)}px`,
                      height: `${((slotSel.end - slotSel.start) / 60000) * (HOUR_PX / 60)}px`,
                    }}
                  />
                )}
                {laidOut.map((ev) => {
                  const top = istMinutes(ev.start) * (HOUR_PX / 60);
                  const rawHeight = (ev.end.getTime() - ev.start.getTime()) / 60000 * (HOUR_PX / 60);
                  const height = Math.max(rawHeight, 20);
                  const widthPct = 100 / ev.cols;
                  return (
                    <button
                      type="button"
                      key={`${ev.id}-${ev.start.toISOString()}`}
                      className="week-grid-event"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${ev.col * widthPct}%`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: hexToRgba(ev.color, 0.25),
                        borderLeft: `3px solid ${ev.color}`,
                      }}
                      onClick={() => onEventClick(ev)}
                      title={ev.title}
                    >
                      <span className="week-grid-event-title">
                        {ev.video_room && <Video size={11} strokeWidth={2} className="week-grid-event-video-icon" />}
                        {ev.title}
                      </span>
                      {/* Below ~34px (a 30-min slot at HOUR_PX=48) there isn't
                          room for both lines -- the title always wins over
                          the time, matching Outlook/Google's short-event
                          behavior, instead of the title silently collapsing
                          to nothing (see week-grid-event-title's flex-shrink
                          in index.css for the other half of this fix). */}
                      {height >= 34 && (
                        <span className="week-grid-event-time">
                          {fmtIST(ev.start)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- month grid ----------

function MonthGrid({ anchorDate, today, eventsByDay, onEventClick, onMoreClick, onDayNumberClick, slotSel, onDayClick }) {
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const totalCells = (() => {
    // Only render 5 rows when the month fits, 6 when it doesn't.
    const lastOfMonth = addDays(startOfMonth(addMonths(anchorDate, 1)), -1);
    const gridEnd5 = addDays(gridStart, 34);
    return lastOfMonth <= gridEnd5 ? 35 : 42;
  })();
  const days = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));
  const MAX_CHIPS = 3;

  return (
    <div className="month-grid">
      <div className="month-grid-weekdays">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-grid-body" style={{ gridTemplateRows: `repeat(${totalCells / 7}, 1fr)` }}>
        {days.map((d) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const key = d.toDateString();
          const dayEvents = (eventsByDay[key] || []).sort((a, b) => a.start - b.start);
          const shown = dayEvents.slice(0, MAX_CHIPS);
          const extra = dayEvents.length - shown.length;
          return (
            <div
              key={key}
              className={`month-grid-cell ${inMonth ? "" : "outside"} ${startOfDay(d).getTime() < startOfDay(new Date()).getTime() ? "past" : ""} ${
                slotSel && slotSel.kind === "day" && sameDay(slotSel.start, d) ? "selected" : ""
              }`}
              onClick={(e) => {
                if (e.target.closest("button")) return; // the day number and event chips have their own actions
                onDayClick(d, e.clientX, e.clientY);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onDayClick(d, e.clientX, e.clientY);
              }}
            >
              <button
                type="button"
                className={`month-grid-daynum ${sameDay(d, today) ? "today" : ""}`}
                onClick={() => onDayNumberClick(d)}
              >
                {d.getDate()}
              </button>
              <div className="month-grid-chips">
                {shown.map((ev) => (
                  <button
                    type="button"
                    key={`${ev.id}-${ev.start.toISOString()}`}
                    className="month-grid-chip"
                    style={{ background: hexToRgba(ev.color, 0.25), borderLeft: `3px solid ${ev.color}` }}
                    onClick={() => onEventClick(ev)}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                ))}
                {extra > 0 && (
                  <button type="button" className="month-grid-more" onClick={() => onMoreClick(d)}>
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- scheduling assistant ----------
// Free/busy bars for the organizer + selected attendees across the day the
// event starts on, so you can see at a glance whether the proposed time
// actually works for everyone before sending the invite.

function SchedulingAssistant({ day, startTime, endTime, userIds, selfUser }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    api
      .get("/calendar/availability", {
        params: {
          user_ids: userIds.join(","),
          start: dayStart.toISOString(),
          end: dayEnd.toISOString(),
        },
      })
      .then(({ data }) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setErr("Could not load availability.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.toDateString(), userIds.join(",")]);

  const dayStart = startOfDay(day);
  const WINDOW_START_HOUR = 7;
  const WINDOW_END_HOUR = 20;
  const totalMinutes = (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60;

  function pct(date) {
    const mins = istMinutes(date) - WINDOW_START_HOUR * 60;
    return Math.min(100, Math.max(0, (mins / totalMinutes) * 100));
  }

  const proposedStart = new Date(`${startTime}:00+05:30`);
  const proposedEnd = new Date(`${endTime}:00+05:30`);

  return (
    <div className="scheduling-assistant">
      {/* Mirrors .scheduling-row's layout (name-column spacer + flex:1 track)
          so the hour labels' left:X% positions line up with the busy/
          proposed bars below, which are positioned relative to the
          narrower .scheduling-row-track, not the full card width. */}
      <div className="scheduling-assistant-hours-row">
        <span className="scheduling-assistant-hours-spacer" />
        <div className="scheduling-assistant-hours">
          {Array.from({ length: (WINDOW_END_HOUR - WINDOW_START_HOUR) / 3 + 1 }, (_, i) => {
            const h = WINDOW_START_HOUR + i * 3;
            return (
              <span key={h} style={{ left: `${((h - WINDOW_START_HOUR) / (WINDOW_END_HOUR - WINDOW_START_HOUR)) * 100}%` }}>
                {h % 12 === 0 ? 12 : h % 12}
                {h < 12 ? "a" : "p"}
              </span>
            );
          })}
        </div>
      </div>
      {loading && <div className="scheduling-assistant-loading">Checking availability…</div>}
      {err && <div className="form-error">{err}</div>}
      {rows &&
        rows.map((row) => (
          <div className="scheduling-row" key={row.user_id}>
            <span className="scheduling-row-name">
              {row.user_id === selfUser?.id ? "You" : row.name}
            </span>
            <div className="scheduling-row-track">
              <div
                className="scheduling-row-proposed"
                style={{ left: `${pct(proposedStart)}%`, width: `${Math.max(pct(proposedEnd) - pct(proposedStart), 1)}%` }}
              />
              {row.busy.map((b, i) => (
                <div
                  key={i}
                  className="scheduling-row-busy"
                  title={b.title}
                  style={{
                    left: `${pct(new Date(b.start))}%`,
                    width: `${Math.max(pct(new Date(b.end)) - pct(new Date(b.start)), 1)}%`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      <div className="scheduling-assistant-legend">
        <span>
          <span className="legend-swatch legend-swatch-proposed" /> Proposed time
        </span>
        <span>
          <span className="legend-swatch legend-swatch-busy" /> Busy
        </span>
      </div>
    </div>
  );
}

export default function Calendar() {
  const { user } = useAuth();

  const [teams, setTeams] = useState([]);
  const [visibleIds, setVisibleIds] = useState(() => new Set([PERSONAL_ID]));
  const [eventsByTeam, setEventsByTeam] = useState({});
  const [personalEvents, setPersonalEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [activeEvent, setActiveEvent] = useState(null);
  const [videoEvent, setVideoEvent] = useState(null); // { id, title } while a call is open
  const [searchParams, setSearchParams] = useSearchParams();
  const [recRefresh, setRecRefresh] = useState(0);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [guestCopied, setGuestCopied] = useState(false);

  async function enableGuestLink() {
    setGuestBusy(true);
    setGuestError("");
    try {
      const { data } = await api.post(`/calendar/events/${activeEvent.id}/guest-link`);
      setActiveEvent((ev) => ({ ...ev, guest_token: data.token, video_room: ev.video_room || "pending" }));
      refreshActiveCalendar(activeEvent);
    } catch (err) {
      setGuestError(err?.response?.data?.detail || "Could not create the guest link.");
    } finally {
      setGuestBusy(false);
    }
  }

  async function disableGuestLink() {
    setGuestError("");
    try {
      await api.delete(`/calendar/events/${activeEvent.id}/guest-link`);
      setActiveEvent((ev) => ({ ...ev, guest_token: null }));
      refreshActiveCalendar(activeEvent);
    } catch (err) {
      setGuestError(err?.response?.data?.detail || "Could not turn the link off.");
    }
  }

  async function setGuestApproval(required) {
    setGuestError("");
    setActiveEvent((ev) => ({ ...ev, guest_require_approval: required })); // optimistic
    try {
      await api.patch(`/calendar/events/${activeEvent.id}/guest-link`, { require_approval: required });
      refreshActiveCalendar(activeEvent);
    } catch (err) {
      setActiveEvent((ev) => ({ ...ev, guest_require_approval: !required }));
      setGuestError(err?.response?.data?.detail || "Could not change that setting.");
    }
  }

  async function copyGuestLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/meet/${activeEvent.guest_token}`);
      setGuestCopied(true);
      setTimeout(() => setGuestCopied(false), 2000);
    } catch {
      setGuestError("Couldn't copy automatically -- select the link and copy it.");
    }
  }

  // "Join video meeting" on an event card in chat links here: /calendar?meet=<id>
  useEffect(() => {
    const id = searchParams.get("meet");
    if (id) {
      setVideoEvent({ id, title: "Meeting" });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [viewMode, setViewMode] = useState("week"); // day | workweek | week | month
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const today = useMemo(() => new Date(), []);
  const scrollRef = useRef(null);

  const now = new Date();
  const [eventDraft, setEventDraft] = useState(null); // { start, end } while the New event dialog is open
  const [slotSel, setSlotSel] = useState(null); // { start, end, x, y, kind } -- a clicked free slot/day and its menu

  const teamColor = (teamId) => {
    if (teamId === PERSONAL_ID) return PERSONAL_COLOR;
    const idx = teams.findIndex((t) => t.id === teamId);
    return TEAM_COLORS[(idx < 0 ? 0 : idx) % TEAM_COLORS.length];
  };

  useEffect(() => {
    api.get("/teams").then(({ data }) => {
      const myTeams = data.filter((t) => t.is_member);
      setTeams(myTeams);
      setVisibleIds((prev) => {
        const next = new Set(prev);
        myTeams.forEach((t) => next.add(t.id));
        return next;
      });
    });
    api.get("/organization/members").then(({ data }) => {
      setMembers(data.filter((m) => m.id !== user?.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadEventsForTeam(teamId) {
    const { data } = await api.get(`/teams/${teamId}/events`);
    setEventsByTeam((prev) => ({ ...prev, [teamId]: data }));
  }

  async function loadPersonalEvents() {
    const { data } = await api.get("/calendar/events");
    setPersonalEvents(data);
  }

  useEffect(() => {
    teams.forEach((t) => loadEventsForTeam(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  useEffect(() => {
    loadPersonalEvents();
  }, []);

  // Poll everyone's events periodically (same trade-off as the
  // notification bell's polling -- see Shell.jsx) so that e.g. an
  // attendee's RSVP shows up for the organizer without a manual reload.
  const EVENTS_POLL_MS = 15000;
  useEffect(() => {
    const id = setInterval(() => {
      teams.forEach((t) => loadEventsForTeam(t.id));
      loadPersonalEvents();
    }, EVENTS_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  // Auto-scroll the time grid to business hours whenever it mounts or we
  // switch into a time-grid view, same as Outlook opening around 7-8 AM
  // instead of midnight. Month view has no scroll container.
  useEffect(() => {
    if (viewMode !== "month" && scrollRef.current) {
      scrollRef.current.scrollTop = AUTO_SCROLL_HOUR * HOUR_PX;
    }
  }, [viewMode]);

  function toggleVisible(id) {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Merge every visible calendar's events into day buckets, tagged with
  // that calendar's color, so the grids can render without knowing about
  // teams vs. personal.
  const eventsByDay = useMemo(() => {
    const buckets = {};
    function addEvent(ev, color, calId, calName) {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      const key = start.toDateString();
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ ...ev, start, end, color, calendarId: calId, calendarName: calName });
    }
    if (visibleIds.has(PERSONAL_ID)) {
      for (const ev of personalEvents) addEvent(ev, PERSONAL_COLOR, PERSONAL_ID, "My Calendar");
    }
    for (const team of teams) {
      if (!visibleIds.has(team.id)) continue;
      const color = teamColor(team.id);
      for (const ev of eventsByTeam[team.id] || []) addEvent(ev, color, team.id, team.name);
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, eventsByTeam, personalEvents, visibleIds]);

  // If an event detail modal is open while a poll above lands fresh data
  // (e.g. an attendee's RSVP came in), keep the open modal in sync instead
  // of leaving it showing stale attendee/RSVP status until it's reopened.
  useEffect(() => {
    setActiveEvent((prev) => {
      if (!prev) return prev;
      const bucket = eventsByDay[prev.start.toDateString()] || [];
      const fresh = bucket.find((e) => e.id === prev.id && e.start.getTime() === prev.start.getTime());
      return fresh || prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsByDay]);

  function navigate(delta) {
    setAnchorDate((prev) => {
      if (viewMode === "month") return addMonths(prev, delta);
      if (viewMode === "day") return addDays(prev, delta);
      return addDays(prev, delta * 7);
    });
  }

  function goToday() {
    setAnchorDate(new Date());
  }

  // The next half hour from now, e.g. 4:03 PM -> 4:30 PM (like Teams' default).
  function nextHalfHour(from = new Date()) {
    const d = new Date(from);
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
    return d;
  }

  function openNewEventModal(initialStart) {
    setError("");
    setSlotSel(null);
    let start;
    if (initialStart) {
      start = new Date(initialStart);
    } else {
      // Toolbar button: next half hour if the viewed day is today (or already
      // over), otherwise 9:00 AM on the day being viewed.
      const viewed = startOfDay(anchorDate);
      if (viewed.getTime() > startOfDay(new Date()).getTime()) {
        start = new Date(viewed);
        start.setHours(9, 0, 0, 0);
      } else {
        start = nextHalfHour();
      }
    }
    setEventDraft({ start, end: new Date(start.getTime() + 30 * 60 * 1000) });
  }

  // Called by the New event dialog. Returns an error message, or null on success.
  async function submitEvent({ calendarChoice, payload, startDate }) {
    try {
      if (calendarChoice === PERSONAL_ID) {
        await api.post("/calendar/events", payload);
        await loadPersonalEvents();
      } else {
        await api.post(`/teams/${calendarChoice}/events`, payload);
        await loadEventsForTeam(calendarChoice);
      }
      setEventDraft(null);
      // Make sure the calendar the event went into is checked, and jump to
      // that day so the new event is visible right away.
      setVisibleIds((prev) => new Set(prev).add(calendarChoice));
      setAnchorDate(startDate);
      if (viewMode === "month") setViewMode("week");
      return null;
    } catch (err) {
      const d = err?.response?.data?.detail;
      return typeof d === "string" ? d : "Could not create that event. Please check the details.";
    }
  }

  // Free/busy for the day timeline inside the dialog: every visible event that day.
  function eventsOnDay(day) {
    return (eventsByDay[day.toDateString()] || []).slice().sort((a, b) => a.start - b.start);
  }

  // Clicking an empty slot (week/day views) or day (month view): highlight it
  // and offer "New event" / "Go to today" -- but only from now on. Days and
  // times that are already over are not clickable.
  function pickSlot(start, end, x, y, kind) {
    if (end.getTime() <= Date.now()) return; // completed
    setSlotSel({ start, end, x, y, kind });
  }

  useEffect(() => {
    if (!slotSel) return undefined;
    function onDown(e) {
      if (!e.target.closest?.(".slot-menu")) setSlotSel(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setSlotSel(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [slotSel]);

  async function refreshActiveCalendar(ev) {
    if (ev.calendarId === PERSONAL_ID) await loadPersonalEvents();
    else await loadEventsForTeam(ev.calendarId);
  }

  async function deleteEvent(ev) {
    if (ev.calendarId === PERSONAL_ID) {
      await api.delete(`/calendar/events/${ev.id}`);
    } else {
      await api.delete(`/teams/${ev.calendarId}/events/${ev.id}`);
    }
    setActiveEvent(null);
    await refreshActiveCalendar(ev);
  }

  async function rsvp(ev, status) {
    const { data } = await api.post(`/calendar/events/${ev.id}/rsvp`, { status });
    // Keep the open modal in sync immediately rather than waiting on a
    // full reload, then refresh the underlying list in the background.
    setActiveEvent((prev) => (prev ? { ...prev, my_rsvp_status: data.my_rsvp_status, attendees: data.attendees } : prev));
    refreshActiveCalendar(ev);
  }

  function openVideo(ev) {
    setVideoEvent({ id: ev.id, title: ev.title, calendarId: ev.calendarId });
  }

  const days = useMemo(() => daysForView(viewMode, anchorDate), [viewMode, anchorDate]);

  return (
    <Shell>
      <aside className="listpanel calendar-sidebar">
        <MiniMonth
          cursorDate={anchorDate}
          selectedDate={anchorDate}
          today={today}
          onNavigate={(delta) => setAnchorDate((prev) => addMonths(prev, delta))}
          onPick={(d) => setAnchorDate(d)}
        />

        <div className="my-calendars">
          <div className="my-calendars-header">My calendars</div>
          <ul className="my-calendars-list">
            <li>
              <label className="my-calendars-item">
                <input
                  type="checkbox"
                  checked={visibleIds.has(PERSONAL_ID)}
                  onChange={() => toggleVisible(PERSONAL_ID)}
                />
                <span className="my-calendars-dot" style={{ background: PERSONAL_COLOR }} />
                <span>My Calendar</span>
              </label>
            </li>
            {teams.map((team) => {
              const color = teamColor(team.id);
              const checked = visibleIds.has(team.id);
              return (
                <li key={team.id}>
                  <label className="my-calendars-item">
                    <input type="checkbox" checked={checked} onChange={() => toggleVisible(team.id)} />
                    <span className="my-calendars-dot" style={{ background: color }} />
                    <span>{team.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {teams.length === 0 && (
            <div className="empty-state" style={{ flex: "none", padding: "10px 2px" }}>
              Join or create a team in Chat to get a shared team calendar too.
            </div>
          )}
        </div>
      </aside>

      <main className="detailpanel">
        <div className="conv-header calendar-header">
          <strong>Calendar</strong>
          <button type="button" className="small-btn" onClick={goToday}>
            Today
          </button>
          <div className="calendar-nav-arrows">
            <button type="button" aria-label="Previous" onClick={() => navigate(-1)}>
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Next" onClick={() => navigate(1)}>
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <span className="calendar-range-label">{formatRangeLabel(viewMode, anchorDate)}</span>

          <div className="conv-tabs calendar-view-toggle">
            {[
              ["day", "Day"],
              ["workweek", "Work Week"],
              ["week", "Week"],
              ["month", "Month"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`tab-btn ${viewMode === mode ? "active" : ""}`}
                onClick={() => setViewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" className="small-btn call-btn" onClick={() => openNewEventModal()}>
            + New event
          </button>
        </div>

        <div className="calendar-body calendar-body-grid">
          {viewMode === "month" ? (
            <MonthGrid
              anchorDate={anchorDate}
              today={today}
              eventsByDay={eventsByDay}
              onEventClick={setActiveEvent}
              onMoreClick={(d) => {
                setAnchorDate(d);
                setViewMode("day");
              }}
              onDayNumberClick={(d) => {
                setAnchorDate(d);
                setViewMode("day");
              }}
              slotSel={slotSel}
              onDayClick={(d, x, y) => {
                // Default time for a month-cell click: the next half hour today, 9:00 AM later days.
                const start = startOfDay(d).getTime() === startOfDay(new Date()).getTime() ? nextHalfHour() : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
                pickSlot(start, new Date(start.getTime() + 30 * 60 * 1000), x, y, "day");
              }}
            />
          ) : (
            <WeekGrid
              days={days}
              today={today}
              eventsByDay={eventsByDay}
              onEventClick={setActiveEvent}
              scrollRef={scrollRef}
              slotSel={slotSel}
              onSlotClick={(start, end, x, y) => pickSlot(start, end, x, y, "slot")}
            />
          )}
        </div>

        {eventDraft && (
          <EventComposer
            initial={eventDraft}
            teams={teams}
            members={members}
            personalId={PERSONAL_ID}
            eventsOnDay={eventsOnDay}
            renderScheduler={({ day, startTime, endTime, userIds }) => (
              <SchedulingAssistant day={day} startTime={startTime} endTime={endTime} userIds={[user?.id, ...userIds].filter(Boolean)} selfUser={user} />
            )}
            onClose={() => setEventDraft(null)}
            onSubmit={submitEvent}
          />
        )}

        {slotSel && (
          <div
            className="slot-menu"
            role="menu"
            style={{ left: Math.min(slotSel.x, window.innerWidth - 190), top: Math.min(slotSel.y, window.innerHeight - 100) }}
          >
            <button type="button" role="menuitem" onClick={() => openNewEventModal(slotSel.start)}>
              New event
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSlotSel(null);
                goToday();
              }}
            >
              Go to today
            </button>
          </div>
        )}

        {activeEvent && (
          <div className="modal-overlay" onClick={() => setActiveEvent(null)}>
            <div
              className="modal event-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-label={activeEvent.title}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>
                  <span className="my-calendars-dot" style={{ background: activeEvent.color }} />
                  {activeEvent.title}
                </h3>
                <button type="button" className="link-btn" onClick={() => setActiveEvent(null)}>
                  Close
                </button>
              </div>
              <div className="event-detail-body">
                <div className="event-detail-row">
                  {fmtIST(activeEvent.start, { dateStyle: "full", timeStyle: "short" })}
                  {" \u2192 "}
                  {fmtIST(activeEvent.end)}
                </div>
                <div className="event-detail-row event-sub">{activeEvent.calendarName} calendar</div>
                {activeEvent.recurrence?.description && (
                  <div className="event-detail-row event-sub">{activeEvent.recurrence.description}</div>
                )}
                {activeEvent.description && <div className="event-detail-row">{activeEvent.description}</div>}
                <div className="event-detail-row event-sub">Scheduled by {activeEvent.creator_name}</div>

                {activeEvent.attendees?.length > 0 && (
                  <div className="event-detail-attendees">
                    <div className="event-form-section-label">Attendees</div>
                    <ul>
                      {activeEvent.attendees.map((a) => (
                        <li key={a.user_id} className={`attendee-chip attendee-${a.status}`}>
                          {a.name}
                          <span className="attendee-chip-status">{a.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeEvent.calendarId !== PERSONAL_ID && activeEvent.created_by !== user?.id && (
                  <div className="event-detail-rsvp">
                    <span className="event-form-section-label">Your RSVP</span>
                    <div className="rsvp-buttons">
                      {RSVP_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <button
                          type="button"
                          key={value}
                          className={`rsvp-btn ${activeEvent.my_rsvp_status === value ? "active" : ""}`}
                          onClick={() => rsvp(activeEvent, value)}
                        >
                          <Icon size={14} strokeWidth={2} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <MeetingRecordings eventId={activeEvent.id} refreshKey={recRefresh} />

                {(activeEvent.created_by === user?.id || user?.org_role === "org_admin") && (
                  <div className="guest-link-box">
                    <div className="event-form-section-label">Guests (people outside your organization)</div>
                    {activeEvent.guest_token ? (
                      <>
                        <div className="guest-link-row">
                          <input readOnly value={`${window.location.origin}/meet/${activeEvent.guest_token}`} onFocus={(e) => e.target.select()} aria-label="Guest meeting link" />
                          <button type="button" className="small-btn" onClick={copyGuestLink}>
                            {guestCopied ? "Copied" : "Copy link"}
                          </button>
                        </div>
                        <label className="guest-approval">
                          <input
                            type="checkbox"
                            checked={activeEvent.guest_require_approval !== false}
                            onChange={(e) => setGuestApproval(e.target.checked)}
                          />
                          <span>
                            <strong>I approve each guest</strong>
                            <em>Guests wait in a lobby until you or an org admin lets them in</em>
                          </span>
                        </label>
                        <div className="guest-link-hint">
                          Anyone with this link can ask to join with just a name -- no account needed. They can join from 15 minutes before it starts until 2 hours after it ends,
                          and they can't see anything else in your workspace.{" "}
                          <button type="button" className="link-btn" onClick={disableGuestLink}>
                            Turn off link
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="guest-link-hint">Let people outside your organization join this video meeting through a private link.</div>
                        <button type="button" className="small-btn" onClick={enableGuestLink} disabled={guestBusy}>
                          {guestBusy ? "Creating..." : "Create guest link"}
                        </button>
                      </>
                    )}
                    {guestError && <div className="form-error">{guestError}</div>}
                  </div>
                )}

                <div className="event-detail-actions">
                  <button type="button" className="small-btn call-btn" onClick={() => openVideo(activeEvent)}>
                    <Video size={14} strokeWidth={2} />
                    {activeEvent.video_room ? "Join meeting" : "Start meeting"}
                  </button>
                  {activeEvent.created_by === user?.id && (
                    <button type="button" className="small-btn" onClick={() => deleteEvent(activeEvent)}>
                      {activeEvent.recurrence ? "Delete series" : "Delete event"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {videoEvent && (
          <div className="modal-overlay" onClick={() => setVideoEvent(null)}>
            <div
              className="modal video-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Video call: ${videoEvent.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <VideoCall
                tokenUrl={`/calendar/events/${videoEvent.id}/video-token`}
                recordEventId={videoEvent.id}
                onClose={() => {
                  setVideoEvent(null);
                  setRecRefresh((n) => n + 1); // a recording may have just been saved
                }}
              />
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
