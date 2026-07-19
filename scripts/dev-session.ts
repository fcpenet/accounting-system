/**
 * Mint a session token for a user, for local testing.
 *
 *   pnpm dev:session demo@example.com
 *
 * Prints a cookie value you can paste into curl or a browser devtools.
 * Development helper only — it bypasses the password check by design.
 */
import { createSession } from "@acct/auth";
import { db, eq, users } from "@acct/db";

const email = process.argv[2] ?? "demo@example.com";

const [user] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (!user) {
  console.error(`No user with email ${email}. Run \`pnpm db:seed\` first.`);
  process.exit(1);
}

const { token, expiresAt } = await createSession(user.id);
console.log(token);
console.error(`(expires ${expiresAt.toISOString()})`);
