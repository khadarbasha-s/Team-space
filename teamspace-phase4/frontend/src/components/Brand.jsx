import { Link } from "react-router-dom";
import { Boxes } from "lucide-react";

// Shared logo lockup -- an icon badge plus the "TeamSpace" wordmark -- used
// everywhere the brand appears (top nav, auth aside, auth card) so it reads
// as a single logo instead of a plain text link.
export default function Brand({ className = "", onClick }) {
  return (
    <Link to="/" className={`brand ${className}`.trim()} onClick={onClick}>
      <span className="brand-mark">
        <Boxes size={16} strokeWidth={2.3} />
      </span>
      <span className="brand-name">TeamSpace</span>
    </Link>
  );
}
