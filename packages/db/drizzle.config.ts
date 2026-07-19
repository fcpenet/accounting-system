import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/resolve-url";

// Anchored to the workspace root so drizzle-kit (cwd: packages/db) targets
// the same file the app and seed script use.
const url = resolveDatabaseUrl(process.env["TURSO_DATABASE_URL"] ?? "file:./local.db");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "turso",
  casing: "snake_case",
  dbCredentials: url.startsWith("file:")
    ? { url }
    : { url, authToken: process.env["TURSO_AUTH_TOKEN"] ?? "" },
});
