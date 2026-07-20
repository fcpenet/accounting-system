/**
 * Create a user attached to an EXISTING organization.
 *
 * Built to restore access after the users table was dropped: your Cocina org
 * and its books are intact, only the login row is gone. This re-creates it.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/create-user.ts \
 *     --email me@kikopenetrante.com --org "Cocina" --role admin --superuser
 *
 * The password is read from a hidden prompt (never an argument, never echoed,
 * never logged). It's hashed with the app's real scrypt, so you log in
 * normally afterward.
 *
 * --superuser also grants the global superuser flag (the only actor that can
 * create organizations). Use it to bootstrap the first superuser.
 *
 * Dry-run by default; add --commit to actually write.
 */
import { emitKeypressEvents } from "node:readline";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@acct/core";
import { hashPassword } from "@acct/auth";
import { accounts, db, eq, organizations, sql, users } from "@acct/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg("email")?.trim().toLowerCase();
const orgName = arg("org")?.trim();
const role = (arg("role") ?? "admin") as "admin" | "editor" | "viewer";
const makeSuperuser = process.argv.includes("--superuser");
const createOrg = process.argv.includes("--create-org");
const commit = process.argv.includes("--commit");

if (!email || !orgName) {
  console.error('Usage: --email <email> --org "<org name>" [--role admin|editor|viewer] [--superuser] [--commit]');
  process.exit(1);
}

/** Read a line from the TTY without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error("No TTY — run this in an interactive terminal so the password stays hidden."));
      return;
    }
    process.stdout.write(question);
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    let value = "";
    const onKey = (_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
      if (key.name === "return" || key.name === "enter") {
        input.setRawMode(false);
        input.pause();
        input.off("keypress", onKey);
        process.stdout.write("\n");
        resolve(value);
      } else if (key.ctrl && key.name === "c") {
        process.stdout.write("\n");
        process.exit(1);
      } else if (key.name === "backspace") {
        value = value.slice(0, -1);
      } else if (key.sequence && !key.ctrl) {
        value += key.sequence;
      }
    };
    input.on("keypress", onKey);
  });
}

async function main() {
  let [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`lower(${organizations.name}) = ${orgName!.toLowerCase()}`)
    .limit(1);

  if (!org && !createOrg) {
    console.error(`No organization named "${orgName}". Existing:`);
    for (const o of await db.select({ name: organizations.name }).from(organizations)) {
      console.error(`  - ${o.name}`);
    }
    console.error('Pass --create-org to create it.');
    process.exit(1);
  }

  const willCreateOrg = !org;
  if (willCreateOrg) {
    // --create-org bootstrap: no org exists yet (e.g. right after a reset).
    // Seed the default chart of accounts too, so the org is usable.
    org = { id: crypto.randomUUID(), name: orgName! };
    if (commit) {
      await db.insert(organizations).values({ id: org.id, name: org.name });
      await db.insert(accounts).values(
        DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
          orgId: org!.id,
          code: a.code,
          name: a.name,
          type: a.type,
        })),
      );
    }
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email!))
    .limit(1);
  if (existing) {
    console.error(`A user with ${email} already exists — nothing to do.`);
    process.exit(1);
  }

  console.log(`  org:   ${org.name}${willCreateOrg ? " (will be created)" : ` (${org.id})`}`);
  console.log(`  email: ${email}`);
  console.log(`  role:  ${role}`);
  console.log(`  superuser: ${makeSuperuser ? "yes (can create organizations)" : "no"}`);

  if (!commit) {
    console.log("\n(dry run — re-run with --commit to create the user)");
    return;
  }

  const password = await promptHidden("  New password (min 10 chars): ");
  const again = await promptHidden("  Confirm password: ");
  if (password !== again) {
    console.error("  Passwords don't match.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password); // throws on weak password

  await db.insert(users).values({
    id: crypto.randomUUID(),
    orgId: org.id,
    email: email!,
    passwordHash,
    role,
    isSuperuser: makeSuperuser,
  });

  console.log(
    `\n✓ Created ${email} as ${role} of ${org.name}` +
      `${makeSuperuser ? " and superuser" : ""}. You can log in now.`,
  );
}

main().catch((error) => {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
