import { useEffect, useState } from "react";
import { api } from "./api";

export default function RecapPanel({ channelId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/channels/${channelId}/summary`);
      setSummary(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not generate a recap.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return (
    <div className="recap-panel">
      <div className="recap-disclosure">
        Quick recap, generated locally from this channel's messages (word-frequency
        highlighting, not an external AI model) &mdash;{" "}
        <button className="link-btn" onClick={loadSummary}>
          refresh
        </button>
      </div>

      {loading && <div className="empty-state">Reading the channel...</div>}
      {error && <div className="form-error">{error}</div>}

      {!loading && summary && summary.message_count === 0 && (
        <div className="empty-state">No messages in this channel yet to recap.</div>
      )}

      {!loading && summary && summary.message_count > 0 && (
        <>
          <div className="recap-stats">
            <div className="recap-stat">
              <strong>{summary.message_count}</strong>
              <span>messages</span>
            </div>
            <div className="recap-stat">
              <strong>{summary.participants.length}</strong>
              <span>people</span>
            </div>
          </div>

          {summary.keywords.length > 0 && (
            <div className="recap-keywords">
              {summary.keywords.map((k) => (
                <span key={k} className="keyword-chip">
                  {k}
                </span>
              ))}
            </div>
          )}

          <h3 className="recap-heading">Highlights</h3>
          <ul className="recap-highlights">
            {summary.highlights.map((m) => (
              <li key={m.id} className="recap-highlight-row">
                <div className="recap-highlight-author">{m.user_name}</div>
                <div className="recap-highlight-content">{m.content}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
