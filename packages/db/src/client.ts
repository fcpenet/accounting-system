import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { resolveDatabaseUrl } from "./resolve-url";
import * as schema from "./schema";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in ` +
        `(see the Turso setup section of the README).`,
    );
  }
  return value;
}

/**
 * A single libSQL client is reused across invocations. On Vercel that means
 * one per warm lambda; the module-level cache survives between requests and
 * avoids reconnecting on every render.
 *
 * TURSO_AUTH_TOKEN is omitted for local file: URLs, which take no auth.
 */
function createDb() {
  const url = resolveDatabaseUrl(required("TURSO_DATABASE_URL"));

  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: required("TURSO_AUTH_TOKEN") },
  );

  return drizzle(client, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDb>;

let cached: Database | undefined;

export function getDb(): Database {
  cached ??= createDb();
  return cached;
}

/**
 * Convenience proxy so callers can `import { db }` and still get lazy
 * construction — the env vars aren't read until the first actual query,
 * which keeps `next build` from needing database credentials.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
