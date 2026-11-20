import {
  MessageCircle,
  Video,
  FolderOpen,
  CalendarDays,
  Code2,
  TrendingUp,
  Palette,
  Globe,
  CheckCircle2,
  Sparkles,
  BookOpen,
  LifeBuoy,
  Mail,
  Map,
  ShieldCheck,
} from "lucide-react";

// Purely decorative abstract visual dropped behind every marketing-page hero:
// a layered, slowly-drifting gradient field plus four floating icon "chips"
// relevant to that page. Both the orbs and the chips carry their own CSS
// keyframe animation, so every hero on the site has a visibly moving
// background -- not just a static gradient -- without disturbing the
// centered text layout underneath it.
const CHIP_SETS = {
  landing: [MessageCircle, Video, FolderOpen, CalendarDays],
  solutions: [Code2, TrendingUp, Palette, Globe],
  pricing: [CheckCircle2, Sparkles, CalendarDays, MessageCircle],
  resources: [BookOpen, Map, LifeBuoy, FolderOpen],
  support: [LifeBuoy, Mail, MessageCircle, CheckCircle2],
  legal: [ShieldCheck, BookOpen, CheckCircle2, LifeBuoy],
  default: [MessageCircle, Video, FolderOpen, CalendarDays],
};

export default function HeroDecor({ variant = "default" }) {
  const chips = CHIP_SETS[variant] || CHIP_SETS.default;

  return (
    <div className={`hero-decor hero-decor-${variant}`} aria-hidden="true">
      <span className="hero-orb hero-orb-1" />
      <span className="hero-orb hero-orb-2" />
      <span className="hero-orb hero-orb-3" />
      {chips.map((Icon, i) => (
        <span className={`hero-chip hero-chip-${i + 1}`} key={i}>
          <Icon size={18} strokeWidth={2} />
        </span>
      ))}
    </div>
  );
}
