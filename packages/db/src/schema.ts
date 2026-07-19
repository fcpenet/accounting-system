import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Every business table carries `orgId`. Queries are scoped through
 * `requireSession()` in the web app — see apps/web/src/lib/auth.ts.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  /** ISO 4217 code. Single-currency per org for now. */
  currency: text("currency").notNull().default("USD"),
  /** Month the fiscal year starts, 1-12. */
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** scrypt hash; see apps/web/src/lib/password.ts. Null for OAuth-only users. */
    passwordHash: text("password_hash"),
    name: text("name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the cookie token — a database leak must not yield live sessions. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["asset", "liability", "equity", "income", "expense"],
    }).notNull(),
    description: text("description"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // Account codes are unique per org, not globally.
    uniqueIndex("accounts_org_code_unique").on(t.orgId, t.code),
    index("accounts_org_type_idx").on(t.orgId, t.type),
  ],
);

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** ISO date (YYYY-MM-DD). Stored as text so date maths stays lexicographic. */
    date: text("date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    /**
     * Posted entries are immutable. A mistake is corrected by posting a
     * reversal, never by editing history.
     */
    status: text("status", { enum: ["posted", "reversed"] })
      .notNull()
      .default("posted"),
    /** Set on the original when it has been reversed. */
    reversedByEntryId: text("reversed_by_entry_id"),
    /** Set on the reversal, pointing back at what it undoes. */
    reversesEntryId: text("reverses_entry_id"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("journal_entries_org_date_idx").on(t.orgId, t.date),
    index("journal_entries_org_status_idx").on(t.orgId, t.status),
  ],
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    direction: text("direction", { enum: ["debit", "credit"] }).notNull(),
    /** Positive integer minor units (cents). Direction carries the sign. */
    amount: integer("amount").notNull(),
    memo: text("memo"),
    /** Preserves the order lines were entered in, for display. */
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    // The workhorse index: every report reads lines by org + account.
    index("journal_lines_org_account_idx").on(t.orgId, t.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  accounts: many(accounts),
  journalEntries: many(journalEntries),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [accounts.orgId],
    references: [organizations.id],
  }),
  lines: many(journalLines),
}));

export const journalEntriesRelations = relations(
  journalEntries,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [journalEntries.orgId],
      references: [organizations.id],
    }),
    lines: many(journalLines),
    createdBy: one(users, {
      fields: [journalEntries.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, {
    fields: [journalLines.entryId],
    references: [journalEntries.id],
  }),
  account: one(accounts, {
    fields: [journalLines.accountId],
    references: [accounts.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
