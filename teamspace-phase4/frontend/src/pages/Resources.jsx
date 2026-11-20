import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, LifeBuoy, Map, ReceiptText } from "lucide-react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";
import { SERVICES } from "../data/services";

const QUICK_LINKS = [
  {
    icon: Map,
    title: "How a workspace is organized",
    description: "The organization -> teams -> channels structure, explained end to end.",
    to: "/how-it-works",
  },
  {
    icon: ReceiptText,
    title: "Pricing",
    description: "What's included, and what it costs (nothing).",
    to: "/pricing",
  },
  {
    icon: LifeBuoy,
    title: "Support & FAQ",
    description: "Common questions about organizations, data, and accounts.",
    to: "/support",
  },
];

export default function Resources() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="resources" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Resources</span>
          <h1>Everything you need to get the most out of TeamSpace.</h1>
          <p className="landing-subtitle">
            Guides for every service, plus the answers to the questions new teams ask first.
          </p>
        </div>
      </section>

      <section className="landing-services">
        <div className="landing-section-head">
          <h2>Start here</h2>
          <p>Three short reads before you invite your team.</p>
        </div>
        <div className="more-services-grid resources-quick-grid">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.title} to={link.to} className="resources-quick-card">
                <span className="more-services-icon">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="resources-quick-card-text">
                  <strong>{link.title}</strong>
                  <span>{link.description}</span>
                </span>
                <ArrowRight size={15} strokeWidth={2.2} />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="landing-services">
        <div className="landing-section-head">
          <h2>
            <BookOpen size={20} strokeWidth={1.8} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Guides for every service
          </h2>
          <p>Each one covers what it does, and how teams actually use it.</p>
        </div>
        <div className="services-grid">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <Link to={`/services/${service.slug}`} className="service-card service-card-link" key={service.slug}>
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
