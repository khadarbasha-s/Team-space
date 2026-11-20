import { useCallback, useEffect, useState } from "react";
import { Download, Play, Trash2, Film, Phone, CalendarDays } from "lucide-react";
import { api } from "../api";
import Shell from "../Shell";

function size(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dur(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

// Every recording this user has personally made -- ad-hoc calls (Leads /
// Members / Chat's call button) and calendar meetings they recorded --
// merged into one feed by GET /recordings/mine (recordings.py). Deliberately
// scoped to "my own recordings"; a meeting's full recording list (everyone
// who recorded it) still lives on the event itself (MeetingRecordings.jsx).
export default function Recordings() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(null); // { name, url }
  const [loadingId, setLoadingId] = useState(null);

  const load = useCallback(() => {
    api
      .get("/recordings/mine")
      .then(({ data }) => setItems(data))
      .catch(() => setError("Could not load your recordings."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While one of this user's own meeting recordings is still being
  // processed server-side, keep checking until it's ready.
  const busy = items?.some((r) => r.status === "recording" || r.status === "processing");
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [busy, load]);

  useEffect(() => () => playing && URL.revokeObjectURL(playing.url), [playing]);

  async function fetchBlob(r) {
    const res = await api.get(r.download_url, { responseType: "blob" });
    return res.data;
  }

  async function play(r) {
    setError("");
    setLoadingId(r.id);
    try {
      setPlaying({ name: r.title, url: URL.createObjectURL(await fetchBlob(r)) });
    } catch {
      setError("Could not load that recording.");
    } finally {
      setLoadingId(null);
    }
  }

  async function download(r) {
    setError("");
    setLoadingId(r.id);
    try {
      const url = URL.createObjectURL(await fetchBlob(r));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.title.replace(/[^A-Za-z0-9]+/g, "_")}.${r.content_type === "video/mp4" ? "mp4" : "webm"}`;
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

  async function remove(r) {
    if (!window.confirm("Delete this recording? This can't be undone.")) return;
    setError("");
    try {
      if (r.type === "call") {
        await api.delete(`/messages/${r.message_id}`);
      } else {
        await api.delete(`/recordings/${r.id}`);
      }
      setPlaying(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not delete that recording.");
    }
  }

  return (
    <Shell>
      <main className="detailpanel">
        <div className="conv-header">
          <strong>
            <Film size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Recordings
          </strong>
          <span className="conv-channel">Recordings you've made, from calls and meetings</span>
        </div>

        <div className="admin-body">
          {error && <div className="form-error">{error}</div>}

          {items === null ? (
            <div className="empty-state">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              You haven't recorded anything yet. Start a call or a meeting and press Record -- it'll show up here.
            </div>
          ) : (
            <ul className="recordings-list">
              {items.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <span className="rec-name">
                    <strong>
                      {r.type === "call" ? (
                        <Phone size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      ) : (
                        <CalendarDays size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      )}
                      {r.title}
                    </strong>
                    <em>
                      {[formatDateTime(r.created_at), r.status === "ready" && dur(r.duration_seconds), r.status === "ready" && size(r.size_bytes)]
                        .filter(Boolean)
                        .join(" · ")}
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
                  <button type="button" className="small-btn admin-btn-bad" onClick={() => remove(r)} aria-label="Delete recording">
                    <Trash2 size={12} style={{ verticalAlign: "-2px" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {playing && (
            <div className="recording-player">
              <video src={playing.url} controls autoPlay />
              <button type="button" className="link-btn" onClick={() => setPlaying(null)}>
                Close player
              </button>
            </div>
          )}
        </div>
      </main>
    </Shell>
  );
}
