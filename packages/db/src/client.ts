import { createRequire } from "node:module";
import type { Client } from "@libsql/client";
import { createClient as createWebClient } from "@libsql/client/web";
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
 * Pick a libSQL client based on the URL scheme.
 *
 * Remote (libsql:// or https://) uses `@libsql/client/web` — pure JavaScript
 * over fetch, with no native dependency. That is the only path production
 * ever takes, and keeping it free of native code is what makes the app
 * deployable as a serverless function: nothing to compile per-platform, and
 * no 7.5 MB `.node` binary for the file tracer to find and bundle.
 *
 * Local `file:` databases need the native binding, so that client is loaded
 * lazily through createRequire. Because the require is not a static import,
 * bundlers don't follow it and it never reaches the serverless build.
 */
function makeClient(url: string): Client {
  if (url.startsWith("file:")) {
    const require = createRequire(import.meta.url);
    const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
    return createClient({ url });
  }

  return createWebClient({ url, authToken: required("TURSO_AUTH_TOKEN") });
}

/**
 * A single client is reused across invocations. On Vercel that means one per
 * warm lambda; the module-level cache survives between requests and avoids
 * reconnecting on every render.
 */
function createDb() {
  const url = resolveDatabaseUrl(required("TURSO_DATABASE_URL"));
  return drizzle(makeClient(url), { schema, casing: "snake_case" });
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
