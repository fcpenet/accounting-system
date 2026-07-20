/**
 * Grant or revoke the global platform-admin flag for a user.
 *
 *   pnpm admin:grant  <email>
 *   pnpm admin:revoke <email>
 *
 * Platform admin is deliberately out-of-band: there is no self-service path,
 * so the only way in is an operator running this against the database. Bind
 * it to the same TURSO_* env the app uses.
 */
import { db, eq, users } from "@acct/db";

const mode = process.argv[2]; // "grant" | "revoke"
const email = process.argv[3]?.trim().toLowerCase();

if ((mode !== "grant" && mode !== "revoke") || !email) {
  console.error("Usage: tsx scripts/set-admin.ts <grant|revoke> <email>");
  process.exit(1);
}

const [user] = await db
  .select({ id: users.id, email: users.email, isPlatformAdmin: users.isPlatformAdmin })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (!user) {
  console.error(`No user with email ${email}. They must have an account first.`);
  process.exit(1);
}

const isAdmin = mode === "grant";
if (user.isPlatformAdmin === isAdmin) {
  console.log(`  ${email} is already ${isAdmin ? "an admin" : "not an admin"} — no change.`);
  process.exit(0);
}

await db.update(users).set({ isPlatformAdmin: isAdmin }).where(eq(users.id, user.id));
console.log(`  ${email} is now ${isAdmin ? "a platform admin ✓" : "no longer an admin ✓"}`);
