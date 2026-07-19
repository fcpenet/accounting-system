import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Resolve a relative `file:` database URL against the workspace root.
 *
 * Without this, `file:./local.db` means three different files: the seed
 * script runs from the repo root, drizzle-kit from packages/db, and Next
 * from apps/web. Anchoring to the workspace root makes one .env value
 * behave the same from every entry point.
 *
 * Remote (libsql://, https://) URLs are returned untouched.
 */
export function resolveDatabaseUrl(url: string, from: string = process.cwd()): string {
  if (!url.startsWith("file:")) return url;

  const path = url.slice("file:".length);
  if (isAbsolute(path)) return url;

  return `file:${resolve(workspaceRoot(from), path)}`;
}

function workspaceRoot(from: string): string {
  let dir = from;

  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    // Hit the filesystem root without finding a marker — fall back to the
    // starting directory rather than throwing.
    if (parent === dir) return from;
    dir = parent;
  }
}
