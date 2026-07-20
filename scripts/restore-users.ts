/**
 * Surgical user restore after the users table was dropped on production.
 *
 * Reads user rows from a SOURCE database (a Turso point-in-time fork taken
 * before the drop) and inserts any that are missing from the live database.
 * Everything else on live — orgs, accounts, journal entries — is already
 * intact and is left untouched.
 *
 * The live users table has newer columns (role, is_platform_admin) with
 * defaults, so the older rows insert cleanly: restored users come back as
 * owners of their org, which is what they were.
 *
 *   SOURCE_TURSO_URL=libsql://acct-restore-...  \
 *   SOURCE_TURSO_TOKEN=...                       \
 *   pnpm exec dotenv -e .env.local -- tsx scripts/restore-users.ts
 *
 * .env.local supplies the LIVE TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
 * Dry-run by default; pass --commit to actually write.
 */
import { createClient } from "@libsql/client";

const commit = process.argv.includes("--commit");

const sourceUrl = process.env["SOURCE_TURSO_URL"];
const sourceToken = process.env["SOURCE_TURSO_TOKEN"];
const liveUrl = process.env["TURSO_DATABASE_URL"];
const liveToken = process.env["TURSO_AUTH_TOKEN"];

if (!sourceUrl || !liveUrl) {
  console.error("Set SOURCE_TURSO_URL (the fork) and TURSO_DATABASE_URL (live, via .env.local).");
  process.exit(1);
}
if (liveUrl.startsWith("file:")) {
  console.error("TURSO_DATABASE_URL points at a local file, not production — aborting.");
  process.exit(1);
}

const source = createClient({ url: sourceUrl, ...(sourceToken ? { authToken: sourceToken } : {}) });
const live = createClient({ url: liveUrl, ...(liveToken ? { authToken: liveToken } : {}) });

const fromRows = (await source.execute("SELECT * FROM users")).rows;
console.log(`Source fork has ${fromRows.length} user(s).`);
if (fromRows.length === 0) {
  console.error("The fork has no users — its timestamp is likely after the drop. Re-fork earlier.");
  process.exit(1);
}

const existing = new Set(
  (await live.execute("SELECT email FROM users")).rows.map((r) => String(r["email"])),
);

let restored = 0;
for (const u of fromRows) {
  const email = String(u["email"]);
  if (existing.has(email)) {
    console.log(`  skip ${email} (already present)`);
    continue;
  }
  console.log(`  ${commit ? "restore" : "would restore"} ${email} -> org ${u["org_id"]}`);
  if (commit) {
    await live.execute({
      sql: `INSERT INTO users (id, org_id, email, password_hash, name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        u["id"] as string,
        u["org_id"] as string,
        email,
        (u["password_hash"] ?? null) as string | null,
        (u["name"] ?? null) as string | null,
        (u["created_at"] ?? Date.now()) as number,
      ],
    });
    restored += 1;
  }
}

console.log(commit ? `\n✓ Restored ${restored} user(s).` : `\n(dry run — re-run with --commit to write)`);
