import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Password field with a show/hide toggle. Takes the same props as a plain
// <input> (value, onChange, required, minLength, ...) and passes them through,
// so it can replace <input type="password" /> anywhere inside a <label>.
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="pw-field">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={17} strokeWidth={1.9} /> : <Eye size={17} strokeWidth={1.9} />}
      </button>
    </span>
  );
}
