import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Database, accounts, eq, organizations, users } from "@acct/db";
import { AuthError, authenticate, registerUser } from "../src/register";

/**
 * Against a real libSQL file, including the case-insensitive unique index on
 * organization name — the constraint is the point, so a mock would defeat it.
 */

let db: Database;
let dir: string;

const base = {
  email: "owner@acme.test",
  password: "correct horse battery staple",
  organizationName: "Acme Consulting",
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "register-test-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  db = drizzle(client, { casing: "snake_case" }) as unknown as Database;

  await client.executeMultiple(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX organizations_name_unique ON organizations (lower("name"));
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL, password_hash TEXT, name TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      is_platform_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX users_email_unique ON users (email);
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT, archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE UNIQUE INDEX accounts_org_code_unique ON accounts (org_id, code);
  `);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(async () => {
  await db.delete(accounts);
  await db.delete(users);
  await db.delete(organizations);
});

describe("registerUser", () => {
  it("creates the org, the user, and a starter chart in one go", async () => {
    const { orgId, userId } = await registerUser(base, db);

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org?.name).toBe("Acme Consulting");

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user?.email).toBe("owner@acme.test");
    expect(user?.orgId).toBe(orgId);

    const chart = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(chart.length).toBeGreaterThan(0);
    // The account added earlier in the default chart should be here.
    expect(chart.some((a) => a.code === "1020" && a.name === "Cash in Bank")).toBe(true);
  });

  it("lowercases the email but keeps the org name as typed", async () => {
    const { orgId } = await registerUser(
      { ...base, email: "Owner@ACME.test", organizationName: "  Acme Consulting  " },
      db,
    );
    const [user] = await db.select().from(users);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(user?.email).toBe("owner@acme.test");
    expect(org?.name).toBe("Acme Consulting");
  });

  it("rejects a duplicate organization name, case-insensitively", async () => {
    await registerUser(base, db);

    await expect(
      registerUser(
        { ...base, email: "someone-else@acme.test", organizationName: "acme consulting" },
        db,
      ),
    ).rejects.toThrow(/organization name is already taken/i);

    // The second attempt must leave nothing behind.
    expect(await db.select().from(organizations)).toHaveLength(1);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("rejects a duplicate email", async () => {
    await registerUser(base, db);
    await expect(
      registerUser({ ...base, organizationName: "A Different Org" }, db),
    ).rejects.toThrow(/email already exists/i);
  });

  it("rolls back everything when the org name collides", async () => {
    await registerUser(base, db);
    const before = (await db.select().from(accounts)).length;

    await registerUser(
      { ...base, email: "x@acme.test", organizationName: "ACME CONSULTING" },
      db,
    ).catch(() => {});

    // No orphaned chart of accounts from the failed second signup.
    expect((await db.select().from(accounts)).length).toBe(before);
  });

  it("requires an organization name", async () => {
    await expect(
      registerUser({ ...base, organizationName: "   " }, db),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a weak password before writing anything", async () => {
    await expect(
      registerUser({ ...base, password: "short" }, db),
    ).rejects.toThrow(AuthError);
    expect(await db.select().from(organizations)).toHaveLength(0);
  });
});

describe("authenticate", () => {
  beforeEach(async () => {
    await registerUser(base, db);
  });

  it("accepts the right credentials", async () => {
    const result = await authenticate(base.email, base.password, db);
    expect(result).not.toBeNull();
  });

  it("is case-insensitive on the email", async () => {
    const result = await authenticate("OWNER@acme.TEST", base.password, db);
    expect(result).not.toBeNull();
  });

  it("returns null for a wrong password", async () => {
    expect(await authenticate(base.email, "wrong password entirely", db)).toBeNull();
  });

  it("returns null for an unknown email, indistinguishably", async () => {
    expect(await authenticate("nobody@acme.test", base.password, db)).toBeNull();
  });
});
