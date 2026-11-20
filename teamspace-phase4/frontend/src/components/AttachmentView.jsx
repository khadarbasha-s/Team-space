import { useEffect, useState } from "react";
import { Download, FileText, FileArchive, FileSpreadsheet, FileImage, Play } from "lucide-react";
import { api } from "../api";

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(att) {
  const n = att.filename.toLowerCase();
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return FileArchive;
  if (/\.(xlsx?|csv)$/.test(n)) return FileSpreadsheet;
  if (att.content_type.startsWith("image/")) return FileImage;
  return FileText;
}

async function fetchBlob(id) {
  const res = await api.get(`/files/${id}/download`, { responseType: "blob" });
  return res.data;
}

export async function downloadAttachment(att) {
  const blob = await fetchBlob(att.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A file attached to a chat message: images and voice notes show inline,
// video clips load on click, everything else is a download card. Files are
// fetched with the user's auth token (they're private to the conversation),
// so they're turned into temporary blob URLs rather than plain links.
export default function AttachmentView({ att, sticker = false }) {
  const type = att.content_type || "";
  const isImage = type.startsWith("image/") && type !== "image/svg+xml";
  const isAudio = type.startsWith("audio/");
  const isVideo = type.startsWith("video/");
  const auto = isImage || isAudio;
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (url || loading) return;
    setLoading(true);
    try {
      const blob = await fetchBlob(att.id);
      setUrl(URL.createObjectURL(blob));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (auto) load();
    return () => {
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.id]);

  if (sticker) {
    return (
      <div className="att att-sticker">
        {url ? <img src={url} alt="Sticker" /> : <div className="att-placeholder">{error ? "Couldn't load sticker" : "..."}</div>}
      </div>
    );
  }
  if (isImage) {
    return (
      <div className="att att-image">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title={`${att.filename} (${humanSize(att.size_bytes)})`}>
            <img src={url} alt={att.filename} />
          </a>
        ) : (
          <div className="att-placeholder">{error ? "Couldn't load image" : "Loading image..."}</div>
        )}
      </div>
    );
  }
  if (isAudio) {
    return (
      <div className="att att-audio">
        {url ? <audio controls src={url} preload="metadata" /> : <div className="att-placeholder">{error ? "Couldn't load audio" : "Loading audio..."}</div>}
        <span className="att-meta">{att.filename.startsWith("clip-") ? "Voice message" : att.filename} · {humanSize(att.size_bytes)}</span>
      </div>
    );
  }
  if (isVideo) {
    return (
      <div className="att att-video">
        {url ? (
          <video controls src={url} preload="metadata" />
        ) : (
          <button type="button" className="att-video-load" onClick={load} disabled={loading}>
            <Play size={22} /> {loading ? "Loading..." : error ? "Retry" : "Play video"}
            <span className="att-meta">{att.filename.startsWith("clip-") ? "Video message" : att.filename} · {humanSize(att.size_bytes)}</span>
          </button>
        )}
      </div>
    );
  }
  const Icon = iconFor(att);
  return (
    <div className="att att-file">
      <span className="att-file-icon">
        <Icon size={20} strokeWidth={1.7} />
      </span>
      <span className="att-file-main">
        <span className="att-file-name" title={att.filename}>
          {att.filename}
        </span>
        <span className="att-meta">
          {att.filename.split(".").pop()?.toUpperCase().slice(0, 5)} · {humanSize(att.size_bytes)}
        </span>
      </span>
      <button type="button" className="small-btn att-download" onClick={() => downloadAttachment(att).catch(() => setError(true))}>
        <Download size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
        Download
      </button>
    </div>
  );
}
