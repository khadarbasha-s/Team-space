import { Link } from "react-router-dom";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";
import { SERVICES } from "../data/services";

const LAYERS = [
  {
    label: "Organization",
    heading: "Your company's own tenant",
    body: "Everyone in it, and nothing else, is visible to its members. Create a brand-new organization with just a name, or join an existing one by typing its slug.",
  },
  {
    label: "Teams",
    heading: "Groups inside your org",
    body: "Engineering, Sales, Design -- create as many teams as you need, each with its own members and its own set of channels.",
  },
  {
    label: "Channels",
    heading: "Where the work happens",
    body: "Chat, calls, files, calendar, and recaps all live inside a channel -- scoped to the team it belongs to, and nothing wider.",
  },
];

export default function HowItWorks() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Structure</span>
          <h1>One workspace, organized the way your team already thinks.</h1>
          <p className="landing-subtitle">
            Every account in TeamSpace is built from three simple layers -- organization,
            teams, and channels -- each one access-controlled, so the right people
            always see exactly the right conversations and nothing else.
          </p>
        </div>
      </section>

      <section className="landing-structure">
        <div className="structure-flow">
          {LAYERS.map((layer, i) => (
            <div className="structure-step" key={layer.label}>
              <div className="structure-step-label">
                {i + 1}. {layer.label}
              </div>
              <p>
                <strong>{layer.heading}.</strong> {layer.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-services">
        <div className="landing-section-head">
          <h2>Everything sits inside a channel</h2>
          <p>Once you're inside a channel, every service is one click away.</p>
        </div>
        <div className="services-grid">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <Link
                to={`/services/${service.slug}`}
                className="service-card service-card-link"
                key={service.slug}
              >
                <div className="service-icon">
                  <Icon size={25} strokeWidth={1.8} />
                </div>
                <div className="service-card-head">
                  <h3>{service.title}</h3>
                  <span className="service-tag">{service.tag}</span>
                </div>
                <p>{service.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
