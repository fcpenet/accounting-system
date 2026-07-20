import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  type Permission,
  ROLES,
  type Role,
  can,
  isRole,
} from "../src/roles";

describe("can", () => {
  // The full permission matrix, asserted explicitly. If someone widens a
  // role's powers, exactly one of these flips and the diff is obvious.
  const matrix: Record<Role, Record<Permission, boolean>> = {
    admin: { view: true, write: true, manageMembers: true, manageOrg: true },
    editor: { view: true, write: true, manageMembers: false, manageOrg: false },
    viewer: { view: true, write: false, manageMembers: false, manageOrg: false },
  };

  for (const role of ROLES) {
    for (const permission of Object.keys(matrix[role]) as Permission[]) {
      it(`${role} ${matrix[role][permission] ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(matrix[role][permission]);
      });
    }
  }

  it("lets everyone view", () => {
    expect(ROLES.every((r) => can(r, "view"))).toBe(true);
  });

  it("lets only admins manage members", () => {
    expect(ROLES.filter((r) => can(r, "manageMembers"))).toEqual(["admin"]);
  });

  it("keeps viewers strictly read-only", () => {
    expect(can("viewer", "write")).toBe(false);
    expect(can("viewer", "manageMembers")).toBe(false);
    expect(can("viewer", "manageOrg")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts the three roles", () => {
    for (const r of ["admin", "editor", "viewer"]) expect(isRole(r)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["owner", "superuser", "", "ADMIN", null, undefined, 1, {}]) {
      expect(isRole(v)).toBe(false);
    }
  });
});

describe("ASSIGNABLE_ROLES", () => {
  it("is all three — an admin can assign any role, including admin", () => {
    expect([...ASSIGNABLE_ROLES].sort()).toEqual(["admin", "editor", "viewer"]);
  });
});
