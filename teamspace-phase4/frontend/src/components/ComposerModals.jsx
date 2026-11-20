import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, X, Plus, Trash2, RefreshCw, Search } from "lucide-react";
import { api } from "../api";
import Avatar from "./Avatar";
import { ROLE_LABELS, roleBadgeClass } from "../roles";

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal composer-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="link-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Camera
export function CameraModal({ onClose, onUse }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null); // { blob, url }
  const [error, setError] = useState("");

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Could not open your camera. Check that it is connected and that the browser has permission to use it.");
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    start();
    return () => stop();
  }, []);

  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        if (blob) {
          setShot({ blob, url: URL.createObjectURL(blob) });
          stop();
        }
      },
      "image/jpeg",
      0.92,
    );
  }

  function retake() {
    setShot(null);
    start();
  }

  return (
    <Modal title="Take a photo" onClose={onClose} wide>
      {error ? (
        <div className="form-error">{error}</div>
      ) : (
        <div className="camera-stage">
          {shot ? <img src={shot.url} alt="Captured" /> : <video ref={videoRef} autoPlay playsInline muted />}
        </div>
      )}
      <div className="modal-actions">
        {shot ? (
          <>
            <button type="button" className="small-btn" onClick={retake}>
              <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Retake
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => onUse(new File([shot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }))}
            >
              Use photo
            </button>
          </>
        ) : (
          !error && (
            <button type="button" className="primary-btn" onClick={capture}>
              <Camera size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Take photo
            </button>
          )
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Poll
export function PollModal({ channelId, onClose, onSent }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && new Set(filled).size >= 2;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/channels/${channelId}/polls`, { question: question.trim(), options: filled, multiple });
      onSent();
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not create the poll.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Create poll" onClose={onClose}>
      <form className="composer-form" onSubmit={submit}>
        <label>
          Question
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Ask a question" />
        </label>
        <div className="composer-form-group">
          <span className="account-label">Options</span>
          {options.map((o, i) => (
            <div key={i} className="option-row">
              <input
                value={o}
                maxLength={100}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {options.length > 2 && (
                <button type="button" className="icon-btn" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <button type="button" className="link-btn add-option" onClick={() => setOptions((p) => [...p, ""])}>
              <Plus size={13} /> Add option
            </button>
          )}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          <span>
            <strong>Allow multiple answers</strong>
          </span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="primary-btn" disabled={busy || !valid}>
            {busy ? "Sending..." : "Send poll"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Contact
export function ContactModal({ channelId, candidates, onClose, onSent }) {
  const [tab, setTab] = useState("team");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates.filter((p) => !s || p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
  }, [candidates, q]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/channels/${channelId}/contacts`, tab === "team" ? { user_id: picked } : { name: form.name, phone: form.phone, email: form.email });
      onSent();
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not share that contact. Check the phone number and email.");
      setBusy(false);
    }
  }

  const ready = tab === "team" ? !!picked : form.name.trim() && (form.phone.trim() || form.email.trim());

  return (
    <Modal title="Share a contact" onClose={onClose}>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "team"} className={`segment ${tab === "team" ? "active" : ""}`} onClick={() => setTab("team")}>
          Teammate
        </button>
        <button type="button" role="tab" aria-selected={tab === "other"} className={`segment ${tab === "other" ? "active" : ""}`} onClick={() => setTab("other")}>
          Someone else
        </button>
      </div>
      <form className="composer-form" onSubmit={submit}>
        {tab === "team" ? (
          <>
            <div className="search-field">
              <Search size={14} />
              <input autoFocus placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="pick-list">
              {shown.length === 0 && <div className="empty-state">No one to show.</div>}
              {shown.map((p) => (
                <label key={p.id} className="pick-row">
                  <input type="radio" name="contact" checked={picked === p.id} onChange={() => setPicked(p.id)} />
                  <Avatar name={p.name} url={p.avatar_url} size={26} />
                  <span className="person-name">{p.name}</span>
                  <span className={`status-badge ${roleBadgeClass(p.org_role)}`}>{ROLE_LABELS[p.org_role]}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <label>
              Name
              <input autoFocus value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} maxLength={30} inputMode="tel" placeholder="+91 98765 43210" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} maxLength={200} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <p className="poll-hint">Add a phone number, an email, or both.</p>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="primary-btn" disabled={busy || !ready}>
            {busy ? "Sending..." : "Send contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Event
function pad(n) {
  return String(n).padStart(2, "0");
}

export function EventModal({ channelId, isTeamChannel, onClose, onSent }) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [start, setStart] = useState(`${pad(now.getHours())}:00`);
  const [end, setEnd] = useState(`${pad(later.getHours())}:00`);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [video, setVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const s = new Date(`${date}T${start}`);
    const en = new Date(`${date}T${end}`);
    if (!(en > s)) {
      setError("The event must end after it starts.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(`/channels/${channelId}/events`, {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: s.toISOString(),
        end_time: en.toISOString(),
        enable_video: video,
      });
      onSent();
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not create the event.");
      setBusy(false);
    }
  }

  return (
    <Modal title="New event" onClose={onClose}>
      <form className="composer-form" onSubmit={submit}>
        <label>
          Event name
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Sprint planning" />
        </label>
        <div className="event-time-row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            From
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            To
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <label>
          Location (optional)
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Room, address or link" />
        </label>
        <label>
          Description (optional)
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
          <span>
            <strong>Add a video meeting</strong>
            <em>Everyone invited gets a Join button</em>
          </span>
        </label>
        <p className="poll-hint">
          {isTeamChannel ? "This will be added to the team calendar." : "Everyone in this chat will be invited and sees it in their calendar."}
        </p>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="primary-btn" disabled={busy || !title.trim()}>
            {busy ? "Creating..." : "Create & share"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Sticker
export function StickerModal({ channelId, onClose, onSent }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  function pick(f) {
    setError("");
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
      setError("Please choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("Stickers can be at most 2 MB.");
      return;
    }
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("upload", file);
      await api.post(`/channels/${channelId}/stickers`, form);
      onSent();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send the sticker.");
      setBusy(false);
    }
  }

  return (
    <Modal title="New sticker" onClose={onClose}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <div
        className="sticker-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        {url ? (
          <img src={url} alt="Sticker preview" />
        ) : (
          <button type="button" className="link-btn" onClick={() => inputRef.current?.click()}>
            Choose an image (or drop it here)
          </button>
        )}
      </div>
      <p className="poll-hint">Images with a transparent background (PNG / WebP) look best. Up to 2 MB.</p>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        {file && (
          <button type="button" className="small-btn" onClick={() => inputRef.current?.click()}>
            Choose another
          </button>
        )}
        <button type="button" className="primary-btn" disabled={!file || busy} onClick={send}>
          {busy ? "Sending..." : "Send sticker"}
        </button>
      </div>
    </Modal>
  );
}
