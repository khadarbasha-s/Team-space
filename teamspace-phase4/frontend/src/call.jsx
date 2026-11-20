import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, Minimize2, Maximize2, UserCheck, UserX } from "lucide-react";
import { api, getToken } from "./api";
import { useAuth } from "./auth";
import VideoCall from "./VideoCall";
import Avatar from "./components/Avatar";

const CallContext = createContext({
  startCall: async () => {},
  joinCall: async () => {},
  active: null,
  liveCalls: {},
});

// A phone-style ring made with the Web Audio API (no sound files needed).
// "incoming": a double ring; "outgoing": a softer single ringback.
function useRinger(mode) {
  useEffect(() => {
    if (!mode) return undefined;
    let ctx;
    let timer;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume?.();
    } catch {
      return undefined;
    }
    function tone(freqs, start, dur, gain) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.03);
      g.gain.setValueAtTime(gain, ctx.currentTime + start + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      g.connect(ctx.destination);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur);
      }
    }
    function pattern() {
      if (mode === "incoming") {
        tone([440, 480], 0, 0.4, 0.18);
        tone([440, 480], 0.55, 0.4, 0.18);
      } else {
        tone([425], 0, 1.0, 0.08);
      }
    }
    pattern();
    timer = setInterval(pattern, mode === "incoming" ? 3000 : 4000);
    return () => {
      clearInterval(timer);
      ctx.close().catch(() => {});
    };
  }, [mode]);
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState(null); // someone is ringing me
  const [active, setActive] = useState(null); // { channelId, kind, title, outgoing }
  const [phase, setPhase] = useState(null); // outgoing: ringing | offline | connected | declined | no_answer
  const [liveCalls, setLiveCalls] = useState({}); // channel_id -> call in progress that I'm not in
  const [notice, setNotice] = useState("");
  const [big, setBig] = useState(false);
  const [guestRequests, setGuestRequests] = useState([]); // guests waiting for me to let them into a meeting
  const activeRef = useRef(null);
  activeRef.current = active;
  const phaseRef = useRef(null);
  phaseRef.current = phase;
  const peakRef = useRef(0); // most people seen in the current call

  // A short two-note chime when a guest knocks.
  const chime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
        o.start(ctx.currentTime + i * 0.18);
        o.stop(ctx.currentTime + i * 0.18 + 0.32);
      });
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch {
      // no audio available -- the on-screen prompt is enough
    }
  }, []);

  async function answerGuest(req, admit) {
    setGuestRequests((list) => list.filter((r) => r.id !== req.id));
    try {
      await api.post(`/calendar/guest-requests/${req.id}/${admit ? "admit" : "deny"}`);
    } catch {
      flash("That guest is no longer waiting.");
    }
  }

  useRinger(incoming ? "incoming" : active?.outgoing && (phase === "ringing" || phase === "offline") ? "outgoing" : null);

  const flash = useCallback((text) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? "" : n)), 5000);
  }, []);

  const hangUp = useCallback(async () => {
    const a = activeRef.current;
    setActive(null);
    setPhase(null);
    setBig(false);
    if (a) api.post(`/channels/${a.channelId}/call/leave`).catch(() => {});
  }, []);

  const startCall = useCallback(
    async ({ channelId, kind, title, direct = false }) => {
      if (activeRef.current) {
        flash("You're already in a call. Leave it before starting another.");
        return;
      }
      try {
        const { data } = await api.post(`/channels/${channelId}/call`, { kind });
        const outgoing = data.status === "started" && data.ring;
        peakRef.current = 0;
        setActive({ channelId, kind: data.kind, title, outgoing, direct });
        setPhase(outgoing ? (data.ringing > 0 ? "ringing" : "offline") : "connected");
      } catch (err) {
        flash(err?.response?.data?.detail || "Could not start the call.");
      }
    },
    [flash],
  );

  const joinCall = useCallback(
    async ({ channelId, kind, title, direct = false }) => {
      if (activeRef.current) {
        flash("You're already in a call. Leave it before joining another.");
        return;
      }
      try {
        await api.post(`/channels/${channelId}/call/join`);
        peakRef.current = 0;
        setActive({ channelId, kind, title, outgoing: false, direct });
        setPhase("connected");
        setIncoming((i) => (i?.channel_id === channelId ? null : i));
        setLiveCalls((c) => {
          const { [channelId]: _gone, ...rest } = c;
          return rest;
        });
      } catch (err) {
        flash(err?.response?.data?.detail || "That call has already ended.");
        setIncoming(null);
      }
    },
    [flash],
  );

  async function decline() {
    const c = incoming;
    setIncoming(null);
    if (c) api.post(`/channels/${c.channel_id}/call/decline`).catch(() => {});
  }

  // Server pushes (via the presence socket, see presence.jsx).
  useEffect(() => {
    if (!user) return undefined;
    function onPush(e) {
      const d = e.detail;
      if (d.type === "guest_request") {
        setGuestRequests((list) => (list.some((r) => r.id === d.request.id) ? list : [...list, d.request]));
        chime();
        return;
      }
      if (d.type === "guest_request_done") {
        setGuestRequests((list) => list.filter((r) => r.id !== d.request_id));
        return;
      }
      if (d.type === "incoming_call") {
        setLiveCalls((c) => ({ ...c, [d.channel_id]: d }));
        if (activeRef.current) {
          flash(`${d.from_name} is calling you`);
          return;
        }
        if (d.ring) setIncoming(d);
        return;
      }
      if (d.type !== "call_update") return;
      const here = activeRef.current?.channelId === d.channel_id;
      if (["ended", "cancelled", "missed", "declined"].includes(d.status)) {
        setIncoming((i) => (i?.channel_id === d.channel_id ? null : i));
        setLiveCalls((c) => {
          const { [d.channel_id]: _gone, ...rest } = c;
          return rest;
        });
        if (here && activeRef.current?.outgoing && phaseRef.current !== "connected") {
          setPhase(d.status === "declined" ? "declined" : "no_answer");
          setTimeout(() => {
            if (activeRef.current?.channelId === d.channel_id) hangUp();
          }, 2500);
        }
      } else if (d.status === "ring_stopped") {
        setIncoming((i) => (i?.channel_id === d.channel_id ? null : i));
      } else if (d.status === "answered" && here) {
        setPhase("connected");
      } else if (d.status === "declined_by") {
        flash(`${d.by_name} declined the call`);
      }
    }
    window.addEventListener("teamspace:push", onPush);
    api.get("/calendar/guest-requests").then(({ data }) => setGuestRequests(data)).catch(() => {});
    // A page loaded mid-call / mid-ring: restore what's going on.
    api
      .get("/calls/active")
      .then(({ data }) => {
        const live = {};
        for (const c of data) {
          live[c.channel_id] = c;
          if (c.ringing_now && c.ring && !activeRef.current) setIncoming(c);
        }
        setLiveCalls(live);
      })
      .catch(() => {});
    return () => window.removeEventListener("teamspace:push", onPush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Closing the tab mid-call: tell the server so the other side isn't left hanging.
  useEffect(() => {
    function onHide() {
      const a = activeRef.current;
      if (!a) return;
      const base = api.defaults.baseURL;
      fetch(`${base}/channels/${a.channelId}/call/leave`, {
        method: "POST",
        keepalive: true,
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const statusText =
    phase === "ringing"
      ? "Ringing…"
      : phase === "offline"
        ? `${active?.title || "They"} isn't online right now. They'll see a missed call.`
        : phase === "declined"
          ? "Call declined"
          : phase === "no_answer"
            ? "No answer"
            : null;

  return (
    <CallContext.Provider value={{ startCall, joinCall, active, liveCalls }}>
      {children}

      {notice && <div className="call-notice" role="status">{notice}</div>}

      {guestRequests.length > 0 && (
        <div className="guest-requests" role="alert" aria-label="Guests waiting to join">
          {guestRequests.map((r) => (
            <div key={r.id} className="guest-request">
              <div className="guest-request-text">
                <strong>{r.name}</strong>
                <span>wants to join “{r.title}” as a guest</span>
              </div>
              <button type="button" className="guest-deny" onClick={() => answerGuest(r, false)} aria-label={`Deny ${r.name}`}>
                <UserX size={15} /> Deny
              </button>
              <button type="button" className="guest-admit" onClick={() => answerGuest(r, true)} aria-label={`Admit ${r.name}`}>
                <UserCheck size={15} /> Admit
              </button>
            </div>
          ))}
        </div>
      )}

      {incoming && (
        <div className="incoming-call" role="alertdialog" aria-label="Incoming call">
          <Avatar name={incoming.from_name} url={incoming.from_avatar_url} size={64} className="incoming-avatar" />
          <div className="incoming-text">
            <strong>{incoming.is_group ? incoming.title : incoming.from_name}</strong>
            <span>
              {incoming.is_group ? `${incoming.from_name} is calling` : "is calling you"} · {incoming.kind === "video" ? "Video call" : "Voice call"}
            </span>
          </div>
          <div className="incoming-actions">
            <button type="button" className="call-round call-decline" onClick={decline} aria-label="Decline call" title="Decline">
              <PhoneOff size={22} />
            </button>
            <button
              type="button"
              className="call-round call-accept"
              onClick={() => joinCall({ channelId: incoming.channel_id, kind: incoming.kind, title: incoming.is_direct ? incoming.from_name : incoming.title, direct: !!incoming.is_direct })}
              aria-label="Accept call"
              title="Accept"
            >
              {incoming.kind === "video" ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className={`call-dock ${big ? "call-dock-big" : ""} ${active.kind === "audio" ? "call-dock-audio" : ""}`}>
          <div className="call-dock-bar">
            <span className="call-dock-title">
              {active.kind === "video" ? <Video size={14} /> : <Phone size={14} />} {active.title}
            </span>
            <button type="button" className="call-dock-size" onClick={() => setBig((b) => !b)} aria-label={big ? "Make call window smaller" : "Make call window larger"}>
              {big ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          {statusText && <div className={`call-status ${phase === "declined" || phase === "no_answer" ? "bad" : ""}`}>{statusText}</div>}
          <VideoCall
            key={active.channelId}
            channelId={active.channelId}
            recordChannelId={active.channelId}
            audioOnly={active.kind === "audio"}
            waitingText={statusText || "Waiting for others to join…"}
            onClose={hangUp}
            onParticipantCount={(n) => {
              peakRef.current = Math.max(peakRef.current, n);
              if (n > 1 && activeRef.current?.outgoing && phaseRef.current !== "connected") setPhase("connected");
              // 1:1 call: when the other person leaves, the call is over.
              if (activeRef.current?.direct && peakRef.current >= 2 && n <= 1) {
                const ch = activeRef.current.channelId;
                setTimeout(() => {
                  if (activeRef.current?.channelId === ch) {
                    flash("Call ended");
                    hangUp();
                  }
                }, 1200);
              }
            }}
          />
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
