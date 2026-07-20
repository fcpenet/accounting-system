/**
 * Grant or revoke the global superuser flag for a user.
 *
 *   pnpm superuser:grant  <email>
 *   pnpm superuser:revoke <email>
 *
 * Superuser is deliberately out-of-band: there is no self-service path,
 * so the only way in is an operator running this against the database. Bind
 * it to the same TURSO_* env the app uses.
 */
import { db, eq, users } from "@acct/db";

const mode = process.argv[2]; // "grant" | "revoke"
const email = process.argv[3]?.trim().toLowerCase();

if ((mode !== "grant" && mode !== "revoke") || !email) {
  console.error("Usage: tsx scripts/set-superuser.ts <grant|revoke> <email>");
  process.exit(1);
}

const [user] = await db
  .select({ id: users.id, email: users.email, isSuperuser: users.isSuperuser })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (!user) {
  console.error(`No user with email ${email}. They must have an account first.`);
  process.exit(1);
}

const isSuperuser = mode === "grant";
if (user.isSuperuser === isSuperuser) {
  console.log(`  ${email} is already ${isSuperuser ? "a superuser" : "not a superuser"} — no change.`);
  process.exit(0);
}

await db.update(users).set({ isSuperuser }).where(eq(users.id, user.id));
console.log(`  ${email} is now ${isSuperuser ? "a superuser ✓" : "no longer a superuser ✓"}`);
