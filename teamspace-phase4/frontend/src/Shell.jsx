import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageSquare, CalendarDays, Boxes, ShieldCheck, Users, Bell, ChevronDown, CreditCard, Building2, Film } from "lucide-react";
import { useAuth } from "./auth";
import { usePresence } from "./presence";
import { api, assetUrl } from "./api";

const STATUS_LABEL = { available: "Available", away: "Away", busy: "Busy" };
const STATUS_OPTIONS = ["available", "away", "busy"];

// Self-service available/away/busy picker, backed by POST /presence/status
// (see presence.jsx) -- the dot's color mirrors the same classes Chat.jsx
// and Members.jsx use for other people's dots, so "busy" always means the
// same shade of red everywhere.
function StatusPicker() {
  const { myStatus, setStatus } = usePresence();
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="status-picker-wrap" ref={popRef}>
      <button
        type="button"
        className="status-picker-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Status: ${STATUS_LABEL[myStatus] || "Available"}`}
      >
        <span className={`presence-dot presence-${myStatus}`} />
        {STATUS_LABEL[myStatus] || "Available"}
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {open && (
        <div className="status-picker-dropdown" role="menu">
          {STATUS_OPTIONS.map((s) => (
            <button
              type="button"
              key={s}
              className={`status-picker-item ${s === myStatus ? "active" : ""}`}
              onClick={() => {
                setStatus(s);
                setOpen(false);
              }}
            >
              <span className={`presence-dot presence-${s}`} />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const NOTIF_POLL_MS = 20000;

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// occurrence_start arrives as a UTC ISO timestamp (e.g. "...T10:30:00Z").
// `new Date(...)` parses that correctly regardless of the viewer's zone, but
// the server intentionally does NOT pre-format it into text (see
// reminders.py / calendar.py's _notify_invite) -- a baked-in strftime string
// would always read in the *server's* zone for every viewer. Formatting it
// here with toLocaleString means each viewer sees the event's start time in
// their own browser's timezone.
function formatEventTime(iso) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Polls GET /notifications rather than opening a dedicated WebSocket
// channel -- simpler and reliable enough at this app's scale, same
// trade-off already made elsewhere (see reminders.py's background loop).
function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  async function load() {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 30 } });
      setNotifications(data);
    } catch {
      // Not fatal -- just skip this poll.
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, NOTIF_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(n) {
    if (n.read_at) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    try {
      await api.post(`/notifications/${n.id}/read`);
    } catch {
      load();
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    try {
      await api.post("/notifications/read-all");
    } catch {
      load();
    }
  }

  return (
    <div className="notif-bell-wrap" ref={popRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={18} strokeWidth={1.8} />
        {unreadCount > 0 && <span className="notif-bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown" role="menu">
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-dropdown-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">You're all caught up.</div>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={`notif-item ${n.read_at ? "" : "unread"}`}
                  onClick={() => markRead(n)}
                >
                  <span className="notif-item-title">{n.title}</span>
                  {n.occurrence_start && (
                    <span className="notif-item-when">{formatEventTime(n.occurrence_start)}</span>
                  )}
                  {n.body && <span className="notif-item-body">{n.body}</span>}
                  <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "Chat", icon: MessageSquare },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  // Visible to every active member, not just org_admins -- anyone in the
  // org can see who else is in it; Members.jsx itself hides the
  // invite/role-change/remove controls from non-admins.
  { to: "/members", label: "Members", icon: Users },
  // Recordings this user has personally made (ad-hoc calls + meetings they
  // recorded) -- see Recordings.jsx / GET /recordings/mine.
  { to: "/recordings", label: "Recordings", icon: Film },
];

const BILLING_NAV_ITEM = { to: "/billing", label: "Billing", icon: CreditCard };
const ADMIN_NAV_ITEM = { to: "/admin", label: "Orgs", icon: Building2 };

export default function Shell({ children }) {
  const { user, organization, logout } = useAuth();
  const { myStatus } = usePresence();
  const location = useLocation();
  const isOrgAdmin = user?.org_role === "org_admin";

  // Apply the user's saved theme (Light / Dark / System) to the whole page.
  useEffect(() => {
    const root = document.documentElement;
    if (user?.theme === "light" || user?.theme === "dark") root.dataset.theme = user.theme;
    else delete root.dataset.theme;
  }, [user?.theme]);
  const navItems = [
    ...NAV_ITEMS,
    ...(isOrgAdmin ? [BILLING_NAV_ITEM] : []),
    ...(user?.is_platform_admin ? [ADMIN_NAV_ITEM] : []),
  ];
  const trialDaysLeft =
    organization?.plan === "trial" && organization?.trial_ends_at && !organization?.suspended_at
      ? Math.max(0, Math.ceil((new Date(organization.trial_ends_at).getTime() - Date.now()) / 86400000))
      : null;

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">
          <span className="brand-mark">
            <Boxes size={15} strokeWidth={2.3} />
          </span>
          <span className="brand-name">TeamSpace</span>
        </span>
        <div className="topbar-right">
          <span className="org-name">{organization?.name}</span>
          <StatusPicker />
          <NotificationBell />
          <Link className="avatar" to="/account" title={`${user?.name} -- Account settings`}>
            {user?.avatar_url ? <img className="avatar-photo" src={assetUrl(user.avatar_url)} alt="" /> : user ? initials(user.name) : ""}
            <span className={`avatar-presence online presence-${myStatus}`} aria-label={`Online -- ${myStatus}`} />
          </Link>
          <button className="link-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      {trialDaysLeft !== null && (
        <div className={`trial-banner ${trialDaysLeft <= 3 ? "trial-banner-bad" : ""}`}>
          <span>
            Free trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</strong>.
          </span>
          {isOrgAdmin ? (
            <Link to="/billing">Subscribe now</Link>
          ) : (
            <span>Ask your organization admin to subscribe.</span>
          )}
        </div>
      )}

      <div className="body">
        <nav className="navrail">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              className={`navitem ${location.pathname === to ? "active" : ""}`}
              to={to}
              aria-current={location.pathname === to ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
