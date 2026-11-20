import { useCallback, useEffect, useState } from "react";
import { Download, Play, Trash2, Film } from "lucide-react";
import { api } from "../api";

function size(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dur(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Recordings of a meeting, shown in the event details to everyone who can see
// the event. Files are private, so they're fetched with the login token and
// played from a temporary blob URL.
export default function MeetingRecordings({ eventId, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [playing, setPlaying] = useState(null); // { name, url }
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get(`/calendar/events/${eventId}/recordings`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // While a server recording is running or being processed, keep checking.
  const busy = data?.items?.some((r) => r.status === "recording" || r.status === "processing");
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [busy, load]);

  useEffect(() => () => playing && URL.revokeObjectURL(playing.url), [playing]);

  async function fetchBlob(rec) {
    const res = await api.get(`/recordings/${rec.id}/download`, { responseType: "blob" });
    return res.data;
  }

  async function play(rec) {
    setError("");
    setLoadingId(rec.id);
    try {
      setPlaying({ name: rec.filename, url: URL.createObjectURL(await fetchBlob(rec)) });
    } catch {
      setError("Could not load that recording.");
    } finally {
      setLoadingId(null);
    }
  }

  async function download(rec) {
    setError("");
    setLoadingId(rec.id);
    try {
      const url = URL.createObjectURL(await fetchBlob(rec));
      const a = document.createElement("a");
      a.href = url;
      a.download = rec.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not download that recording.");
    } finally {
      setLoadingId(null);
    }
  }

  async function remove(rec) {
    if (!window.confirm("Delete this recording? This can't be undone.")) return;
    try {
      await api.delete(`/recordings/${rec.id}`);
      setPlaying(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not delete the recording.");
    }
  }

  if (!data || data.items.length === 0) return null;

  return (
    <div className="recordings-box">
      <div className="event-form-section-label">
        <Film size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
        Recordings
      </div>
      <ul className="recordings-list">
        {data.items.map((r) => (
          <li key={r.id}>
            <span className="rec-name">
              {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              <em>
                {[r.status === "ready" && dur(r.duration_seconds), r.status === "ready" && size(r.size_bytes), r.recorded_by && `by ${r.recorded_by}`].filter(Boolean).join(" · ")}
              </em>
            </span>
            {r.status === "ready" ? (
              <>
                <button type="button" className="small-btn" onClick={() => play(r)} disabled={loadingId === r.id} aria-label="Play recording">
                  <Play size={12} style={{ verticalAlign: "-2px" }} /> {loadingId === r.id ? "Loading…" : "Play"}
                </button>
                <button type="button" className="small-btn" onClick={() => download(r)} disabled={loadingId === r.id} aria-label="Download recording">
                  <Download size={12} style={{ verticalAlign: "-2px" }} />
                </button>
              </>
            ) : (
              <span className={`rec-status ${r.status}`}>
                {r.status === "recording" ? "● Recording now" : r.status === "processing" ? "Processing…" : "Failed"}
              </span>
            )}
            {data.can_record && (
              <button type="button" className="small-btn admin-btn-bad" onClick={() => remove(r)} aria-label="Delete recording">
                <Trash2 size={12} style={{ verticalAlign: "-2px" }} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {playing && (
        <div className="recording-player">
          <video src={playing.url} controls autoPlay />
          <button type="button" className="link-btn" onClick={() => setPlaying(null)}>
            Close player
          </button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
