import { Link } from "react-router-dom";

// Shared closing call-to-action band used on the landing page and every
// public marketing page, so the "get started" moment looks identical
// everywhere a visitor ends up.
export default function CtaBand({
  heading = "Ready to bring your team into one place?",
  subtext = "Set up an organization in under a minute -- no credit card, no install.",
}) {
  return (
    <section className="landing-cta-band">
      <h2>{heading}</h2>
      <p>{subtext}</p>
      <Link className="primary-btn landing-cta-primary" to="/signup">
        Get started for free
      </Link>
    </section>
  );
}
