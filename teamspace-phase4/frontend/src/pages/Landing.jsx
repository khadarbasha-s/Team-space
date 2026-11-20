import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";
import { SERVICES } from "../data/services";

export default function Landing() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="landing" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Chat · Meet · Share · Plan</span>
          <h1>One workspace for everything your team does together.</h1>
          <p className="landing-subtitle">
            TeamSpace brings real-time chat, group video calls with screen share, file
            sharing, a shared calendar, and an AI-style channel recap into a single,
            multi-tenant workspace -- organized by organization, team, and channel.
          </p>
          <div className="landing-hero-actions">
            <Link className="primary-btn landing-cta-primary" to="/signup">
              Create your workspace
            </Link>
            <Link className="secondary-btn" to="/login">
              Log in to an existing one
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-services" id="services">
        <div className="landing-section-head">
          <h2>Everything included, in one app</h2>
          <p>Every service below is live and working end to end -- not a mockup.</p>
        </div>
        <div className="services-grid">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div className="service-card" key={service.slug}>
                <div className="service-icon">
                  <Icon size={25} strokeWidth={1.8} />
                </div>
                <div className="service-card-head">
                  <h3>{service.title}</h3>
                  <span className="service-tag">{service.tag}</span>
                </div>
                <p>{service.description}</p>
                <Link className="service-card-link-more" to={`/services/${service.slug}`}>
                  Learn more <ArrowRight size={13} strokeWidth={2.2} />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-structure" id="how-it-works">
        <div className="landing-section-head">
          <h2>How a workspace is organized</h2>
          <p>The same shape as the teams you already work in.</p>
        </div>
        <div className="structure-flow">
          <div className="structure-step">
            <div className="structure-step-label">Organization</div>
            <p>Your company's own tenant -- everyone in it, and nothing else, is visible to its members.</p>
          </div>
          <div className="structure-arrow">→</div>
          <div className="structure-step">
            <div className="structure-step-label">Teams</div>
            <p>Groups inside your org -- Engineering, Sales, Design -- each with its own members and channels.</p>
          </div>
          <div className="structure-arrow">→</div>
          <div className="structure-step">
            <div className="structure-step-label">Channels</div>
            <p>Where the work happens -- chat, calls, files, calendar, and recaps all live inside a channel.</p>
          </div>
        </div>
        <Link className="service-card-link-more landing-structure-more" to="/how-it-works">
          See the full breakdown <ArrowRight size={13} strokeWidth={2.2} />
        </Link>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
