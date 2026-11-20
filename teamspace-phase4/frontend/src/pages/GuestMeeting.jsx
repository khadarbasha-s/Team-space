import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Clock, ShieldCheck, Video } from "lucide-react";
import axios from "axios";
import { api } from "../api";
import VideoCall from "../VideoCall";
import Brand from "../components/Brand";

// Public page behind a meeting's guest link (/meet/<token>): no TeamSpace
// account needed. The guest types a name and joins the video room; they get a
// token for that one room only -- never access to chat, files or the calendar.
export default function GuestMeeting() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("guestName") || "";
    } catch {
      return "";
    }
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [inCall, setInCall] = useState(false);
  const [left, setLeft] = useState(false);
  const joinData = useRef(null); // the guest's meeting token, kept for the call component
  const [waiting, setWaiting] = useState(null); // { requestId } while waiting for the host
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    // Use a bare axios call: a guest has no session, and this must never send one.
    axios
      .get(`${api.defaults.baseURL}/public/meetings/${token}`)
      .then(({ data }) => setInfo(data))
      .catch((err) => setError(err?.response?.data?.detail || "This meeting link is not valid or has been turned off."));
  }, [token]);

  async function join(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      try {
        localStorage.setItem("guestName", name.trim());
      } catch {
        // private mode -- fine
      }
      // Errors (not open yet, ended) show here, before the call UI mounts.
      const { data } = await axios.post(`${api.defaults.baseURL}/public/meetings/${token}/join`, { name: name.trim() });
      setLeft(false);
      setDenied(false);
      if (data.status === "waiting") {
        setWaiting({ requestId: data.request_id }); // the host has to let us in
      } else {
        joinData.current = data;
        setInCall(true);
      }
    } catch (err) {
      setJoinError(err?.response?.data?.detail || "Could not join the meeting. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  // Waiting room: ask the server every few seconds whether the host has answered.
  useEffect(() => {
    if (!waiting) return undefined;
    let stop = false;
    async function check() {
      try {
        const { data } = await axios.get(`${api.defaults.baseURL}/public/meetings/${token}/requests/${waiting.requestId}`);
        if (stop) return;
        if (data.status === "admitted") {
          joinData.current = data;
          setWaiting(null);
          setInCall(true);
        } else if (data.status === "denied") {
          setWaiting(null);
          setDenied(true);
        } else if (data.status === "expired" || data.status === "cancelled") {
          setWaiting(null);
          setJoinError("Nobody let you in this time. You can ask to join again.");
        }
      } catch {
        // network blip -- keep waiting, the next check retries
      }
    }
    const id = setInterval(check, 2500);
    check();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [waiting, token]);

  async function cancelWaiting() {
    const id = waiting?.requestId;
    setWaiting(null);
    if (id) axios.delete(`${api.defaults.baseURL}/public/meetings/${token}/requests/${id}`).catch(() => {});
  }

  const start = info && new Date(info.start_time);
  const end = info && new Date(info.end_time);

  if (inCall) {
    return (
      <div className="guest-page guest-in-call">
        <div className="guest-call-bar">
          <Brand className="auth-card-brand" />
          <span className="guest-badge">
            <ShieldCheck size={13} /> Guest · {info?.title}
          </span>
        </div>
        <div className="guest-call-wrap">
          <VideoCall
            title={info?.title}
            fetchToken={async () => ({ data: joinData.current })}
            onClose={() => {
              setInCall(false);
              setLeft(true);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="guest-page">
      <div className="guest-card">
        <Brand className="auth-card-brand" />
        {error ? (
          <>
            <h1 className="auth-title">Meeting link unavailable</h1>
            <p className="auth-subtitle">{error}</p>
          </>
        ) : !info ? (
          <p className="auth-subtitle">Loading meeting...</p>
        ) : (
          <>
            {left && <div className="guest-left">You left the meeting. You can rejoin below.</div>}
            {denied && <div className="form-error">The host didn't let you in. If you think this is a mistake, contact them directly.</div>}
            <h1 className="auth-title">{info.title}</h1>
            <p className="auth-subtitle">
              Hosted by <strong>{info.host_name}</strong>
              {info.organization ? <> · {info.organization}</> : null}
            </p>
            <ul className="guest-facts">
              <li>
                <CalendarDays size={15} /> {start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </li>
              <li>
                <Clock size={15} /> {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </li>
            </ul>
            {info.description && <p className="guest-desc">{info.description}</p>}

            {waiting ? (
              <div className="guest-waiting" role="status">
                <div className="guest-spinner" aria-hidden="true" />
                <strong>Waiting for the host to let you in…</strong>
                <p>{info.host_name} has been notified. Please keep this page open.</p>
                <button type="button" className="link-btn" onClick={cancelWaiting}>
                  Cancel
                </button>
              </div>
            ) : info.status === "ended" ? (
              <div className="form-error">This meeting has ended.</div>
            ) : (
              <form className="auth-card guest-form" onSubmit={join}>
                {info.status === "not_started" && (
                  <div className="guest-wait">
                    This meeting hasn't opened yet. You can join {info.early_minutes} minutes before it starts.
                  </div>
                )}
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Enter your name" autoFocus required />
                </label>
                {joinError && <div className="form-error">{joinError}</div>}
                <button className="primary-btn" type="submit" disabled={joining || !name.trim()}>
                  <Video size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  {joining ? "Joining..." : info.requires_approval ? "Ask to join" : "Join meeting"}
                </button>
                <p className="guest-privacy">
                  <ShieldCheck size={13} />{" "}
                  {info.requires_approval ? "The host will need to let you in. " : ""}You'll join as a guest and can't see anything else in this organization.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
