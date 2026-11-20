import { useEffect, useRef, useState } from "react";
import { api } from "./api";

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPanel({ channelId }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function loadFiles() {
    const { data } = await api.get(`/channels/${channelId}/files`);
    setFiles(data);
  }

  useEffect(() => {
    setFiles([]);
    setError("");
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function handleUpload(e) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!picked) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("upload", picked);
      // Let the browser/axios set the multipart boundary itself -- an
      // explicit Content-Type header here would drop the boundary param
      // and break parsing on the server.
      await api.post(`/channels/${channelId}/files`, form);
      await loadFiles();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile(file) {
    const res = await api.get(`/files/${file.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="files-panel">
      <div className="files-toolbar">
        <button className="small-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload a file"}
        </button>
        <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
      </div>
      {error && <div className="form-error">{error}</div>}

      {files.length === 0 ? (
        <div className="empty-state">No files shared in this channel yet.</div>
      ) : (
        <table className="file-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Uploaded by</th>
              <th scope="col">Date</th>
              <th scope="col">Size</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="file-name-cell">
                    <span className="file-icon">
                      {f.filename.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
                    </span>
                    <span className="file-name">{f.filename}</span>
                  </div>
                </td>
                <td className="file-col-quiet">{f.uploader_name}</td>
                <td className="file-col-quiet">{new Date(f.created_at).toLocaleString()}</td>
                <td className="file-col-quiet">{humanSize(f.size_bytes)}</td>
                <td>
                  <button className="small-btn" onClick={() => downloadFile(f)}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
