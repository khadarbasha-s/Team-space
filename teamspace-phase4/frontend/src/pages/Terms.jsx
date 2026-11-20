import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";

const SECTIONS = [
  {
    heading: "Using TeamSpace",
    body:
      "By creating an organization or joining one with an invite, you agree to use TeamSpace the way it's meant to be used -- as a workspace for your team's chat, video calls, files, and calendar, not as a place to store or share anything illegal, abusive, or that you don't have the rights to.",
  },
  {
    heading: "Your organization and its data",
    body:
      "Your organization is a private tenant inside TeamSpace. You and your teammates are responsible for who you invite in and what gets shared inside it, the same as you would be with any workspace tool.",
  },
  {
    heading: "Accounts",
    body:
      "You're responsible for keeping your account credentials to yourself. If you create an organization, you can add teammates by sharing an invite link -- anyone who joins with it becomes a member of your organization.",
  },
  {
    heading: "Availability",
    body:
      "TeamSpace is a working build, not a service with a formal uptime guarantee. Features are tested end to end, but as with any software, things can occasionally break -- if something looks wrong, let us know on the support page.",
  },
  {
    heading: "Changes to these terms",
    body:
      "If these terms change in a way that matters, we'll make a reasonable effort to let existing organizations know. Continuing to use TeamSpace after a change means you accept the updated terms.",
  },
  {
    heading: "Questions",
    body:
      "Anything here unclear, or want to talk through a specific use case before signing up? Reach out on the support page and we'll help you figure it out.",
  },
];

export default function Terms() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="legal" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Terms</span>
          <h1>Terms of Service</h1>
          <p className="landing-subtitle">
            The ground rules for using TeamSpace -- short, plain, and written to match what the
            app actually does today.
          </p>
        </div>
      </section>

      <section className="legal-section">
        {SECTIONS.map((s) => (
          <div className="legal-block" key={s.heading}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
