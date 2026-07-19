import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  hashPassword,
  verifyPassword,
} from "../src/password";

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("produces a self-describing hash, not the password", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(hash).not.toContain(PASSWORD);
  });

  it("salts, so identical passwords hash differently", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    // ...and both still verify.
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });

  it("rejects passwords below the minimum length", async () => {
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(
      WeakPasswordError,
    );
  });

  it("rejects absurdly long passwords", async () => {
    await expect(hashPassword("a".repeat(2000))).rejects.toThrow(WeakPasswordError);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("wrong password entirely", hash)).toBe(false);
    expect(await verifyPassword(`${PASSWORD} `, hash)).toBe(false);
    expect(await verifyPassword(PASSWORD.toUpperCase(), hash)).toBe(false);
  });

  it("returns false for a null hash instead of throwing", async () => {
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
  });

  it("returns false for malformed stored values", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2", "bcrypt$1$2$3$4$5"]) {
      expect(await verifyPassword(PASSWORD, bad), bad).toBe(false);
    }
  });

  it("still does the work when there is no user, to flatten timing", async () => {
    // Not a precise timing assertion (too flaky in CI) — just that the
    // no-user path is meaningfully slow rather than an instant return.
    const start = performance.now();
    await verifyPassword(PASSWORD, null);
    expect(performance.now() - start).toBeGreaterThan(5);
  });
});
