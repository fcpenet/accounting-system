/**
 * DESTRUCTIVE: drop every table in the target database.
 *
 * Used to reset production to a clean slate before re-applying the schema via
 * `db migrate`. Wipes all data — organizations, accounts, journal entries,
 * users, everything.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/reset-db.ts          # dry run
 *   pnpm exec dotenv -e .env.local -- tsx scripts/reset-db.ts --commit # DROP
 */
import { db, sql } from "@acct/db";

const commit = process.argv.includes("--commit");
const url = process.env["TURSO_DATABASE_URL"] ?? "(unset)";

// Child tables first so foreign keys never block a drop.
const TABLES = [
  "sessions",
  "journal_lines",
  "journal_entries",
  "invitations",
  "accounts",
  "users",
  "organizations",
  "__drizzle_migrations",
];

async function existing(): Promise<string[]> {
  const r: any = await db.run(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  );
  return (r.rows ?? []).map((x: any) => x.name ?? x[0]);
}

async function main() {
  console.log(`  target: ${url.replace(/(\/\/[^.]+).*/, "$1…")}`);
  const present = await existing();
  console.log("  tables present:", present.sort().join(", ") || "(none)");

  if (!commit) {
    console.log("\n(dry run — re-run with --commit to DROP every table above)");
    return;
  }

  await db.run(sql`PRAGMA foreign_keys=OFF`);
  for (const t of TABLES) {
    await db.run(sql.raw(`DROP TABLE IF EXISTS ${t}`));
    console.log(`  dropped ${t}`);
  }
  // Anything not in the known list (defensive).
  for (const t of await existing()) {
    await db.run(sql.raw(`DROP TABLE IF EXISTS "${t}"`));
    console.log(`  dropped ${t} (extra)`);
  }

  console.log("\n✓ All tables dropped. Next: `pnpm --filter db migrate` to recreate the schema.");
}

main().catch((e) => {
  console.error("\nFailed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
