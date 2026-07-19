import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { listEntries } from "@/lib/queries";

export const metadata: Metadata = { title: "Journal" };

const PAGE_SIZE = 50;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { user } = await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  // Fetch one extra to know whether a next page exists, without a count query.
  const entries = await listEntries(user.orgId, {
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const hasNext = entries.length > PAGE_SIZE;
  const visible = entries.slice(0, PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every posted entry, newest first."
        action={
          <Link href="/journal/new">
            <Button variant="primary">New entry</Button>
          </Link>
        }
      />

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            title={page === 1 ? "No entries yet" : "Nothing on this page"}
            description={
              page === 1
                ? "Post your first journal entry to start building the ledger."
                : undefined
            }
            action={
              page === 1 ? (
                <Link href="/journal/new">
                  <Button variant="primary" size="sm">
                    New entry
                  </Button>
                </Link>
              ) : (
                <Link href="/journal">
                  <Button size="sm">Back to first page</Button>
                </Link>
              )
            }
          />
        ) : (
          <ul className="divide-line divide-y">
            {visible.map((entry) => {
              const total = entry.lines
                .filter((line) => line.direction === "debit")
                .reduce((sum, line) => sum + line.amount, 0);
              const reversed = entry.status === "reversed";

              return (
                <li key={entry.id}>
                  <Link
                    href={`/journal/${entry.id}`}
                    className="hover:bg-canvas block px-4 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink truncate text-sm font-medium">
                          {entry.description}
                        </p>
                        <p className="text-ink-subtle mt-0.5 text-xs">
                          {formatDate(entry.date)}
                          {entry.reference ? ` · ${entry.reference}` : ""}
                          {` · ${entry.lines.length} lines`}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <Money
                          value={total}
                          className={`text-sm font-medium ${
                            reversed ? "text-ink-subtle line-through" : ""
                          }`}
                        />
                        {reversed ? (
                          <p className="text-warning-ink mt-0.5 text-[11px] font-medium">
                            Reversed
                          </p>
                        ) : entry.reversesEntryId ? (
                          <p className="text-ink-subtle mt-0.5 text-[11px]">Reversal</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Account codes give a scannable sense of the entry without opening it. */}
                    <p className="text-ink-subtle mt-1.5 truncate text-xs">
                      {entry.lines
                        .map(
                          (line) =>
                            `${line.direction === "debit" ? "Dr" : "Cr"} ${line.accountCode}`,
                        )
                        .join("  ·  ")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(page > 1 || hasNext) && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? (
            <Link href={`/journal?page=${page - 1}`}>
              <Button size="sm">← Newer</Button>
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link href={`/journal?page=${page + 1}`}>
              <Button size="sm">Older →</Button>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
