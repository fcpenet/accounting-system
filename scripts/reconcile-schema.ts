/**
 * Reconcile production's schema with the current code after the
 * role/superuser rename. Fixes the outage:
 *   "no such column: users.is_superuser"
 *
 * Two safe, additive operations — a column RENAME (preserves every row; no
 * table rebuild) and a scoped data UPDATE:
 *
 *   ALTER TABLE users RENAME COLUMN is_platform_admin TO is_superuser;
 *   UPDATE users       SET role='admin' WHERE role='owner';
 *   UPDATE invitations SET role='admin' WHERE role='owner';
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/reconcile-schema.ts          # dry run
 *   pnpm exec dotenv -e .env.local -- tsx scripts/reconcile-schema.ts --commit # apply
 *
 * Refuses to run against a local file (this is a production remediation).
 */
import { db, sql } from "@acct/db";

const commit = process.argv.includes("--commit");

const url = process.env["TURSO_DATABASE_URL"] ?? "";
if (url.startsWith("file:")) {
  console.error("TURSO_DATABASE_URL is a local file — this remediation is for production.");
  process.exit(1);
}

async function cols(table: string): Promise<string[]> {
  const r: any = await db.run(sql.raw(`PRAGMA table_info(${table})`));
  return (r.rows ?? []).map((x: any) => x.name ?? x[1]);
}
async function count(q: string): Promise<number> {
  const r: any = await db.run(sql.raw(q));
  return Number((r.rows?.[0] as any)?.c ?? (r.rows?.[0] as any)?.[0] ?? 0);
}

async function main() {
  const before = await cols("users");
  console.log("  users columns:", before.join(", "));

  const needsRename = before.includes("is_platform_admin") && !before.includes("is_superuser");
  const ownerUsers = await count("SELECT COUNT(*) c FROM users WHERE role='owner'");
  const ownerInvites = await count("SELECT COUNT(*) c FROM invitations WHERE role='owner'");

  console.log(`\n  rename is_platform_admin -> is_superuser: ${needsRename ? "yes" : "not needed"}`);
  console.log(`  users with role 'owner' to fix:  ${ownerUsers}`);
  console.log(`  invites with role 'owner' to fix: ${ownerInvites}`);

  if (before.includes("is_superuser") && ownerUsers === 0 && ownerInvites === 0) {
    console.log("\n✓ Schema already reconciled — nothing to do.");
    return;
  }

  if (!commit) {
    console.log("\n(dry run — re-run with --commit to apply)");
    return;
  }

  if (needsRename) {
    await db.run(sql`ALTER TABLE users RENAME COLUMN is_platform_admin TO is_superuser`);
    console.log("  ✓ renamed column");
  }
  if (ownerUsers > 0) {
    await db.run(sql`UPDATE users SET role='admin' WHERE role='owner'`);
    console.log("  ✓ updated user roles");
  }
  if (ownerInvites > 0) {
    await db.run(sql`UPDATE invitations SET role='admin' WHERE role='owner'`);
    console.log("  ✓ updated invitation roles");
  }

  const after = await cols("users");
  console.log("\n  users columns now:", after.join(", "));
  console.log(after.includes("is_superuser") ? "✓ Done — the app should recover." : "✗ is_superuser still missing");
}

main().catch((e) => {
  console.error("\nFailed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
