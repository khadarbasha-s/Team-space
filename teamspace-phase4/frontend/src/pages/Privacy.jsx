import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import CtaBand from "../components/CtaBand";
import HeroDecor from "../components/HeroDecor";

const SECTIONS = [
  {
    heading: "What this page covers",
    body:
      "TeamSpace is a working demo of a Slack/Teams-style workspace -- real chat, video, files, calendar, and recap, all tested end to end. This policy describes how data moves through that app today, in plain terms, rather than as a legal document reviewed by counsel.",
  },
  {
    heading: "What we collect",
    body:
      "Account basics (name, email, and your organization's name or slug), the content you create inside your workspace (messages, files, calendar events), and the usage data needed to keep the service running (connection logs, error logs).",
  },
  {
    heading: "How your organization's data is isolated",
    body:
      "Every organization is its own tenant. Messages, files, teams, channels, and calendar events are all scoped to the organization that created them -- every request is checked against that organization, and data belonging to another org is never returned, not even as a count or an error that hints it exists.",
  },
  {
    heading: "How data is used",
    body:
      "Data you put into TeamSpace is used to run the features you're using it for -- showing message history, listing files in a channel, generating an AI recap of a channel's activity -- and nothing else. We don't sell data, and we don't use your workspace content to train models outside of the recap feature you explicitly open.",
  },
  {
    heading: "Retention and deletion",
    body:
      "Your data persists for as long as your organization exists in TeamSpace. If you'd like your organization's data removed, reach out on the support page and we'll help you with that.",
  },
  {
    heading: "Questions",
    body:
      "If anything here is unclear, or you want more detail on a specific feature's data handling, reach out on the support page and we'll help you figure it out.",
  },
];

export default function Privacy() {
  return (
    <div className="landing">
      <SiteNav />

      <section className="landing-hero">
        <HeroDecor variant="legal" />
        <div className="landing-hero-inner">
          <span className="landing-eyebrow">Privacy</span>
          <h1>Privacy Policy</h1>
          <p className="landing-subtitle">
            How TeamSpace handles your organization's data -- written in plain terms, kept up to
            date with what the app actually does.
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
