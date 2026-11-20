// Calendar times are always shown and entered in India Standard Time
// (UTC+05:30, no DST), regardless of the browser's own timezone.
export const IST = "Asia/Kolkata";
const OFFSET_MS = 5.5 * 3600 * 1000;

// Minutes since midnight, in IST.
export const istMinutes = (d) => {
  const t = new Date(d.getTime() + OFFSET_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
export const istHHMM = (d) => {
  const m = istMinutes(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// "YYYY-MM-DD" of the IST calendar day.
export const istDate = (d) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
// "2026-11-13" + "12:30" (as IST) -> the matching instant.
export const fromIST = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00+05:30`);
export const fmtIST = (d, opts = { hour: "numeric", minute: "2-digit" }) =>
  d.toLocaleString("en-IN", { ...opts, timeZone: IST });
