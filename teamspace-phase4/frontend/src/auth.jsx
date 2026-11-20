import { createContext, useContext, useEffect, useState } from "react";
import { api, saveSession, clearSession, getToken, ORG_SUSPENDED_EVENT } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    if (!getToken()) {
      setUser(null);
      setOrganization(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setOrganization(data.organization);
    } catch {
      clearSession();
      setUser(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suspension can happen while the user already has a tab open -- a REST
  // call hitting 402 (api.js's response interceptor) or the chat WebSocket
  // closing with code 4402 (Chat.jsx) both dispatch this same window event.
  // Re-fetch /auth/me (which itself is never suspension-gated) so
  // organization.suspended_at updates and the route guards in App.jsx swap
  // the user over to the Suspended screen right away, instead of only on
  // their next reload.
  useEffect(() => {
    function handleSuspended() {
      refreshMe();
    }
    window.addEventListener(ORG_SUSPENDED_EVENT, handleSuspended);
    return () => window.removeEventListener(ORG_SUSPENDED_EVENT, handleSuspended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login({ email, password, orgSlug }) {
    const { data } = await api.post("/auth/login", { email, password, org_slug: orgSlug });
    saveSession({ token: data.access_token, orgSlug });
    await refreshMe();
  }

  async function signup({ name, email, password, orgName, inviteCode }) {
    const { data } = await api.post("/auth/signup", {
      name,
      email,
      password,
      org_name: orgName || undefined,
      invite_code: inviteCode || undefined,
    });
    // The server may have de-duped the slug (e.g. "rooman" -> "rooman-3") if
    // the requested org name was already taken, and a join-by-invite signup
    // doesn't know the org's slug up front either, so always log in with the
    // slug the server actually assigned/resolved rather than guessing it
    // client-side.
    await login({ email, password, orgSlug: data.organization.slug });
  }

  function logout() {
    clearSession();
    setUser(null);
    setOrganization(null);
  }

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, signup, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
