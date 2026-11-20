import { assetUrl } from "../api";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// A person's photo, or their initials when they haven't uploaded one.
export default function Avatar({ name, url, size = 28, className = "", children }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  return (
    <span className={`avatar-img ${className}`.trim()} style={style} title={name}>
      {url ? <img src={assetUrl(url)} alt={name} /> : initials(name)}
      {children}
    </span>
  );
}
