import { useCallback, useEffect, useState } from "react";
import { CreditCard, CheckCircle2, Clock, AlertTriangle, Users } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../Shell";

function money(cents, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-";
}

function daysLeft(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

const STATUS_VIEW = {
  active: { label: "Active", tone: "good", icon: CheckCircle2 },
  trial: { label: "Free trial", tone: "warn", icon: Clock },
  free: { label: "Free access", tone: "good", icon: CheckCircle2 },
  past_due: { label: "Payment overdue", tone: "bad", icon: AlertTriangle },
  trial_expired: { label: "Trial ended", tone: "bad", icon: AlertTriangle },
  suspended: { label: "Suspended", tone: "bad", icon: AlertTriangle },
};

// Loads Razorpay's hosted checkout script once.
function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

export default function Billing() {
  const { refreshMe } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sandbox, setSandbox] = useState(null); // checkout payload while the test-payment dialog is open

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/summary");
      setData(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load billing details.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function paid() {
    setNotice("Payment received -- thank you! Your subscription is active.");
    setSandbox(null);
    await load();
    await refreshMe(); // lifts the Suspended screen straight away if the org was suspended
  }

  async function startCheckout() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data: c } = await api.post("/billing/checkout");
      if (c.provider === "sandbox") {
        setSandbox(c);
        return;
      }
      await loadRazorpay();
      const rz = new window.Razorpay({
        key: c.key_id,
        order_id: c.order_id,
        amount: c.amount_cents,
        currency: c.currency,
        name: "TeamSpace",
        description: c.description,
        prefill: { name: c.user_name, email: c.user_email },
        theme: { color: "#d97706" },
        handler: async (resp) => {
          try {
            await api.post("/billing/confirm", {
              invoice_id: c.invoice_id,
              payment_id: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            await paid();
          } catch (err) {
            setError(
              err?.response?.data?.detail ||
                "We could not confirm your payment yet. If you were charged, your subscription will activate automatically in a few minutes.",
            );
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on("payment.failed", (r) => setError(r?.error?.description || "The payment failed. You have not been charged."));
      rz.open();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function sandboxPay() {
    setBusy(true);
    try {
      await api.post("/billing/sandbox/pay", { invoice_id: sandbox.invoice_id });
      await paid();
    } catch (err) {
      setError(err?.response?.data?.detail || "Test payment failed.");
    } finally {
      setBusy(false);
    }
  }

  const view = data ? STATUS_VIEW[data.status] || STATUS_VIEW.active : null;
  const Icon = view?.icon;
  const needsPayment = data && ["trial", "trial_expired", "past_due", "suspended", "active"].includes(data.status);
  const ctaLabel = !data
    ? ""
    : data.status === "active"
      ? "Renew now"
      : data.status === "suspended" || data.status === "past_due" || data.status === "trial_expired"
        ? "Pay & reactivate"
        : "Subscribe now";

  return (
    <Shell>
      <main className="detailpanel">
        <div className="conv-header">
          <strong>
            <CreditCard size={16} strokeWidth={2} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Billing
          </strong>
          <span className="conv-channel">Team plan</span>
        </div>

        <div className="admin-body">
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="billing-notice">{notice}</div>}
          {!data && !error && <div className="loading-screen" style={{ height: 120 }}>Loading...</div>}

          {data && (
            <>
              <section className="account-section billing-plan">
                <div className="billing-plan-head">
                  <div>
                    <h3>Team plan</h3>
                    <span className={`billing-badge billing-${view.tone}`}>
                      <Icon size={13} strokeWidth={2.2} /> {view.label}
                    </span>
                  </div>
                  <div className="billing-price">
                    <span className="billing-price-amount">{money(data.price_per_seat_cents, data.currency)}</span>
                    <span className="billing-price-period">per member / {data.period_days} days</span>
                  </div>
                </div>

                <dl className="billing-facts">
                  <div>
                    <dt>
                      <Users size={13} /> Members
                    </dt>
                    <dd>{data.seats}</dd>
                  </div>
                  <div>
                    <dt>Next payment</dt>
                    <dd>{money(data.amount_due_cents, data.currency)}</dd>
                  </div>
                  {data.status === "trial" && (
                    <div>
                      <dt>Trial ends</dt>
                      <dd>
                        {fmtDate(data.trial_ends_at)} ({daysLeft(data.trial_ends_at)} days left)
                      </dd>
                    </div>
                  )}
                  {data.current_period_end && (
                    <div>
                      <dt>{data.status === "active" ? "Renews / paid until" : "Paid until"}</dt>
                      <dd>{fmtDate(data.current_period_end)}</dd>
                    </div>
                  )}
                </dl>

                {data.status === "suspended" && data.suspended_reason && (
                  <p className="billing-warn">
                    <strong>Workspace suspended:</strong> {data.suspended_reason} Pay below and access returns immediately.
                  </p>
                )}
                {data.status === "free" && (
                  <p className="billing-hint">Your organization currently has complimentary access. You can still subscribe at any time.</p>
                )}

                {needsPayment && (
                  <button className="primary-btn billing-cta" type="button" onClick={startCheckout} disabled={busy}>
                    {busy ? "Opening checkout..." : `${ctaLabel} - ${money(data.amount_due_cents, data.currency)}`}
                  </button>
                )}
                <p className="billing-hint">
                  Billed per active member, for {data.period_days} days at a time. Adding members raises your next payment.
                </p>
              </section>

              <section className="account-section">
                <h3>Invoices</h3>
                {data.invoices.length === 0 ? (
                  <p className="billing-hint">No invoices yet.</p>
                ) : (
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((i) => (
                        <tr key={i.id}>
                          <td>{fmtDate(i.paid_at || i.created_at)}</td>
                          <td>{i.description}</td>
                          <td>{money(i.amount_cents, data.currency)}</td>
                          <td>
                            <span className={`billing-badge billing-${i.status === "paid" ? "good" : i.is_overdue ? "bad" : "warn"}`}>
                              {i.status === "paid" ? "Paid" : i.is_overdue ? "Overdue" : "Unpaid"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </div>

        {sandbox && (
          <div className="modal-overlay" onClick={() => !busy && setSandbox(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Test payment" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Test payment</h3>
                <button type="button" className="link-btn" onClick={() => setSandbox(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
              <p className="billing-hint">
                Development mode: no real card is charged. In production this opens Razorpay's secure checkout.
              </p>
              <p>
                <strong>{money(sandbox.amount_cents, sandbox.currency)}</strong>
                <br />
                <span className="billing-hint">{sandbox.description}</span>
              </p>
              <button className="primary-btn" type="button" onClick={sandboxPay} disabled={busy}>
                {busy ? "Processing..." : "Pay (test mode)"}
              </button>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
