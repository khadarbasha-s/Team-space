import { Mail } from "lucide-react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";

const FAQS = [
  {
    q: "How are organizations isolated from each other?",
    a: "Every organization is its own tenant. Members, teams, channels, messages, and files are all scoped to that organization -- nobody outside it can see in, and there's no cross-org visibility by default.",
  },
  {
    q: "Can I join an existing organization instead of creating a new one?",
    a: "Yes. On the sign-up page, choose \"Join an existing organization\" and enter its slug. You'll land inside that organization's workspace with the teams and channels you've been added to.",
  },
  {
    q: "What happens to my message history?",
    a: "It's kept in full and stays searchable. Reloading or switching devices doesn't lose anything -- channel history loads straight from the server every time you open it.",
  },
  {
    q: "Is there a paid plan?",
    a: "Not right now. Every organization gets the full set of services -- chat, video calls, screen sharing, file sharing, calendar, and recaps -- at no cost.",
  },
  {
    q: "How do I reset my password?",
    a: "Self-serve password reset isn't available yet. In the meantime, ask an admin in your organization for help, or reach out using the contact details below.",
  },
  {
    q: "Who can create teams and channels inside an organization?",
    a: "Any member of an organization can create a new team, and any member of a team can create channels inside it -- there's no separate admin approval step required.",
  },
];

export default function Support() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="support" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Support</span>
          <h1>Questions? We've got answers.</h1>
          <p className="landing-subtitle">
            The most common things people ask before and after setting up a workspace.
          </p>
        </div>
      </section>

      <section className="support-section">
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details className="faq-item" key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>

        <div className="support-contact-card">
          <h3>Still need a hand?</h3>
          <p>
            Can't find what you're looking for, or hit something that looks like a bug? Send us
            a note and we'll get back to you.
          </p>
          <a className="support-contact-link" href="mailto:support@teamspace.app">
            <Mail size={16} strokeWidth={2} />
            support@teamspace.app
          </a>
        </div>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
