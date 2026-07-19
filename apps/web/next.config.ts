import type { NextConfig } from "next";

/**
 * libSQL ships a native binding (`libsql`) used for local `file:` databases.
 * `@acct/db` is in transpilePackages so Next compiles its TypeScript, but
 * that also pulls its dependencies into the bundle — which makes webpack try
 * to parse a prebuilt `.node` binary. Marking them external on the server
 * leaves them as plain runtime requires, which is what they need to be.
 */
const NATIVE_SERVER_DEPS = ["@libsql/client", "libsql"];

const config: NextConfig = {
  // The workspace packages ship raw TypeScript; Next compiles them itself
  // rather than us maintaining a build step per package.
  transpilePackages: ["@acct/core", "@acct/db", "@acct/auth", "@acct/ledger"],
  serverExternalPackages: NATIVE_SERVER_DEPS,

  typedRoutes: true,

  webpack: (webpackConfig, { isServer }) => {
    if (isServer) {
      const externals = webpackConfig.externals ?? [];
      webpackConfig.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (
            request &&
            NATIVE_SERVER_DEPS.some(
              (dep) => request === dep || request.startsWith(`${dep}/`),
            )
          ) {
            return callback(null, `commonjs ${request}`);
          }
          return callback();
        },
      ];
    }
    return webpackConfig;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
