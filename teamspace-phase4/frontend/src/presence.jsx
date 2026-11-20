import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, WS_BASE, getToken } from "./api";
import { useAuth } from "./auth";

// Org-wide online/away/busy presence, backed by a single /ws/presence socket
// (see backend/app/routers/presence.py + ws_manager.py's OrgPresenceManager).
// Lives above <Shell> (mounted once in App.jsx, inside AuthProvider) so every
// page -- Chat, Members, Shell's own topbar -- reads the same live map
// instead of each opening its own socket.
const PresenceContext = createContext({
  presence: {},
  myStatus: "available",
  setStatus: async () => {},
});

export function PresenceProvider({ children }) {
  const { user } = useAuth();
  const [presence, setPresence] = useState({}); // user_id -> { online, status }
  const [myStatus, setMyStatus] = useState("available");
  const wsRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setPresence({});
      return;
    }

    let cancelled = false;
    api
      .get("/presence")
      .then(({ data }) => {
        if (cancelled) return;
        const map = {};
        for (const p of data) {
          map[p.user_id] = { online: p.online, status: p.status };
        }
        setPresence(map);
        if (map[user.id]) setMyStatus(map[user.id].status);
      })
      .catch(() => {
        // Not fatal -- the socket's own messages will fill this in as they
        // arrive, and a failed snapshot just means dots start blank.
      });

    const ws = new WebSocket(`${WS_BASE}/ws/presence?token=${getToken()}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "presence") {
        setPresence((prev) => ({
          ...prev,
          [data.user_id]: { online: data.online, status: prev[data.user_id]?.status || "available" },
        }));
      } else if (data.type === "status") {
        setPresence((prev) => ({
          ...prev,
          [data.user_id]: { online: prev[data.user_id]?.online ?? true, status: data.status },
        }));
        if (data.user_id === user.id) setMyStatus(data.status);
      } else if (data.type === "new_message" || data.type === "conversation_added" || data.type === "incoming_call" || data.type === "call_update" || data.type === "guest_request" || data.type === "guest_request_done" || data.type === "team_added" || data.type === "team_removed") {
        // Instant unread badges / new-conversation notices -- Chat.jsx listens for this.
        window.dispatchEvent(new CustomEvent("teamspace:push", { detail: data }));
      }
    };
    wsRef.current = ws;

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function setStatus(status) {
    const prev = myStatus;
    setMyStatus(status); // optimistic -- the /ws/presence broadcast will confirm it right after
    try {
      await api.post("/presence/status", { status });
    } catch {
      setMyStatus(prev);
    }
  }

  return (
    <PresenceContext.Provider value={{ presence, myStatus, setStatus }}>{children}</PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
