import { useEffect, useState } from "react";
import { Building2, Ban, CheckCircle2, Search, Users, ScrollText, LayoutDashboard } from "lucide-react";
import { api } from "../api";
import { ROLE_LABELS, roleBadgeClass } from "../roles";
import Shell from "../Shell";

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Status is derived client-side from the same fields the backend already
// computes per-org (suspended flag + overdue_invoice_count) rather than
// introducing a second source of truth for "is this org okay".
function orgStatus(org) {
  switch (org.billing_status) {
    case "suspended":
      return { label: "Suspended", className: "status-badge status-bad" };
    case "past_due":
    case "trial_expired":
      return { label: "Overdue", className: "status-badge status-bad" };
    case "trial":
      return { label: "Trial", className: "status-badge status-warn" };
    case "free":
      return { label: "Free", className: "status-badge status-good" };
    default:
      if (org.overdue_invoice_count > 0) return { label: "Overdue", className: "status-badge status-warn" };
      return { label: "Active", className: "status-badge status-good" };
  }
}

function formatDateTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

const ACTION_LABELS = {
  org_created: "Organization created",
  login: "Logged in",
  password_changed: "Password changed",
  member_joined: "Member joined (invite link)",
  member_added: "Member added",
  member_removed: "Member removed",
  member_left: "Member left",
  member_role_changed: "Role changed",
  invite_link_regenerated: "Invite link regenerated",
  invite_emailed: "Invite emailed",
  invite_email_failed: "Invite email failed",
  invoice_created: "Invoice created",
  payment_received: "Payment received",
  org_suspended: "Organization suspended",
  org_reactivated: "Organization reactivated",
};

const ACTION_TONE = {
  org_suspended: "status-bad",
  invite_email_failed: "status-bad",
  member_removed: "status-bad",
  member_left: "status-warn",
  org_reactivated: "status-good",
  payment_received: "status-good",
  org_created: "status-good",
};

