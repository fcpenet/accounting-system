# Ledger

A double-entry accounting system. Mobile-first web app, deployed on Vercel, with
Turso (libSQL) for both data and authentication.

Multi-tenant: each user signs up with an organization, and every query is scoped
to it.

## What it does

- **Double-entry general ledger.** Debits must equal credits on every entry —
  enforced in one place and impossible to bypass from the UI.
- **Chart of accounts.** Five account types (asset, liability, equity, income,
  expense) with correct normal-balance handling. New orgs get a conventional
  starter chart.
- **Immutable journal.** Posted entries are never edited or deleted. Corrections
  are reversing entries, so the mistake and its fix both stay on the record.
- **Reports.** Trial balance, income statement (P&L), balance sheet, and a
  per-account ledger with running balances. All date-filterable via the URL.

## Architecture

A pnpm workspace deployed as a single Vercel project. The Next.js app is both
frontend and backend — server components read, server actions write — so there
is no separate API service to deploy or keep in sync.

```
apps/web          Next.js 15 App Router. UI + server actions (HTTP plumbing only).
packages/core     The accounting engine. Pure TypeScript, zero dependencies.
packages/ledger   Service layer: validate-then-write against the database.
packages/db       Drizzle schema + Turso client.
packages/auth     Password hashing and session management.
scripts/          seed, verify, and dev helpers.
```

The dependency direction is strictly one-way: `core` knows nothing about the
database, `ledger` composes `core` + `db`, and `apps/web` is a thin layer over
`ledger`. That is what lets the money arithmetic and the write path be tested
without a browser or a running server.

### Three decisions worth knowing about

**Money is integer cents, never floats.** `Cents` is a branded type, and
`parseAmount` is string-based — `Math.round(parseFloat("1.005") * 100)` silently
returns 100 instead of 101, and a ledger that drifts by a cent is a ledger
nobody trusts. Input with sub-cent precision is rejected rather than rounded.

**Posted entries are immutable.** There is no edit or delete. `reverseEntry`
writes a mirror-image entry and links the two. This is what makes the audit
trail real rather than decorative.

**Dates are ISO strings, not timestamps.** An entry dated `2026-01-31` is on the
31st for everyone. Storing an instant would let a timezone shift move an entry
into a different period and quietly change a closed month's numbers.

## Getting started

```bash
pnpm install
cp .env.example .env.local        # defaults to a local SQLite file
pnpm db:push                      # create the tables
pnpm db:seed                      # demo org with a quarter of books
pnpm dev
```

Then sign in at http://localhost:3000 with:

```
demo@example.com / demo-password-123
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app |
| `pnpm test` | Run all tests (52 across core, auth, ledger) |
| `pnpm typecheck` | Typecheck every package |
| `pnpm db:push` | Apply the schema directly (development) |
| `pnpm db:generate` / `db:migrate` | Generate and run versioned migrations |
| `pnpm db:seed` | Seed the demo organization |
| `pnpm db:verify` | Re-derive reports and assert the books balance |
| `pnpm db:studio` | Browse the database |

`db:verify` is worth knowing about: it reads every organization's ledger back
out and asserts that debits equal credits and that assets equal liabilities plus
equity. Run it after a migration or a bulk import.

## Deploying to Vercel

1. **Create the Turso database.**

   ```bash
   turso db create accounting
   turso db show accounting --url        # -> TURSO_DATABASE_URL
   turso db tokens create accounting     # -> TURSO_AUTH_TOKEN
   ```

2. **Apply the schema** to it:

   ```bash
   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." pnpm db:push
   ```

3. **Import the repo in Vercel and set the Root Directory to `apps/web`.**

   This step is not optional, and it is the one that trips people up. Vercel
   looks for `next` in the `package.json` at the Root Directory. This repo's
   root `package.json` is a workspace manifest with no `next` in it, so
   leaving Root Directory at the repo root fails with:

   > No Next.js version detected. Make sure your package.json has "next" in
   > either "dependencies" or "devDependencies".

   Pointing it at `apps/web` lets framework detection find Next.js. Leave
   "Include source files outside of the Root Directory" enabled (the default)
   so `packages/*` still resolve — `transpilePackages` compiles them from
   source at build time.

   Setting the Root Directory is the *only* fix. A root-level `vercel.json`
   pinning `"framework": "nextjs"` looks like it should work and does not:
   Vercel still needs to resolve the actual `next` version from the
   `package.json` at the Root Directory, so it accepts the pin, proceeds down
   the Next.js path, and then fails the version check with the same error.
   Adding `next` to the root workspace manifest just to satisfy it would be
   worse — a duplicate dependency that can drift from the real one.

   `apps/web/vercel.json` pins `"framework": "nextjs"`. It lives there, not
   at the repo root, because Vercel reads `vercel.json` from the Root
   Directory — a root-level one is ignored entirely once Root Directory is
   `apps/web`.

   The pin matters because the framework preset is saved **at import time**.
   If the first import failed detection (see above), Vercel persists
   `Framework Preset = Other`, and fixing Root Directory afterwards does not
   re-run detection. The build then fails with a second, more confusing
   error:

   > No Output Directory named "public" found after the Build completed.

   That is the "Other" preset looking for a static site. Set Framework Preset
   to Next.js in Settings → General, or let this file assert it. pnpm
   workspaces are detected and installed from the repo root automatically.

4. **Add both environment variables** in Vercel (Production and Preview), then
   deploy.

   `next build` does not need them — the database client is constructed lazily
   on first query, so a missing variable surfaces at runtime rather than
   breaking the build.

Preview deployments share whatever database you point them at. If you want them
isolated, create a second Turso database and scope those variables to Preview.

### Notes on the Vercel runtime

`@libsql/client` and its native `libsql` binding are marked external in
`next.config.ts`. They must not be bundled — webpack would try to parse a
prebuilt `.node` binary. If you ever see a build error mentioning
`@libsql/darwin-arm64`, that config is what fixes it.

## Authentication

Email and password, with sessions in Turso. No third-party identity provider.

- **Passwords**: scrypt (`N=2^15, r=8`) from Node's standard library. Chosen over
  bcrypt/argon2 specifically because it needs no native build step on Vercel. The
  stored format is self-describing, so the cost parameters can be raised later
  without invalidating existing hashes.
- **Sessions**: the cookie holds 256 bits of random; the database stores only its
  SHA-256. Read access to the sessions table does not let anyone log in.
  Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production. Expiry
  slides on use, and expired rows are deleted when encountered.
- **Enumeration**: login returns one message for both "no such user" and "wrong
  password", and hashes even when no user exists so response timing stays flat.

## Tenant isolation

Every business table carries `org_id`, and every query filters on it. There is no
unscoped read path. Entry validation resolves account IDs against a chart
re-fetched for the acting organization, so a tampered form can't reference
another org's accounts — it fails as "Unknown account". This is covered by
tests in `packages/ledger/test`.

## Testing

```bash
pnpm test
```

- `packages/core` — money arithmetic, parsing, entry validation, and every
  report, against hand-checked figures.
- `packages/auth` — hashing, verification, and the no-user timing path.
- `packages/ledger` — the write path against a **real** libSQL database, not a
  mock: transaction rollback on invalid entries, reversal linkage, and
  cross-tenant access attempts.

## Not built yet

Worth knowing before you rely on this:

- **Single currency per organization.** The field exists; there is no FX handling.
- **No period close.** Nothing prevents posting into a prior month.
- **One user per organization.** The schema supports more, but there are no
  invitations or roles.
- **No CSV/bank import or export.**
- **No rate limiting on login.** Add it before exposing this publicly.
