/**
 * Refuses to run a destructive drizzle-kit command against a REMOTE database.
 *
 * Born from an incident: `db push --force` read .env.local (which pointed at
 * production) and rebuilt the users table, dropping every row. Schema pushes
 * are for local files only; production changes go through reviewed,
 * additive migrations.
 *
 * Usage (as a launcher — validates, then runs the rest of the argv):
 *   tsx scripts/guard-remote-db.ts drizzle-kit push
 *
 * Override for a deliberate, understood remote op:
 *   ALLOW_REMOTE_DB=1 tsx scripts/guard-remote-db.ts drizzle-kit push
 */
import { spawnSync } from "node:child_process";

const url = process.env["TURSO_DATABASE_URL"] ?? "";
const isRemote = url !== "" && !url.startsWith("file:");
const allowed = process.env["ALLOW_REMOTE_DB"] === "1";

if (isRemote && !allowed) {
  console.error(
    [
      "",
      "  ✗ Refusing to run against a REMOTE database.",
      `    TURSO_DATABASE_URL = ${url.replace(/(\/\/[^.]+).*/, "$1…")}`,
      "",
      "    Destructive schema commands (push) are for local file: databases.",
      "    To change production, write a migration and apply it with `db migrate`.",
      "    If you REALLY mean to run this remotely, set ALLOW_REMOTE_DB=1.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const [, , command, ...rest] = process.argv;
if (!command) {
  console.error("guard-remote-db: nothing to run");
  process.exit(1);
}

const result = spawnSync(command, rest, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
