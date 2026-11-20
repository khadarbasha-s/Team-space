import { Link, Navigate, useParams } from "react-router-dom";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";
import { SERVICES, getServiceBySlug } from "../data/services";

export default function ServiceDetail() {
  const { slug } = useParams();
  const service = getServiceBySlug(slug);

  if (!service) return <Navigate to="/" replace />;

  const Icon = service.icon;
  const { detail } = service;
  const otherServices = SERVICES.filter((s) => s.slug !== service.slug);

  return (
    <div className="landing">
      <SiteNav />

      <section className="service-detail-hero">
        <HeroDecor />
        <div className="service-detail-hero-inner">
          <div className="service-detail-icon">
            <Icon size={28} strokeWidth={1.8} />
          </div>
          <span className="landing-eyebrow">{detail.eyebrow}</span>
          <h1>{detail.heading}</h1>
          <p className="landing-subtitle">{detail.intro}</p>
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

      <section className="landing-services">
        <div className="landing-section-head">
          <h2>What {service.title} gives you</h2>
          <p>Live and working end to end -- not a mockup.</p>
        </div>
        <div className="services-grid services-grid-3">
          {detail.features.map((feature) => (
            <div className="service-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="more-services">
        <div className="landing-section-head">
          <h2>Explore the rest of TeamSpace</h2>
          <p>Every service works together inside the same organization.</p>
        </div>
        <div className="more-services-grid">
          {otherServices.map((other) => {
            const OtherIcon = other.icon;
            return (
              <Link
                key={other.slug}
                to={`/services/${other.slug}`}
                className="more-services-item"
              >
                <span className="more-services-icon">
                  <OtherIcon size={18} strokeWidth={1.8} />
                </span>
                {other.title}
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
