import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";
import { SERVICES } from "../data/services";

// Placeholder price -- easy to change in one place once real numbers are
// decided. Everything else on this page (billing note, CTA) is written to
// stay true regardless of what this number ends up being.
const PRICE_PER_SEAT = 8;
const BILLING_PERIOD = "per user / month";

const EXTRA_FEATURES = [
  "Unlimited teams and channels",
  "Full, searchable message history",
  "Your organization's data kept fully separate from every other org",
];

export default function Pricing() {
  const featureList = [...SERVICES.map((s) => s.title), ...EXTRA_FEATURES];

  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="pricing" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Pricing</span>
          <h1>One plan. Simple, per-person pricing.</h1>
          <p className="landing-subtitle">
            No tiers to compare and no features held back -- every organization gets the full
            workspace, billed simply per person.
          </p>
        </div>
      </section>

      <section className="pricing-section">
        <div className="pricing-card">
          <div className="pricing-card-head">
            <span className="pricing-plan-name">Team</span>
            <div className="pricing-price">
              <span className="pricing-price-amount">${PRICE_PER_SEAT}</span>
              <span className="pricing-price-period">/ {BILLING_PERIOD}</span>
            </div>
            <p className="pricing-card-sub">
              For any team, of any size. Billed monthly -- cancel anytime.
            </p>
          </div>
          <ul className="pricing-features">
            {featureList.map((feature) => (
              <li key={feature}>
                <CheckCircle2 size={17} strokeWidth={2} />
                {feature}
              </li>
            ))}
          </ul>
          <Link className="primary-btn landing-cta-primary pricing-card-cta" to="/signup">
            Create your workspace
          </Link>
          <p className="pricing-card-note">
            Every new workspace starts with a 14-day free trial -- no credit card required.
            Subscribe from the Billing page any time; you are charged per active member.
          </p>
        </div>
      </section>

      <section className="landing-structure">
        <div className="landing-section-head">
          <h2>Need something more specific?</h2>
          <p>
            Have a question about volume pricing, annual billing, data residency, or rolling
            TeamSpace out to a larger team?{" "}
            <Link to="/support">Reach out on the support page</Link> and we'll help you figure
            it out.
          </p>
        </div>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
