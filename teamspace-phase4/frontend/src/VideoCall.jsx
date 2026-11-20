import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { ScreenShare, ScreenShareOff, PhoneOff, Mic, MicOff, Video, VideoOff, Circle, Square } from "lucide-react";
import { api } from "./api";

function Tile({ identity, isLocal, videoTrack, audioTrack, screenShare }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (videoTrack && el) {
      videoTrack.attach(el);
      return () => videoTrack.detach(el);
    }
  }, [videoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (audioTrack && el && !isLocal) {
      audioTrack.attach(el);
      return () => audioTrack.detach(el);
    }
  }, [audioTrack, isLocal]);

  return (
    <div className={`video-tile ${screenShare ? "video-tile-screen" : ""}`}>
      {videoTrack ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      ) : (
        <div className="video-tile-placeholder">{identity?.[0]?.toUpperCase() || "?"}</div>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay />}
      <div className="video-tile-label">
        {screenShare ? `${identity}'s screen` : identity}
        {isLocal && !screenShare ? " (you)" : ""}
      </div>
    </div>
  );
}

// A browser's camera/mic permission prompt can sit unanswered indefinitely
// (user ignores it, or there's no one there to click it at all -- e.g. an
// automated/sandboxed browser context). setMicrophoneEnabled/
// setCameraEnabled below await that prompt, so without a bound they can
// hang the whole join forever on "connecting...". Race against a timeout
// instead so a stuck prompt falls into the same "joined without
// media" path as a real permission denial or missing device.
const MEDIA_ENABLE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

