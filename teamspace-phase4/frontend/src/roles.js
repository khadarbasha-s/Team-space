// Organization roles, in seniority order. Only "org_admin" carries extra
// permissions (members, billing); manager and team_lead are visible roles
// that also appear in the chat "Leads" directory.
export const ROLE_OPTIONS = [
  { value: "org_admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "team_lead", label: "Team lead" },
  { value: "member", label: "Member" },
];

export const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

export function roleBadgeClass(role) {
  if (role === "org_admin") return "status-good";
  if (role === "manager" || role === "team_lead") return "status-info";
  return "status-warn";
}
