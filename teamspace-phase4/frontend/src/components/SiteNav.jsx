import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { SERVICES } from "../data/services";
import Brand from "./Brand";

// Splits a label into one <span> per character so the hover effect (see
// .wave-text in index.css) can ripple through the letters like a wave
// instead of just shifting the whole link upward.
function WaveText({ text }) {
  return (
    <span className="wave-text">
      {text.split("").map((char, i) => (
        <span key={i} style={{ "--i": i }}>
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </span>
  );
}

// Shared header used on the landing page and every public marketing page
// (service detail pages, how-it-works). "Services" opens a dropdown linking
// straight to each service's own page instead of jumping to a section.
export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <header className="landing-nav">
      <div className="landing-nav-inner">
        <Brand onClick={() => setOpen(false)} />
        <nav className="landing-nav-links">
          <div className="nav-dropdown" ref={wrapRef}>
            <button
              type="button"
              className="nav-dropdown-trigger"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <WaveText text="Services" />
              <ChevronDown size={14} strokeWidth={2.2} />
            </button>
            {open && (
              <div className="nav-dropdown-panel" role="menu">
                {SERVICES.map((service) => {
                  const Icon = service.icon;
                  return (
                    <Link
                      key={service.slug}
                      to={`/services/${service.slug}`}
                      className="nav-dropdown-item"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                    >
                      <span className="nav-dropdown-icon">
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span className="nav-dropdown-item-text">
                        <span className="nav-dropdown-item-title">{service.title}</span>
                        <span className="nav-dropdown-item-tag">{service.tag}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          <Link to="/solutions">
            <WaveText text="Solutions" />
          </Link>
          <Link to="/pricing">
            <WaveText text="Pricing" />
          </Link>
          <Link to="/resources">
            <WaveText text="Resources" />
          </Link>
          <Link to="/support">
            <WaveText text="Support" />
          </Link>
          <Link to="/how-it-works">
            <WaveText text="How it works" />
          </Link>
          <Link className="link-btn" to="/login">
            <WaveText text="Log in" />
          </Link>
          <Link className="primary-btn landing-nav-cta" to="/signup">
            <WaveText text="Get started" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
