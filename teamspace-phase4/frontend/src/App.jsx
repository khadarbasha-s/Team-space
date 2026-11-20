import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { PresenceProvider } from "./presence";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";
import Calendar from "./pages/Calendar";
import Members from "./pages/Members";
import Recordings from "./pages/Recordings";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import Suspended from "./pages/Suspended";
import Billing from "./pages/Billing";
import { CallProvider } from "./call";
import GuestMeeting from "./pages/GuestMeeting";
import ServiceDetail from "./pages/ServiceDetail";
import HowItWorks from "./pages/HowItWorks";
import Solutions from "./pages/Solutions";
import Pricing from "./pages/Pricing";
import Resources from "./pages/Resources";
import Support from "./pages/Support";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

// Mirrors the backend's get_active_user gate (app/deps.py): a suspended
// org's members see the Suspended screen instead of the page they asked
// for, everywhere except /admin -- platform admins are never blocked, here
// or on the API, since they're the ones who lift the suspension.
function RequireActiveWorkspace({ children }) {
  const { user, organization } = useAuth();
  if (organization?.suspended_at && !user?.is_platform_admin) return <Suspended />;
  return children;
}

// Billing is reachable even while the workspace is suspended (that is exactly
// when an org admin needs it to pay), so it only requires org-admin rights.
function RequireOrgAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (user?.org_role !== "org_admin" && !user?.is_platform_admin) return <Navigate to="/" replace />;
  return children;
}

// Gate for /admin, mirroring the backend's require_platform_admin -- a
// non-admin who navigates here just bounces back to their workspace.
function RequirePlatformAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user?.is_platform_admin) return <Navigate to="/" replace />;
  return children;
}

// "/" is the public landing page for guests, and the signed-in workspace
// (Chat) for anyone already logged in -- so sign-up/login keep redirecting
// to "/" and land wherever is correct for that visitor. Signed-in members
// of a suspended org get the Suspended screen here too, since "/" is their
// usual landing spot once logged in.
function Home() {
  const { user, organization, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Landing />;
  if (organization?.suspended_at && !user.is_platform_admin) return <Suspended />;
  return <Chat />;
}

export default function App() {
  return (
    <AuthProvider>
      <PresenceProvider>
      <CallProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthed>
              <Signup />
            </RedirectIfAuthed>
          }
        />
        <Route path="/meet/:token" element={<GuestMeeting />} />
        <Route path="/" element={<Home />} />
        <Route path="/services/:slug" element={<ServiceDetail />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/solutions" element={<Solutions />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/support" element={<Support />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/calendar"
          element={
            <RequireAuth>
              <RequireActiveWorkspace>
                <Calendar />
              </RequireActiveWorkspace>
            </RequireAuth>
          }
        />
        <Route
          path="/members"
          element={
            <RequireAuth>
              <RequireActiveWorkspace>
                <Members />
              </RequireActiveWorkspace>
            </RequireAuth>
          }
        />
        <Route
          path="/recordings"
          element={
            <RequireAuth>
              <RequireActiveWorkspace>
                <Recordings />
              </RequireActiveWorkspace>
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <RequireActiveWorkspace>
                <Account />
              </RequireActiveWorkspace>
            </RequireAuth>
          }
        />
        <Route
          path="/billing"
          element={
            <RequireAuth>
              <RequireOrgAdmin>
                <Billing />
              </RequireOrgAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequirePlatformAdmin>
                <Admin />
              </RequirePlatformAdmin>
            </RequireAuth>
          }
        />
      </Routes>
      </CallProvider>
      </PresenceProvider>
    </AuthProvider>
  );
}
