import { Link } from "react-router-dom";
import { Ban } from "lucide-react";
import { useAuth } from "../auth";
import Brand from "../components/Brand";

// Shown in place of the normal workspace whenever the signed-in user's
// organization has been suspended by a platform admin (see Admin.jsx /
// backend app/deps.py::get_active_user). Platform admins themselves never
// see this screen -- they're the ones who can lift the suspension.
export default function Suspended() {
  const { user, organization, logout } = useAuth();
  const isOrgAdmin = user?.org_role === "org_admin";

  return (
    <div className="auth-screen suspended-screen">
      <div className="auth-card" style={{ textAlign: "center", alignItems: "center" }}>
        <Brand className="auth-card-brand" />
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "color-mix(in srgb, var(--bad) 14%, transparent)",
            color: "var(--bad)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ban size={22} strokeWidth={2} />
        </div>
        <h1 className="auth-title">Workspace suspended</h1>
        <p className="auth-subtitle">
          {organization?.name ? `${organization.name} has` : "Your organization has"} been
          suspended. Chat, files, calendar, and calls are unavailable until the account is
          reactivated.
        </p>
        {organization?.suspended_reason && (
          <p className="auth-subtitle">
            <strong>Reason:</strong> {organization.suspended_reason}
          </p>
        )}
        <p className="auth-subtitle">
          {isOrgAdmin
            ? "As an organization admin you can pay now and access returns immediately."
            : "Please ask your organization admin to renew the subscription, or contact our support team."}
        </p>
        {isOrgAdmin && (
          <Link className="primary-btn" to="/billing" style={{ textDecoration: "none", padding: "11px 22px" }}>
            Pay &amp; reactivate
          </Link>
        )}
        <button className={isOrgAdmin ? "link-btn" : "primary-btn"} type="button" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