function money(cents, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function AuditTable({ rows, showOrg }) {
  if (rows.length === 0) return <div className="empty-state">No activity recorded yet.</div>;
  return (
    <div className="audit-scroll">
    <table className="file-table audit-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Action</th>
          {showOrg && <th>Organization</th>}
          <th>Target</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="file-col-quiet" style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.created_at)}</td>
            <td>{r.actor}</td>
            <td>
              <span className={`status-badge ${ACTION_TONE[r.action] || "status-neutral"}`}>
                {ACTION_LABELS[r.action] || r.action}
              </span>
            </td>
            {showOrg && <td className="file-col-quiet">{r.org_name || "--"}</td>}
            <td className="file-col-quiet">{r.target || "--"}</td>
            <td className="file-col-quiet">{r.detail || "--"}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div className="org-fact">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

function nextDueDefault() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export default function Admin() {
  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("overview"); // "overview" | "members" | "billing" | "audit"
  const [view, setView] = useState("org"); // "org" | "global" (all-activity feed)
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditAction, setAuditAction] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditMore, setAuditMore] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(nextDueDefault());
  const [suspendReason, setSuspendReason] = useState("");

  async function loadOrgs() {
    const { data } = await api.get("/admin/organizations");
    setOrgs(data);
    if (!selectedOrgId && data.length > 0) setSelectedOrgId(data[0].id);
  }

  async function loadInvoices(orgId) {
    if (!orgId) return;
    const { data } = await api.get(`/admin/organizations/${orgId}/invoices`);
    setInvoices(data);
  }

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedOrgId) return;
    api.get(`/admin/organizations/${selectedOrgId}/members`).then(({ data }) => setMembers(data)).catch(() => setMembers([]));
  }, [selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setOverview(null);
    api.get(`/admin/organizations/${selectedOrgId}/overview`).then(({ data }) => setOverview(data)).catch(() => setOverview(null));
  }, [selectedOrgId]);

  const PAGE = 50;
  async function loadAudit(append = false) {
    const scope = view === "global" ? {} : { org_id: selectedOrgId };
    if (view === "org" && !selectedOrgId) return;
    const params = { ...scope, limit: PAGE, offset: append ? audit.length : 0 };
    if (auditAction) params.action = auditAction;
    if (auditQuery.trim()) params.q = auditQuery.trim();
    const { data } = await api.get("/admin/audit-log", { params });
    setAudit(append ? [...audit, ...data] : data);
    setAuditMore(data.length === PAGE);
  }

  useEffect(() => {
    if (view === "global" || tab === "audit") loadAudit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tab, selectedOrgId, auditAction]);

  useEffect(() => {
    loadInvoices(selectedOrgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
  const q = query.trim().toLowerCase();
  const visibleOrgs = q ? orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)) : orgs;
  const counts = orgs.reduce((acc, o) => {
    acc[orgStatus(o).label] = (acc[orgStatus(o).label] || 0) + 1;
    return acc;
  }, {});

  async function createInvoice(e) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!description.trim() || !cents || cents <= 0) return;
    setError("");
    try {
      await api.post(`/admin/organizations/${selectedOrgId}/invoices`, {
        description: description.trim(),
        amount_cents: cents,
        due_date: new Date(dueDate).toISOString(),
      });
      setDescription("");
      setAmount("");
      setDueDate(nextDueDefault());
      setShowInvoiceModal(false);
      await Promise.all([loadOrgs(), loadInvoices(selectedOrgId)]);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create that invoice.");
    }
  }

  async function markPaid(invoiceId) {
    await api.post(`/admin/organizations/${selectedOrgId}/invoices/${invoiceId}/mark-paid`);
    await Promise.all([loadOrgs(), loadInvoices(selectedOrgId)]);
  }

  async function suspend(e) {
    e.preventDefault();
    await api.post(`/admin/organizations/${selectedOrgId}/suspend`, {
      reason: suspendReason.trim() || undefined,
    });
    setSuspendReason("");
    setShowSuspendModal(false);
    await loadOrgs();
  }

  async function reactivate() {
    await api.post(`/admin/organizations/${selectedOrgId}/reactivate`);
    await loadOrgs();
  }

  return (
    <Shell>
      <aside className="listpanel">
        <div className="listpanel-header">
          <h2>
            <Building2 size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Organizations
            <span className="conv-channel"> ({orgs.length})</span>
          </h2>
        </div>
        <button
          type="button"
          className={`org-all-activity ${view === "global" ? "active" : ""}`}
          onClick={() => setView(view === "global" ? "org" : "global")}
        >
          <ScrollText size={14} strokeWidth={2} /> All activity (audit log)
        </button>
        <div className="org-search">
          <Search size={14} strokeWidth={2} />
          <input
            placeholder="Search organizations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search organizations"
          />
        </div>
        {orgs.length > 0 && (
          <div className="org-counts">
            {Object.entries(counts).map(([label, n]) => (
              <span key={label}>
                {n} {label.toLowerCase()}
              </span>
            ))}
          </div>
        )}
        <ul className="team-list">
          {visibleOrgs.map((org) => {
            const status = orgStatus(org);
            return (
              <li key={org.id}>
                <button
                  type="button"
                  className={`team-row ${view === "org" && selectedOrgId === org.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedOrgId(org.id);
                    setView("org");
                  }}
                >
                  <span>
                    <strong>{org.name}</strong>
                    <span className="conv-channel"> /{org.slug}</span>
                  </span>
                  <span className={status.className}>{status.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {orgs.length === 0 && <div className="empty-state">No organizations yet.</div>}
        {orgs.length > 0 && visibleOrgs.length === 0 && <div className="empty-state">No matches.</div>}
      </aside>

      <main className="detailpanel">
        {view === "global" ? (
          <>
            <div className="conv-header">
              <strong>
                <ScrollText size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Audit log -- all organizations
              </strong>
              <span className="conv-channel">Newest first</span>
            </div>
            <div className="admin-body">
              <form
                className="audit-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadAudit(false);
                }}
              >
                <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)} aria-label="Filter by action">
                  <option value="">All actions</option>
                  {Object.entries(ACTION_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Search who / target / details"
                  value={auditQuery}
                  onChange={(e) => setAuditQuery(e.target.value)}
                />
                <button type="submit" className="small-btn">
                  Search
                </button>
              </form>
              <AuditTable rows={audit} showOrg />
              {auditMore && (
                <button type="button" className="small-btn" style={{ marginTop: 12 }} onClick={() => loadAudit(true)}>
                  Load more
                </button>
              )}
            </div>
          </>
        ) : !selectedOrg ? (
          <div className="empty-state">Pick an organization on the left.</div>
        ) : (
          <>
            <div className="conv-header">
              <strong>{selectedOrg.name}</strong>
              <span className="conv-channel">
                /{selectedOrg.slug} &middot;{" "}
                {selectedOrg.plan === "team" ? "Team plan" : selectedOrg.billing_status === "free" ? "Complimentary access" : "Free trial"} &middot; {selectedOrg.member_count} member
                {selectedOrg.member_count === 1 ? "" : "s"}
              </span>
              {selectedOrg.suspended ? (
                <button type="button" className="small-btn call-btn admin-btn-good" onClick={reactivate}>
                  <CheckCircle2 size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  className="small-btn call-btn admin-btn-bad"
                  onClick={() => setShowSuspendModal(true)}
                >
                  <Ban size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Suspend
                </button>
              )}
            </div>

            <div className="admin-body">
              {selectedOrg.suspended && (
                <div className="admin-suspended-banner">
                  Services are stopped for this workspace.
                  {selectedOrg.suspended_reason ? ` Reason: ${selectedOrg.suspended_reason}` : ""}
                </div>
              )}

              <div className="recap-stats admin-stats">
                <div className="recap-stat">
                  <strong>{orgStatus(selectedOrg).label}</strong>
                  <span>
                    {selectedOrg.billing_status === "trial"
                      ? `Trial ends ${formatDate(selectedOrg.trial_ends_at)}`
                      : selectedOrg.current_period_end
                        ? `Paid until ${formatDate(selectedOrg.current_period_end)}`
                        : "Status"}
                  </span>
                </div>
                <div className="recap-stat">
                  <strong>{selectedOrg.member_count}</strong>
                  <span>Members</span>
                </div>
                <div className="recap-stat">
                  <strong>{formatDate(selectedOrg.created_at)}</strong>
                  <span>Created</span>
                </div>
                <div className="recap-stat">
                  <strong>{formatCents(selectedOrg.total_pending_cents)}</strong>
                  <span>Pending dues</span>
                </div>
                <div className="recap-stat">
                  <strong className={selectedOrg.overdue_invoice_count > 0 ? "admin-stat-bad" : ""}>
                    {formatCents(selectedOrg.total_overdue_cents)}
                  </strong>
                  <span>Overdue ({selectedOrg.overdue_invoice_count})</span>
                </div>
                <div className="recap-stat">
                  <strong>{formatDate(selectedOrg.next_due_date)}</strong>
                  <span>Next due date</span>
                </div>
              </div>

              <div className="conv-tabs">
                <button type="button" className={`tab-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
                  <LayoutDashboard size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Overview
                </button>
                <button type="button" className={`tab-btn ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>
                  <Users size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Members ({members.length})
                </button>
                <button type="button" className={`tab-btn ${tab === "billing" ? "active" : ""}`} onClick={() => setTab("billing")}>
                  Billing &amp; invoices
                </button>
                <button type="button" className={`tab-btn ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
                  <ScrollText size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Audit log
                </button>
              </div>

              {tab === "overview" && (
                <div className="org-overview">
                  {!overview ? (
                    <div className="empty-state">Loading details...</div>
                  ) : (
                    <>
                      {selectedOrg.suspended && (
                        <div className="admin-suspended-banner">
                          Suspended {formatDateTime(overview.suspended_at)} ({overview.suspended_auto ? "automatically by billing" : "manually by a platform admin"}).
                          {overview.suspended_reason ? ` Reason: ${overview.suspended_reason}` : ""}
                        </div>
                      )}
                      <h4>Owner &amp; contact</h4>
                      <div className="org-facts">
                        <Fact label="Owner" value={overview.owner_name || "--"} sub={overview.owner_email} />
                        <Fact label="Org admins" value={overview.admin_count} />
                        <Fact label="Slug (login)" value={selectedOrg.slug} />
                        <Fact label="Created" value={formatDate(selectedOrg.created_at)} />
                      </div>
                      <h4>Subscription</h4>
                      <div className="org-facts">
                        <Fact label="Status" value={orgStatus(selectedOrg).label} />
                        <Fact
                          label={selectedOrg.billing_status === "trial" ? "Trial ends" : "Paid until"}
                          value={formatDate(selectedOrg.billing_status === "trial" ? selectedOrg.trial_ends_at : selectedOrg.current_period_end)}
                        />
                        <Fact label="Billable seats" value={overview.seat_count} />
                        <Fact label="Current value / period" value={money(overview.monthly_value_cents, overview.currency)} />
                        <Fact label="Total paid to date" value={money(overview.total_paid_cents, overview.currency)} />
                      </div>
                      <h4>Usage</h4>
                      <div className="org-facts">
                        <Fact label="Teams" value={overview.team_count} />
                        <Fact label="Channels" value={overview.channel_count} />
                        <Fact label="Messages" value={overview.message_count.toLocaleString()} />
                        <Fact label="Files" value={overview.file_count} sub={formatBytes(overview.storage_bytes)} />
                      </div>
                      <h4>Activity</h4>
                      <div className="org-facts">
                        <Fact label="Last message" value={formatDateTime(overview.last_message_at)} />
                        <Fact label="Last login" value={overview.last_login_at ? formatDateTime(overview.last_login_at) : "Not recorded yet"} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "audit" && (
                <>
                  <form
                    className="audit-filters"
                    onSubmit={(e) => {
                      e.preventDefault();
                      loadAudit(false);
                    }}
                  >
                    <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)} aria-label="Filter by action">
                      <option value="">All actions</option>
                      {Object.entries(ACTION_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input placeholder="Search who / target / details" value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />
                    <button type="submit" className="small-btn">
                      Search
                    </button>
                  </form>
                  <AuditTable rows={audit} showOrg={false} />
                  {auditMore && (
                    <button type="button" className="small-btn" style={{ marginTop: 12 }} onClick={() => loadAudit(true)}>
                      Load more
                    </button>
                  )}
                </>
              )}

              {tab === "members" && (
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td className="file-col-quiet">{m.email}</td>
                        <td>
                          <span className={`status-badge ${roleBadgeClass(m.org_role)}`}>
                            {ROLE_LABELS[m.org_role] || m.org_role}
                          </span>
                        </td>
                        <td className="file-col-quiet">{formatDate(m.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "billing" && (
              <>
              <div className="files-toolbar">
                <button type="button" className="small-btn" onClick={() => setShowInvoiceModal(true)}>
                  + New invoice
                </button>
              </div>

              {invoices.length === 0 ? (
                <div className="empty-state">No invoices for this organization yet.</div>
              ) : (
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.description}</td>
                        <td>{formatCents(inv.amount_cents)}</td>
                        <td className="file-col-quiet">{formatDate(inv.due_date)}</td>
                        <td>
                          {inv.status === "paid" ? (
                            <span className="status-badge status-good">Paid</span>
                          ) : inv.is_overdue ? (
                            <span className="status-badge status-bad">Overdue</span>
                          ) : (
                            <span className="status-badge status-warn">Pending</span>
                          )}
                        </td>
                        <td>
                          {inv.status === "pending" && (
                            <button type="button" className="small-btn" onClick={() => markPaid(inv.id)}>
                              Mark paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              </>
              )}
            </div>

            {showInvoiceModal && (
              <div className="modal-overlay" onClick={() => setShowInvoiceModal(false)}>
                <div
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="New invoice"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <h3>New invoice for {selectedOrg.name}</h3>
                    <button type="button" className="link-btn" onClick={() => setShowInvoiceModal(false)}>
                      Cancel
                    </button>
                  </div>
                  <form className="event-form" onSubmit={createInvoice}>
                    <input
                      placeholder="Description (e.g. November plan)"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      autoFocus
                    />
                    <div className="event-form-row">
                      <label>
                        Amount (USD)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="99.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        Due date
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </label>
                      <button type="submit">Create</button>
                    </div>
                    {error && <div className="form-error">{error}</div>}
                  </form>
                </div>
              </div>
            )}

            {showSuspendModal && (
              <div className="modal-overlay" onClick={() => setShowSuspendModal(false)}>
                <div
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Suspend organization"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <h3>Suspend {selectedOrg.name}?</h3>
                    <button type="button" className="link-btn" onClick={() => setShowSuspendModal(false)}>
                      Cancel
                    </button>
                  </div>
                  <form className="event-form" onSubmit={suspend}>
                    <p className="admin-suspend-warning">
                      Every member of this organization will immediately lose access to chat, files, calendar,
                      and calls -- they'll see a suspended-workspace notice until you reactivate it.
                    </p>
                    <input
                      placeholder="Reason (shown to the org, optional)"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                    />
                    <div className="event-form-row">
                      <button type="submit" className="admin-btn-bad">
                        Suspend workspace
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
