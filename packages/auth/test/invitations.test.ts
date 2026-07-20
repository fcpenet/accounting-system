import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Database, eq, invitations, organizations, users } from "@acct/db";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  getInvitationByToken,
  listPendingInvitations,
  removeMember,
  revokeInvitation,
} from "../src/invitations";

/** Real libSQL, exercising the constraints and the admin-only checks. */

let db: Database;
let dir: string;

const ORG = "org-a";
const OTHER_ORG = "org-b";
const ADMIN = "user-admin";
const EDITOR = "user-editor";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "invite-test-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = drizzle(client, { casing: "snake_case" }) as unknown as Database;

  await client.executeMultiple(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL, password_hash TEXT, name TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      is_superuser INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX users_email_unique ON users (email);
    CREATE TABLE invitations (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL, role TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX invitations_token_unique ON invitations (token_hash);
  `);

  await db.insert(organizations).values([
    { id: ORG, name: "Org A" },
    { id: OTHER_ORG, name: "Org B" },
  ]);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Reset members + invites before each test to a known baseline: one admin,
// one editor in Org A.
beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(users);
  await db.insert(users).values([
    { id: ADMIN, orgId: ORG, email: "admin@a.test", role: "admin" },
    { id: EDITOR, orgId: ORG, email: "editor@a.test", role: "editor" },
  ]);
});

const invite = (email: string, role: "admin" | "editor" | "viewer" = "editor") =>
  createInvitation(ORG, ADMIN, email, role, db);

describe("createInvitation", () => {
  it("lets an admin invite, and stores only the token hash", async () => {
    const { token, invitation } = await invite("new@a.test", "editor");
    expect(token).toHaveLength(43);
    expect(invitation.role).toBe("editor");

    const [row] = await db.select().from(invitations);
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toHaveLength(64);
  });

  it("lets an admin invite another admin", async () => {
    const { invitation } = await invite("new-admin@a.test", "admin");
    expect(invitation.role).toBe("admin");
  });

  it("refuses a non-admin (editor)", async () => {
    await expect(
      createInvitation(ORG, EDITOR, "x@a.test", "viewer", db),
    ).rejects.toThrow(/only an admin/i);
  });

  it("refuses to invite someone who already has an account", async () => {
    await expect(invite("editor@a.test")).rejects.toThrow(/already a member/i);
  });

  it("supersedes an earlier pending invite for the same email", async () => {
    const first = await invite("repeat@a.test");
    const second = await invite("repeat@a.test");
    expect(await getInvitationByToken(first.token, db)).toBeNull();
    expect(await getInvitationByToken(second.token, db)).not.toBeNull();
    expect(await db.select().from(invitations)).toHaveLength(1);
  });
});

describe("getInvitationByToken", () => {
  it("resolves a live token", async () => {
    const { token } = await invite("who@a.test", "viewer");
    const view = await getInvitationByToken(token, db);
    expect(view?.orgName).toBe("Org A");
    expect(view?.role).toBe("viewer");
  });

  it("returns null for garbage or expiry, cleaning up expired rows", async () => {
    expect(await getInvitationByToken("nonsense", db)).toBeNull();
    const { token } = await invite("expired@a.test");
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.email, "expired@a.test"));
    expect(await getInvitationByToken(token, db)).toBeNull();
    expect(await db.select().from(invitations)).toHaveLength(0);
  });
});

describe("acceptInvitation", () => {
  it("creates the invited user with the invited role, never a superuser", async () => {
    const { token } = await invite("joiner@a.test", "editor");
    const { userId, orgId } = await acceptInvitation(
      token,
      { password: "correct horse battery staple", name: "Jo" },
      db,
    );

    expect(orgId).toBe(ORG);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.role).toBe("editor");
    expect(user?.isSuperuser).toBe(false);
  });

  it("is single-use", async () => {
    const { token } = await invite("once@a.test");
    await acceptInvitation(token, { password: "correct horse battery staple" }, db);
    await expect(
      acceptInvitation(token, { password: "correct horse battery staple" }, db),
    ).rejects.toThrow(/no longer valid|already been used/i);
  });

  it("rejects a weak password without creating a user", async () => {
    const { token } = await invite("weak@a.test");
    await expect(acceptInvitation(token, { password: "short" }, db)).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.email, "weak@a.test"))).toHaveLength(0);
  });
});

describe("listPendingInvitations / revokeInvitation", () => {
  it("lists live invites and revokes org-scoped", async () => {
    const { invitation } = await invite("p1@a.test");
    await invite("p2@a.test", "viewer");
    expect(await listPendingInvitations(ORG, db)).toHaveLength(2);

    expect(await revokeInvitation(OTHER_ORG, invitation.id, db)).toBe(false);
    expect(await revokeInvitation(ORG, invitation.id, db)).toBe(true);
    expect(await listPendingInvitations(ORG, db)).toHaveLength(1);
  });
});

describe("changeMemberRole", () => {
  it("lets an admin change a member's role", async () => {
    await changeMemberRole(ORG, ADMIN, EDITOR, "viewer", db);
    const [row] = await db.select().from(users).where(eq(users.id, EDITOR));
    expect(row?.role).toBe("viewer");
  });

  it("refuses a non-admin actor", async () => {
    await expect(changeMemberRole(ORG, EDITOR, ADMIN, "viewer", db)).rejects.toThrow(
      /only an admin/i,
    );
  });

  it("won't demote the last admin", async () => {
    // ADMIN is the only admin in Org A.
    await expect(changeMemberRole(ORG, ADMIN, ADMIN, "editor", db)).rejects.toThrow(
      /last admin/i,
    );
  });

  it("allows demoting an admin once another admin exists", async () => {
    await db.insert(users).values({
      id: "admin2",
      orgId: ORG,
      email: "admin2@a.test",
      role: "admin",
    });
    await changeMemberRole(ORG, ADMIN, "admin2", "editor", db);
    const [row] = await db.select().from(users).where(eq(users.id, "admin2"));
    expect(row?.role).toBe("editor");
  });

  it("won't touch a member of another org", async () => {
    await db.insert(users).values({
      id: "outsider",
      orgId: OTHER_ORG,
      email: "out@b.test",
      role: "editor",
    });
    await expect(changeMemberRole(ORG, ADMIN, "outsider", "viewer", db)).rejects.toThrow(
      /doesn't exist/i,
    );
  });
});

describe("removeMember", () => {
  it("lets an admin remove a member", async () => {
    await removeMember(ORG, ADMIN, EDITOR, db);
    expect(await db.select().from(users).where(eq(users.id, EDITOR))).toHaveLength(0);
  });

  it("refuses a non-admin actor", async () => {
    await expect(removeMember(ORG, EDITOR, ADMIN, db)).rejects.toThrow(/only an admin/i);
  });

  it("won't let you remove yourself", async () => {
    await expect(removeMember(ORG, ADMIN, ADMIN, db)).rejects.toThrow(/yourself/i);
  });

  it("lets one admin remove another when more than one exists", async () => {
    await db.insert(users).values({
      id: "admin2",
      orgId: ORG,
      email: "admin2@a.test",
      role: "admin",
    });
    await removeMember(ORG, ADMIN, "admin2", db);
    expect(await db.select().from(users).where(eq(users.id, "admin2"))).toHaveLength(0);
    // The remaining last admin (ADMIN) can only be removed by themselves,
    // which the self-removal rule forbids — so the org always keeps an admin.
    await expect(removeMember(ORG, ADMIN, ADMIN, db)).rejects.toThrow(/yourself/i);
  });

  it("won't touch a member of another org", async () => {
    await db.insert(users).values({
      id: "outsider",
      orgId: OTHER_ORG,
      email: "out@b.test",
      role: "admin",
    });
    await expect(removeMember(ORG, ADMIN, "outsider", db)).rejects.toThrow(/doesn't exist/i);
  });
});
