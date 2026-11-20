import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
export const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";

// Absolute URL for a backend-relative asset path such as "/avatars/<file>.png".
export function assetUrl(path) {
  return path ? `${API_BASE}${path}` : null;
}

export const api = axios.create({ baseURL: API_BASE });

// Fired whenever the backend tells us the current org has been suspended
// (REST 402 Payment Required, per app/deps.py's get_active_user). Anything
// that holds org/user state -- right now just AuthProvider -- should listen
// for this and re-fetch /auth/me so the UI flips to the Suspended screen
// immediately instead of only on the user's next reload. The WebSocket
// close code 4402 in Chat.jsx's ws.onclose dispatches this same event, so
// both paths (REST and live chat socket) converge on one signal.
export const ORG_SUSPENDED_EVENT = "teamspace:org-suspended";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 402) {
      window.dispatchEvent(new CustomEvent(ORG_SUSPENDED_EVENT));
    }
    return Promise.reject(error);
  }
);

export function saveSession({ token, orgSlug }) {
  localStorage.setItem("token", token);
  localStorage.setItem("orgSlug", orgSlug);
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("orgSlug");
}

export function getToken() {
  return localStorage.getItem("token");
}
