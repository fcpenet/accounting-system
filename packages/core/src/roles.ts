/**
 * Membership roles and what each may do.
 *
 * One place decides permissions so the UI (which buttons to show) and the
 * server (whether to allow a mutation) can never drift apart. The server is
 * always the authority — a hidden button is a convenience, `can()` on the
 * action is the guard.
 */

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access, including inviting and removing members",
  editor: "Post and reverse entries, manage accounts",
  viewer: "View books and reports only",
};

export type Permission =
  /** Read books and reports. */
  | "view"
  /** Post and reverse journal entries; create and archive accounts. */
  | "write"
  /** Invite members, change roles, remove members. */
  | "manageMembers"
  /** Rename or delete the organization. */
  | "manageOrg";

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(["view", "write", "manageMembers", "manageOrg"]),
  editor: new Set<Permission>(["view", "write"]),
  viewer: new Set<Permission>(["view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].has(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Roles an owner may hand out via an invitation. Not "owner" — ownership
 *  transfer is a separate, deliberate action, not something an invite does. */
export const INVITABLE_ROLES: readonly Role[] = ["editor", "viewer"];
