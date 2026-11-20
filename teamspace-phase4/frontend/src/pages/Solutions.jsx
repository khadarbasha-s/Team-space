import { Link } from "react-router-dom";
import { ArrowRight, Code2, TrendingUp, Palette, Megaphone, Briefcase, Globe } from "lucide-react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";

const SOLUTIONS = [
  {
    icon: Code2,
    title: "Engineering teams",
    tag: "Build",
    description:
      "Keep standups, incident channels, and screen-shared debugging sessions in one place instead of scattered across five tools.",
  },
  {
    icon: TrendingUp,
    title: "Sales teams",
    tag: "Close",
    description:
      "A channel per deal or account, video calls with prospects, and a shared calendar so handoffs never slip through the cracks.",
  },
  {
    icon: Palette,
    title: "Design teams",
    tag: "Create",
    description:
      "Share files and screens for live critique, and keep feedback threads sitting right next to the work, not buried in email.",
  },
  {
    icon: Megaphone,
    title: "Marketing teams",
    tag: "Launch",
    description:
      "Coordinate campaigns in dedicated channels, share assets instantly, and keep launch dates on a calendar everyone sees.",
  },
  {
    icon: Briefcase,
    title: "Leadership & ops",
    tag: "Align",
    description:
      "Cross-team visibility without sitting in every channel -- AI-style recaps surface what matters without a full read-through.",
  },
  {
    icon: Globe,
    title: "Remote & distributed teams",
    tag: "Connect",
    description:
      "Async-friendly chat and recaps keep every timezone in sync, with video calls ready for when real-time is worth it.",
  },
];

export default function Solutions() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="solutions" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Solutions</span>
          <h1>Built for the way your team actually works.</h1>
          <p className="landing-subtitle">
            The same chat, calls, files, and calendar underneath -- shaped around what each
            kind of team needs most.
          </p>
        </div>
      </section>

      <section className="landing-services">
        <div className="landing-section-head">
          <h2>Find your team below</h2>
          <p>Every solution runs on the same TeamSpace workspace -- no separate product to learn.</p>
        </div>
        <div className="services-grid">
          {SOLUTIONS.map((solution) => {
            const Icon = solution.icon;
            return (
              <div className="service-card" key={solution.title}>
                <div className="service-icon">
                  <Icon size={25} strokeWidth={1.8} />
                </div>
                <div className="service-card-head">
                  <h3>{solution.title}</h3>
                  <span className="service-tag">{solution.tag}</span>
                </div>
                <p>{solution.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-structure">
        <div className="landing-section-head">
          <h2>Not sure where you fit?</h2>
          <p>Every service is explained in detail on its own page.</p>
        </div>
        <Link className="service-card-link-more landing-structure-more" to="/how-it-works">
          See how a workspace is organized <ArrowRight size={13} strokeWidth={2.2} />
        </Link>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
