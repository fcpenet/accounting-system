import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@acct/core";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt from Node's stdlib rather than bcrypt/argon2. Both of those ship
 * native bindings that need per-platform builds; scrypt is built in, so the
 * Vercel deployment has nothing to compile and nothing to go stale.
 *
 * N=2^15 with r=8 costs roughly 100ms per hash on typical serverless CPU —
 * slow enough to make offline guessing expensive, fast enough for a login.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export { MIN_PASSWORD_LENGTH };

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPasswordError";
  }
}

export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // Bound the work an unauthenticated request can ask us to do.
    throw new WeakPasswordError("Password is too long");
  }
}

/** Returns `scrypt$N$r$p$<salt-b64>$<hash-b64>` — self-describing, so the
 *  parameters can be raised later without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  // Users without a password (or a nonexistent user) still pay the cost of a
  // hash, so response timing doesn't reveal which emails are registered.
  if (stored === null) {
    await scrypt(password, randomBytes(SALT_LENGTH), KEY_LENGTH, PARAMS);
    return false;
  }

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts as [
    string, string, string, string, string, string,
  ];

  const expected = Buffer.from(hashB64, "base64");
  const derived = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
