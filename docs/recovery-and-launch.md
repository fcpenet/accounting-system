# Recovery & launch runbook

Ordered steps to (1) recover the production users lost to an accidental
`push --force`, and (2) ship the teams / platform-admin feature safely.

## Current production state (starting point)

- **users: 0** — both accounts were dropped. This is the only loss.
- **organizations, accounts, journal_entries, journal_lines: intact.**
- **Schema: already has** `role`, `is_platform_admin`, and the `invitations`
  table (the accidental `push` applied them — which is also what dropped the
  users). So the deploy-ordering hazard is already satisfied: prod has the
  columns the new code reads.
- The **currently deployed code is the pre-teams version**; it works fine
  against the newer schema (it doesn't select the new columns).

Because the schema is already present, **recovery does not require a
migration**, and deploying the new code is safe whenever you choose.

---

## Phase 1 — Recover the users (urgent)

Goal: bring back both user rows **with their original passwords**, so people
can log in. Everything else on live is untouched.

### 1.1 Fork prod to just before the drop

Your real activity (signups, the Cash-in-Bank additions) happened well before
the incident, so a fork ~30+ minutes before the drop is safe.

```bash
turso auth login
turso db create acct-restore \
  --from-db accounting-system-fcpenet \
  --timestamp <RFC3339 ~30 min before the incident>   # e.g. 2026-07-20T…Z
```

### 1.2 Verify the fork actually has the users

```bash
turso db shell acct-restore "SELECT email FROM users"
```

Must show **2 rows** (`me@kikopenetrante.com`, `cocinaexpress1990@gmail.com`).
If it shows 0, the timestamp was after the drop — recreate the fork earlier.

### 1.3 Copy the users back into live

Get the fork's connection details:

```bash
turso db show acct-restore --url        # -> SOURCE_TURSO_URL
turso db tokens create acct-restore     # -> SOURCE_TURSO_TOKEN
```

Dry-run first (default), then commit. `.env.local` supplies the **live**
credentials; `restore-users.ts` refuses to run if the target is a local file.

```bash
SOURCE_TURSO_URL=<fork-url> SOURCE_TURSO_TOKEN=<fork-token> \
  pnpm exec dotenv -e .env.local -- tsx scripts/restore-users.ts          # preview
SOURCE_TURSO_URL=<fork-url> SOURCE_TURSO_TOKEN=<fork-token> \
  pnpm exec dotenv -e .env.local -- tsx scripts/restore-users.ts --commit # write
```

Users are re-inserted with their original ids, so the two existing session
rows become valid again — no forced logout. They come back as `owner` of
their org (the column default), which is what they were.

### 1.4 Verify recovery

```bash
turso db shell accounting-system-fcpenet "SELECT email, role FROM users"
```

Expect 2 owners. Then confirm login works on the **live site** (still the old
code — that's fine). At this point production is functional again.

### 1.5 Clean up

```bash
turso db destroy acct-restore   # once you've confirmed the copy
```

---

## Phase 2 — Ship teams + platform admin (when ready)

The feature is committed locally (`9fcfb11` + the UI commits) but not pushed.

### 2.1 Grant yourself platform admin

The **Admin** nav item and `/admin` only appear for a platform admin. Run
against production (this is a deliberate prod op; only `db push` is guarded):

```bash
pnpm admin:grant me@kikopenetrante.com
```

> `admin:grant` reads `.env.local`. Do this **before** the env-hygiene switch
> in Phase 3, or run it with your prod env file explicitly.

### 2.2 Deploy the code

```bash
git push origin main     # triggers the Vercel build
```

Safe now: prod already has `role` / `is_platform_admin` / `invitations`, so
session lookups won't break. Watch the Vercel build go green.

### 2.3 Smoke test on the live site

1. Log in as `me@kikopenetrante.com`.
2. Confirm the **Admin** item is in the nav → open `/admin`.
3. **Create an organization**: name + an owner email → copy the owner-invite
   link → open it in a private window → set a password → land in the new org
   as its owner.
4. Go to **`/team`** as an owner → invite an Editor and a Viewer → copy each
   link → accept in a private window.
5. Confirm a **viewer cannot post** (the New entry action is refused) and an
   **editor can**.
6. Confirm **public signup is gone**: `/signup` shows "invitation required".

---

## Phase 3 — Guardrails & hygiene (do once, after recovery)

These prevent a repeat of the incident.

### 3.1 Stop `.env.local` pointing at production

`.env.local` is read by every `db:*` script; pointing it at prod is what
made the accident possible. For daily work:

```bash
# .env.local  (local development)
TURSO_DATABASE_URL="file:./local.db"
TURSO_AUTH_TOKEN=""
```

Keep production credentials in a **separate, gitignored** file used only for
deliberate prod operations:

```bash
# .env.prod  (never committed; already covered by .gitignore's .env.*)
TURSO_DATABASE_URL="libsql://accounting-system-fcpenet…"
TURSO_AUTH_TOKEN="…"
```

Run a prod op explicitly, e.g. a future admin grant:

```bash
pnpm exec dotenv -e .env.prod -- tsx scripts/set-admin.ts grant someone@example.com
```

### 3.2 Guardrail already in place

`scripts/guard-remote-db.ts` now wraps `pnpm --filter db push` and **refuses
any remote database** (exit 1) unless `ALLOW_REMOTE_DB=1`. Verified it blocks
prod and still allows local `file:` pushes. Production schema changes go
through **`db migrate`** (additive) — never `push`.

### 3.3 Known caveat: migration ledger

Production schema was originally created with `push`, not migrations, so
`__drizzle_migrations` is empty and `db migrate` will try to re-run `0000`
(and fail, since the tables exist). Before relying on `db migrate` against
prod, baseline the ledger — mark `0000`–`0003` as already applied — then use
`db migrate` for everything after. Until then, apply any new prod schema
change as reviewed, additive SQL (`ALTER TABLE … ADD COLUMN`), which does not
rebuild tables and cannot drop rows.

---

## One-glance sequence

1. Fork prod before the drop → verify 2 users.
2. `restore-users.ts --commit` → users back on live.
3. Verify login works.
4. `pnpm admin:grant me@kikopenetrante.com`.
5. `git push origin main` → Vercel deploy.
6. Smoke test: `/admin` create org, `/team` invite, viewer can't post.
7. Repoint `.env.local` to a local file; keep prod creds in `.env.prod`.
