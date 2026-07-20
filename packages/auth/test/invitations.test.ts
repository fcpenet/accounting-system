import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Database, eq, invitations, organizations, users } from "@acct/db";
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
  listPendingInvitations,
  revokeInvitation,
} from "../src/invitations";

/** Real libSQL, exercising the constraints and the owner-only checks. */

let db: Database;
let dir: string;

const ORG = "org-a";
const OTHER_ORG = "org-b";
const OWNER = "user-owner";
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
      role TEXT NOT NULL DEFAULT 'owner',
      is_platform_admin INTEGER NOT NULL DEFAULT 0,
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
  await db.insert(users).values([
    { id: OWNER, orgId: ORG, email: "owner@a.test", role: "owner" },
    { id: EDITOR, orgId: ORG, email: "editor@a.test", role: "editor" },
  ]);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(async () => {
  await db.delete(invitations);
});

const invite = (email: string, role: "editor" | "viewer" = "editor") =>
  createInvitation(ORG, OWNER, email, role, db);

describe("createInvitation", () => {
  it("lets an owner invite an editor and returns a one-time token", async () => {
    const { token, invitation } = await invite("new@a.test", "editor");
    expect(token).toHaveLength(43); // 32 random bytes, base64url
    expect(invitation.role).toBe("editor");
    expect(invitation.email).toBe("new@a.test");

    // Only the hash is stored, never the raw token.
    const [row] = await db.select().from(invitations);
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toHaveLength(64); // sha-256 hex
  });

  it("refuses a non-owner", async () => {
    await expect(
      createInvitation(ORG, EDITOR, "x@a.test", "viewer", db),
    ).rejects.toThrow(/only an owner/i);
  });

  it("refuses to grant the owner role", async () => {
    // "owner" is a valid Role at the type level; it's rejected at runtime
    // because ownership isn't something an invitation hands out.
    await expect(
      createInvitation(ORG, OWNER, "x@a.test", "owner" as "editor", db),
    ).rejects.toThrow(/editor or viewer/i);
  });

  it("refuses to invite someone who already has an account", async () => {
    await expect(invite("editor@a.test")).rejects.toThrow(/already a member/i);
  });

  it("supersedes an earlier pending invite for the same email", async () => {
    const first = await invite("repeat@a.test");
    const second = await invite("repeat@a.test");

    // The old link is dead; only the new one resolves.
    expect(await getInvitationByToken(first.token, db)).toBeNull();
    expect(await getInvitationByToken(second.token, db)).not.toBeNull();
    expect(await db.select().from(invitations)).toHaveLength(1);
  });
});

describe("getInvitationByToken", () => {
  it("resolves a live token to its org and role", async () => {
    const { token } = await invite("who@a.test", "viewer");
    const view = await getInvitationByToken(token, db);
    expect(view?.orgName).toBe("Org A");
    expect(view?.role).toBe("viewer");
  });

  it("returns null for garbage or an empty token", async () => {
    expect(await getInvitationByToken("nonsense", db)).toBeNull();
    expect(await getInvitationByToken(undefined, db)).toBeNull();
  });

  it("returns null once expired, and cleans the row up", async () => {
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
  it("creates the invited user in the inviting org with the invited role", async () => {
    const { token } = await invite("joiner@a.test", "editor");
    const { userId, orgId } = await acceptInvitation(
      token,
      { password: "correct horse battery staple", name: "Jo" },
      db,
    );

    expect(orgId).toBe(ORG);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.email).toBe("joiner@a.test");
    expect(user?.role).toBe("editor");
    expect(user?.orgId).toBe(ORG);
    expect(user?.isPlatformAdmin).toBe(false);
  });

  it("marks the invite used, so the link can't be redeemed twice", async () => {
    const { token } = await invite("once@a.test");
    await acceptInvitation(token, { password: "correct horse battery staple" }, db);

    await expect(
      acceptInvitation(token, { password: "correct horse battery staple" }, db),
    ).rejects.toThrow(/no longer valid|already been used/i);
  });

  it("rejects a weak password without creating a user", async () => {
    const { token } = await invite("weak@a.test");
    await expect(acceptInvitation(token, { password: "short" }, db)).rejects.toThrow();
    const found = await db.select().from(users).where(eq(users.email, "weak@a.test"));
    expect(found).toHaveLength(0);
  });
});

describe("listPendingInvitations / revokeInvitation", () => {
  it("lists only live, unaccepted invites", async () => {
    await invite("p1@a.test");
    await invite("p2@a.test", "viewer");
    const pending = await listPendingInvitations(ORG, db);
    expect(pending.map((p) => p.email).sort()).toEqual(["p1@a.test", "p2@a.test"]);
  });

  it("revokes a pending invite, scoped to the org", async () => {
    const { invitation } = await invite("revoke-me@a.test");

    // Another org can't revoke it.
    expect(await revokeInvitation(OTHER_ORG, invitation.id, db)).toBe(false);
    expect(await revokeInvitation(ORG, invitation.id, db)).toBe(true);
    expect(await listPendingInvitations(ORG, db)).toHaveLength(0);
  });
});
