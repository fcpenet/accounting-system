import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * No @vitejs/plugin-react here: esbuild's automatic JSX runtime handles the
 * transform on its own, and the plugin's Vite peer range conflicts with the
 * Vite that Vitest ships. One less dependency to keep in step.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.join(here, "src"),
      // Next provides `server-only` at build; in tests it isn't resolvable,
      // so alias it to an empty module.
      "server-only": path.join(here, "test/stubs/empty.ts"),
    },
  },
});