export default function VideoCall({ channelId, tokenUrl, onClose, audioOnly = false, title, waitingText, onParticipantCount, onConnected, fetchToken, recordEventId, recordChannelId }) {
  // Either pass channelId (legacy, channel calls) or tokenUrl directly (e.g.
  // `/calendar/events/{id}/video-token` for a calendar event's "Meet Now" /
  // "Join meeting" room) -- both mint a token from the same LiveKit pattern,
  // this component doesn't care which kind of room it's joining.
  const resolvedTokenUrl = tokenUrl || `/channels/${channelId}/video-token`;
  const roomRef = useRef(null);
  const rootRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [screenShares, setScreenShares] = useState([]); // [{ sid, identity, track }]
  const [sharingScreen, setSharingScreen] = useState(false);
  const [status, setStatus] = useState("connecting"); // connecting | connected | error | ended
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // ---- Recording: a calendar meeting (recordEventId, host/org-admin only,
  // optionally server-side via LiveKit Egress) or an ad-hoc call (
  // recordChannelId -- Leads/Members/Chat "call" button; any participant,
  // browser-side only, uploaded as a chat attachment -- see
  // send_call_recording in messages.py) ----
  const [canRecord, setCanRecord] = useState(false);
  const [confirmRec, setConfirmRec] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recUpload, setRecUpload] = useState(null); // null | "uploading" | "saved" | "failed"
  const [remoteRec, setRemoteRec] = useState(null);
  const rec = useRef({}); // recorder internals: recorder, canvas timer, audio context, chunks...
  const [recMode, setRecMode] = useState("browser"); // "server" (recorder service) | "browser" (fallback)
  const [serverRec, setServerRec] = useState(false); // LiveKit says this room is being recorded on the server
  const [serverRecBusy, setServerRecBusy] = useState(false);

  const upsertParticipant = useCallback((sid, patch) => {
    setParticipants((prev) => {
      const idx = prev.findIndex((p) => p.sid === sid);
      if (idx === -1) {
        return [...prev, { sid, identity: sid, isLocal: false, videoTrack: null, audioTrack: null, ...patch }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const removeParticipant = useCallback((sid) => {
    setParticipants((prev) => prev.filter((p) => p.sid !== sid));
  }, []);

  const upsertScreenShare = useCallback((sid, patch) => {
    setScreenShares((prev) => {
      const idx = prev.findIndex((s) => s.sid === sid);
      if (idx === -1) return [...prev, { sid, identity: sid, track: null, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const removeScreenShare = useCallback((sid) => {
    setScreenShares((prev) => prev.filter((s) => s.sid !== sid));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        const displayName = participant.name || participant.identity;
        if (track.source === Track.Source.ScreenShare) {
          upsertScreenShare(participant.sid, { identity: displayName, track });
        } else if (track.kind === Track.Kind.Video) {
          upsertParticipant(participant.sid, { identity: displayName, isLocal: false, videoTrack: track });
        } else if (track.source === Track.Source.Microphone) {
          upsertParticipant(participant.sid, { identity: displayName, isLocal: false, audioTrack: track });
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        if (track.source === Track.Source.ScreenShare) {
          removeScreenShare(participant.sid);
        } else if (track.kind === Track.Kind.Video) {
          upsertParticipant(participant.sid, { videoTrack: null });
        } else if (track.source === Track.Source.Microphone) {
          upsertParticipant(participant.sid, { audioTrack: null });
        }
      })
      .on(RoomEvent.LocalTrackPublished, (publication, participant) => {
        if (publication.source === Track.Source.Camera) {
          setCamOn(true);
          upsertParticipant(participant.sid, { videoTrack: publication.track, isLocal: true });
        }
        if (publication.source === Track.Source.Microphone) setMicOn(true);
        if (publication.source === Track.Source.ScreenShare) {
          setSharingScreen(true);
          upsertScreenShare(participant.sid, {
            identity: participant.name || participant.identity,
            track: publication.track,
          });
        }
      })
      .on(RoomEvent.RecordingStatusChanged, (isRecording) => setServerRec(!!isRecording))
      .on(RoomEvent.DataReceived, (payload, participant) => {
        // The host's browser announces "recording on/off" so everyone sees a banner.
        try {
          const m = JSON.parse(new TextDecoder().decode(payload));
          if (m.t !== "rec") return;
          clearTimeout(rec.current.remoteTimer);
          if (m.on) {
            setRemoteRec({ by: participant?.name || m.by || "the host" });
            // The recorder re-announces every few seconds; if that stops, the banner clears.
            rec.current.remoteTimer = setTimeout(() => setRemoteRec(null), 20000);
          } else {
            setRemoteRec(null);
          }
        } catch {
          // not a recording message
        }
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        if (!participant.isLocal) return;
        if (publication.source === Track.Source.Microphone) setMicOn(false);
        if (publication.source === Track.Source.Camera) setCamOn(false);
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (!participant.isLocal) return;
        if (publication.source === Track.Source.Microphone) setMicOn(true);
        if (publication.source === Track.Source.Camera) setCamOn(true);
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
        if (publication.source === Track.Source.Camera) {
          setCamOn(false);
          upsertParticipant(participant.sid, { videoTrack: null });
        }
        if (publication.source === Track.Source.Microphone) setMicOn(false);
        // Fires both when we click "Stop sharing" ourselves AND when the user
        // stops it from the browser's native "Stop sharing" bar -- either way
        // the UI needs to fall back out of the sharing state.
        if (publication.source === Track.Source.ScreenShare) {
          setSharingScreen(false);
          removeScreenShare(participant.sid);
        }
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        // A participant may join with no camera/mic published at all (e.g.
        // they only ever share their screen), in which case TrackSubscribed
        // never fires for them -- so they need their own tile the moment
        // they connect, not only once a track shows up.
        upsertParticipant(participant.sid, {
          identity: participant.name || participant.identity,
          isLocal: false,
        });
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        removeParticipant(participant.sid);
        removeScreenShare(participant.sid);
      })
      .on(RoomEvent.Disconnected, () => {
        if (!cancelled) setStatus("ended");
      });

    (async () => {
      try {
        // fetchToken lets a caller without a TeamSpace login (a meeting guest) mint a token another way.
        const { data } = fetchToken ? await fetchToken() : await api.post(resolvedTokenUrl);
        if (cancelled) return;
        await room.connect(data.url, data.token);

        // A participant may have no camera/mic at all (denied permission, no
        // device present, etc). That shouldn't fail the whole join -- they're
        // already connected to the room at this point, so failing here would
        // leave them stuck on an error screen while everyone else correctly
        // sees and counts them as present. Join muted/camera-off instead.
        let mediaWarning = "";
        try {
          await withTimeout(room.localParticipant.setMicrophoneEnabled(true), MEDIA_ENABLE_TIMEOUT_MS);
        } catch (mediaErr) {
          mediaWarning = "Joined without a microphone or camera — none was found, permission wasn't granted, or it timed out.";
        }
        if (!audioOnly) {
          try {
            await withTimeout(room.localParticipant.setCameraEnabled(true), MEDIA_ENABLE_TIMEOUT_MS);
          } catch (mediaErr) {
            mediaWarning = "Joined without a microphone or camera — none was found, permission wasn't granted, or it timed out.";
          }
        }
        if (mediaWarning && !cancelled) setError(mediaWarning);

        const localVideoPub = Array.from(room.localParticipant.videoTrackPublications.values())[0];
        upsertParticipant(room.localParticipant.sid, {
          identity: room.localParticipant.name || room.localParticipant.identity,
          isLocal: true,
          videoTrack: localVideoPub?.track || null,
        });

        // Anyone already in the room when we join won't fire
        // ParticipantConnected for us, so seed them here too.
        room.remoteParticipants.forEach((participant) => {
          upsertParticipant(participant.sid, {
            identity: participant.name || participant.identity,
            isLocal: false,
          });
        });

        if (!cancelled) {
          setServerRec(!!room.isRecording);
          setStatus("connected");
          onConnected?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || err.message || "Could not join the call.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTokenUrl, upsertParticipant, removeParticipant, upsertScreenShare, removeScreenShare]);

  // If the window is closed some other way while recording, still stop and save what was captured.
  useEffect(
    () => () => {
      clearTimeout(rec.current.remoteTimer);
      if (rec.current.recorder) stopRecording();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (recordEventId) {
      api
        .get(`/calendar/events/${recordEventId}/recordings`)
        .then(({ data }) => {
          setCanRecord(!!data.can_record);
          setRecMode(data.mode === "server" ? "server" : "browser");
        })
        .catch(() => setCanRecord(false));
    } else if (recordChannelId) {
      // No host/org-admin concept for a direct call -- either participant
      // may record, same trust boundary as sending a file in this chat.
      // Always browser-side: there's no per-channel LiveKit room for the
      // recorder service to join ahead of time the way an event's
      // video_room works (see recordings.py).
      setCanRecord(true);
      setRecMode("browser");
    } else {
      setCanRecord(false);
    }
  }, [recordEventId, recordChannelId]);

  useEffect(() => {
    onParticipantCount?.(participants.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.length]);

  useEffect(() => {
    if (status !== "connected") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  async function toggleMic() {
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(!micOn);
    } catch {
      setError("Could not access your microphone.");
    }
  }

  async function toggleCamera() {
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(!camOn);
    } catch {
      setError("Could not access your camera.");
    }
  }


  // ---------------------------------------------------------------- recording
  function announce(on) {
    const room = roomRef.current;
    if (!room) return;
    const body = new TextEncoder().encode(JSON.stringify({ t: "rec", on, by: room.localParticipant.name || room.localParticipant.identity }));
    room.localParticipant.publishData(body, { reliable: true }).catch(() => {});
  }

  // Paint every tile of the call onto one canvas (screen shares big, people in a grid).
  function drawFrame() {
    const r = rec.current;
    const root = rootRef.current;
    if (!r.ctx || !root) return;
    const { ctx, canvas } = r;
    ctx.fillStyle = "#0f1b2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tiles = [...root.querySelectorAll(".video-tile")];
    if (tiles.length === 0) return;
    const screens = tiles.filter((t) => t.classList.contains("video-tile-screen"));
    const people = tiles.filter((t) => !t.classList.contains("video-tile-screen"));
    const rects = [];
    const W = canvas.width;
    const H = canvas.height;
    if (screens.length) {
      const mainW = people.length ? Math.floor(W * 0.74) : W;
      rects.push({ el: screens[0], x: 0, y: 0, w: mainW, h: H, contain: true });
      const side = [...screens.slice(1), ...people];
      const sideH = side.length ? Math.floor(H / side.length) : 0;
      side.forEach((el, i) => rects.push({ el, x: mainW + 6, y: i * sideH, w: W - mainW - 6, h: sideH - 6 }));
    } else {
      const n = people.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cw = Math.floor(W / cols);
      const ch = Math.floor(H / rows);
      people.forEach((el, i) => rects.push({ el, x: (i % cols) * cw + 3, y: Math.floor(i / cols) * ch + 3, w: cw - 6, h: ch - 6 }));
    }
    for (const { el, x, y, w, h, contain } of rects) {
      const video = el.querySelector("video");
      const label = el.querySelector(".video-tile-label")?.textContent?.trim() || "";
      ctx.fillStyle = "#1d2a44";
      ctx.fillRect(x, y, w, h);
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const scale = contain ? Math.min(w / video.videoWidth, h / video.videoHeight) : Math.max(w / video.videoWidth, h / video.videoHeight);
        const dw = video.videoWidth * scale;
        const dh = video.videoHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = `bold ${Math.floor(Math.min(w, h) * 0.3)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((label[0] || "?").toUpperCase(), x + w / 2, y + h / 2);
      }
      if (label) {
        ctx.font = "16px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const tw = Math.min(ctx.measureText(label).width + 16, w - 8);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x + 8, y + h - 30, tw, 22);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + 16, y + h - 14, tw - 14);
      }
    }
  }

  // Everyone's microphone (and shared-screen audio) mixed into one track; new
  // joiners are picked up every couple of seconds.
  function syncAudio() {
    const r = rec.current;
    const room = roomRef.current;
    if (!r.audioCtx || !room) return;
    const people = [room.localParticipant, ...room.remoteParticipants.values()];
    for (const p of people) {
      for (const pub of p.getTrackPublications()) {
        const t = pub.track;
        if (pub.kind !== Track.Kind.Audio || !t?.mediaStreamTrack || r.mixed.has(t.sid)) continue;
        try {
          r.audioCtx.createMediaStreamSource(new MediaStream([t.mediaStreamTrack])).connect(r.dest);
          r.mixed.add(t.sid);
        } catch {
          // a track that can't be mixed is skipped rather than breaking the recording
        }
      }
    }
  }

  function startRecording() {
    setConfirmRec(false);
    setRecUpload(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const AC = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AC();
      const dest = audioCtx.createMediaStreamDestination();
      const r = rec.current;
      Object.assign(r, { canvas, ctx: canvas.getContext("2d"), audioCtx, dest, mixed: new Set(), chunks: [], startedAt: Date.now() });
      syncAudio();
      drawFrame();
      const stream = canvas.captureStream(24);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
      recorder.ondataavailable = (e) => e.data.size > 0 && r.chunks.push(e.data);
      r.recorder = recorder;
      r.frameTimer = setInterval(drawFrame, 1000 / 24);
      r.audioTimer = setInterval(syncAudio, 1500);
      r.announceTimer = setInterval(() => announce(true), 8000);
      recorder.start(2000);
      announce(true);
      setRecSeconds(0);
      r.tick = setInterval(() => setRecSeconds(Math.round((Date.now() - r.startedAt) / 1000)), 1000);
      setRecording(true);
    } catch {
      setError("Recording isn't supported in this browser. Try Chrome, Edge or Firefox.");
    }
  }

  // Stops the recorder and uploads the file. Resolves when the upload is done.
  function stopRecording() {
    const r = rec.current;
    if (!r.recorder || r.recorder.state === "inactive") return Promise.resolve();
    return new Promise((resolve) => {
      r.recorder.onstop = async () => {
        clearInterval(r.frameTimer);
        clearInterval(r.audioTimer);
        clearInterval(r.announceTimer);
        clearInterval(r.tick);
        r.audioCtx?.close().catch(() => {});
        announce(false);
        setRecording(false);
        const blob = new Blob(r.chunks, { type: r.recorder.mimeType || "video/webm" });
        const duration = Math.round((Date.now() - r.startedAt) / 1000);
        r.chunks = [];
        r.recorder = null;
        setRecUpload("uploading");
        try {
          const form = new FormData();
          form.append("upload", new File([blob], "recording.webm", { type: blob.type || "video/webm" }));
          if (recordEventId) {
            form.append("duration", String(duration));
            await api.post(`/calendar/events/${recordEventId}/recordings`, form);
          } else {
            await api.post(`/channels/${recordChannelId}/call-recordings`, form);
          }
          setRecUpload("saved");
        } catch (err) {
          setRecUpload("failed");
          setError(err?.response?.data?.detail || "The recording could not be saved.");
        }
        resolve();
      };
      r.recorder.stop();
    });
  }

  function askStartRecording() {
    setConfirmRec(true);
  }

  // Server-side recording: the recorder service joins the room itself, so it
  // carries on if the host leaves or closes the tab.
  async function startServerRecording() {
    setConfirmRec(false);
    setServerRecBusy(true);
    setError("");
    setRecUpload(null);
    try {
      await api.post(`/calendar/events/${recordEventId}/recording/start`);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not start recording.");
    } finally {
      setServerRecBusy(false);
    }
  }

  async function stopServerRecording() {
    setServerRecBusy(true);
    try {
      await api.post(`/calendar/events/${recordEventId}/recording/stop`);
      setRecUpload("processing");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not stop the recording.");
    } finally {
      setServerRecBusy(false);
    }
  }

  async function leave() {
    // Leaving while recording ends the recording and saves it first.
    if (rec.current.recorder) await stopRecording();
    roomRef.current?.disconnect();
    onClose();
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    setError("");
    try {
      await room.localParticipant.setScreenShareEnabled(!sharingScreen);
      // State itself is kept in sync by the LocalTrackPublished/Unpublished
      // handlers above, including the "stopped from the browser bar" case.
    } catch (err) {
      setError(err?.message || "Could not start screen sharing.");
    }
  }

  const localSid = roomRef.current?.localParticipant?.sid;

  return (
    <div className="video-call" ref={rootRef}>
      <div className="video-call-header">
        <span>
          {title || (audioOnly ? "Voice call" : "Video call")}
          {status === "connecting" && " — connecting…"}
          {status === "connected" &&
            ` — ${participants.length} in call · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
        </span>
      </div>
      {serverRec && (
        <div className="rec-banner rec-banner-mine" role="status">
          <span className="rec-dot" /> This meeting is being recorded.
          {canRecord && " It keeps recording even if you leave, until you stop it or everyone leaves."}
        </div>
      )}
      {recording && (
        <div className="rec-banner rec-banner-mine" role="status">
          <span className="rec-dot" /> Recording — {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}. Everyone in the meeting can see this.
        </div>
      )}
      {!recording && !serverRec && remoteRec && (
        <div className="rec-banner" role="status">
          <span className="rec-dot" /> This meeting is being recorded by {remoteRec.by}.
        </div>
      )}
      {recUpload === "uploading" && <div className="rec-banner rec-note">Saving the recording… please keep this window open.</div>}
      {recUpload === "processing" && <div className="rec-banner rec-note">Recording stopped. It's being processed and will appear in the event's details shortly.</div>}
      {recUpload === "saved" && (
        <div className="rec-banner rec-note ok">
          {recordEventId ? "Recording saved to the meeting. Find it in the event's details." : "Recording saved to this conversation. Find it in Files."}
        </div>
      )}
      {confirmRec && (
        <div className="rec-confirm" role="alertdialog" aria-label="Start recording">
          <strong>Record this meeting?</strong>
          <span>
            {recMode === "server"
              ? "Everyone in the call will see a \"Recording\" banner. It's recorded on the server, so it carries on even if you leave."
              : "Everyone in the call will see a \"Recording\" banner. Keep this tab open and visible while recording."}
          </span>
          <div>
            <button type="button" className="small-btn" onClick={() => setConfirmRec(false)}>
              Cancel
            </button>
            <button type="button" className="small-btn admin-btn-bad" onClick={recMode === "server" ? startServerRecording : startRecording}>
              Start recording
            </button>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {screenShares.length > 0 && (
        <div className="video-grid video-grid-screens">
          {screenShares.map((s) => (
            <Tile key={`screen-${s.sid}`} identity={s.identity} isLocal={s.sid === localSid} videoTrack={s.track} screenShare />
          ))}
        </div>
      )}

      <div className="video-grid">
        {participants.map((p) => (
          <Tile key={p.sid} identity={p.identity} isLocal={p.isLocal} videoTrack={p.videoTrack} audioTrack={p.audioTrack} />
        ))}
        {status === "connected" && participants.length <= 1 && (
          <div className="video-waiting">{waitingText || "Waiting for others to join…"}</div>
        )}
      </div>

      <div className="video-call-controls">
        {status === "connected" && canRecord && (
          <button
            type="button"
            className={`control-btn ${recording || serverRec ? "control-btn-rec" : ""}`}
            onClick={recMode === "server" ? (serverRec ? stopServerRecording : askStartRecording) : recording ? stopRecording : askStartRecording}
            disabled={recUpload === "uploading" || serverRecBusy}
            title={recording || serverRec ? "Stop recording" : "Record meeting"}
            aria-label={recording || serverRec ? "Stop recording" : "Record meeting"}
          >
            {recording || serverRec ? <Square size={18} strokeWidth={2} fill="currentColor" /> : <Circle size={20} strokeWidth={2} color="#ef4444" fill="#ef4444" />}
          </button>
        )}
        {status === "connected" && (
          <>
            <button
              type="button"
              className={`control-btn ${micOn ? "" : "control-btn-off"}`}
              onClick={toggleMic}
              title={micOn ? "Mute" : "Unmute"}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              {micOn ? <Mic size={20} strokeWidth={1.8} /> : <MicOff size={20} strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              className={`control-btn ${camOn ? "" : "control-btn-off"}`}
              onClick={toggleCamera}
              title={camOn ? "Turn camera off" : "Turn camera on"}
              aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            >
              {camOn ? <Video size={20} strokeWidth={1.8} /> : <VideoOff size={20} strokeWidth={1.8} />}
            </button>
          </>
        )}
        {status === "connected" && (
          <button
            type="button"
            className={`control-btn ${sharingScreen ? "active" : ""}`}
            onClick={toggleScreenShare}
            title={sharingScreen ? "Stop sharing" : "Share screen"}
            aria-label={sharingScreen ? "Stop sharing" : "Share screen"}
          >
            {sharingScreen ? <ScreenShareOff size={20} strokeWidth={1.8} /> : <ScreenShare size={20} strokeWidth={1.8} />}
          </button>
        )}
        <button
          type="button"
          className="control-btn control-btn-leave"
          onClick={leave}
          title="Leave call"
          aria-label="Leave call"
        >
          <PhoneOff size={20} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
