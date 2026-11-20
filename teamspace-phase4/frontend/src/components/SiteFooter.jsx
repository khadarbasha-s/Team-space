import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import Brand from "./Brand";
import { SERVICES } from "../data/services";

// A handful of the services, not the full list -- enough to be useful
// without turning the footer into a second nav dropdown.
const FOOTER_SERVICE_SLUGS = ["team-chat", "video-calls", "file-sharing", "calendar"];
const FOOTER_SERVICES = SERVICES.filter((s) => FOOTER_SERVICE_SLUGS.includes(s.slug));

// lucide-react dropped brand/logo glyphs a while back, so these social marks
// are small inline SVGs instead of icon-library imports. Placeholder hrefs --
// swap in real profile URLs once they exist.
function GithubMark(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.57.1.78-.25.78-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.07.78 2.15 0 1.56-.01 2.81-.01 3.19 0 .31.21.67.79.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function XMark(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M18.24 2.5h3.3l-7.2 8.23 8.47 10.77h-6.63l-5.19-6.6-5.94 6.6H1.75l7.7-8.56L1.3 2.5h6.8l4.7 6.03 5.44-6.03Zm-1.16 17.02h1.83L7.02 4.38H5.06l12.02 15.14Z" />
    </svg>
  );
}

function LinkedinMark(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.6v1.64h.05c.5-.95 1.75-1.96 3.6-1.96 3.86 0 4.57 2.54 4.57 5.84V21h-4v-5.5c0-1.31-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9Z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "GitHub", icon: GithubMark, href: "#" },
  { label: "Twitter / X", icon: XMark, href: "#" },
  { label: "LinkedIn", icon: LinkedinMark, href: "#" },
];

// Shared footer used on the landing page and every public marketing page.
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="landing-footer-top">
        <div className="landing-footer-brand">
          <Brand />
          <p className="landing-footer-note">
            Built as a working, standalone Slack/Teams-style app -- chat, video, files,
            calendar, and recap, all tested end to end.
          </p>
          <a className="landing-footer-contact" href="mailto:support@teamspace.app">
            <Mail size={15} strokeWidth={2} />
            support@teamspace.app
          </a>
        </div>

        <nav className="landing-footer-col" aria-label="Product">
          <span className="landing-footer-col-title">Product</span>
          <Link to="/pricing">Pricing</Link>
          <Link to="/solutions">Solutions</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/resources">Resources</Link>
        </nav>

        <nav className="landing-footer-col" aria-label="Services">
          <span className="landing-footer-col-title">Services</span>
          {FOOTER_SERVICES.map((service) => (
            <Link key={service.slug} to={`/services/${service.slug}`}>
              {service.title}
            </Link>
          ))}
        </nav>

        <nav className="landing-footer-col" aria-label="Company">
          <span className="landing-footer-col-title">Company</span>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </div>

      <div className="landing-footer-bottom">
        <span>© {year} TeamSpace. All rights reserved.</span>
        <div className="landing-footer-social">
          {SOCIAL_LINKS.map((social) => {
            const Icon = social.icon;
            return (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="landing-footer-social-link"
              >
                <Icon />
              </a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
