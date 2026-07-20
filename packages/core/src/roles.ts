/**
 * Membership roles and what each may do.
 *
 * Two levels of privilege, kept separate:
 *
 *   - **superuser** — a global flag (users.is_superuser), not a role here. The
 *     only actor that can create organizations. Managed out-of-band.
 *   - **role** — a member's standing *within* one organization: admin, editor,
 *     or viewer. That's what this file defines.
 *
 * One place decides permissions so the UI (which buttons to show) and the
 * server (whether to allow a mutation) can never drift apart. The server is
 * always the authority — a hidden button is a convenience, `can()` on the
 * action is the guard.
 */

export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Manage members and roles, plus full bookkeeping",
  editor: "Post and reverse entries, manage accounts",
  viewer: "View books and reports only",
};

export type Permission =
  /** Read books and reports. */
  | "view"
  /** Post and reverse journal entries; create and archive accounts. */
  | "write"
  /** Invite members, change their roles, remove them. */
  | "manageMembers"
  /** Rename or delete the organization. */
  | "manageOrg";

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>(["view", "write", "manageMembers", "manageOrg"]),
  editor: new Set<Permission>(["view", "write"]),
  viewer: new Set<Permission>(["view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].has(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Roles an admin may assign — by invitation or by changing a member's role.
 * All three: an admin can create other admins, which is consistent with being
 * able to change any member's role anyway.
 */
export const ASSIGNABLE_ROLES: readonly Role[] = ["admin", "editor", "viewer"];
