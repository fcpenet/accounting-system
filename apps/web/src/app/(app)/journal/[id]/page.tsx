import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/money";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { getEntry } from "@/lib/queries";
import { ReverseEntryForm } from "./reverse-form";

export const metadata: Metadata = { title: "Entry" };

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;

  // Scoped by org, so another organization's entry id 404s rather than leaks.
  const entry = await getEntry(user.orgId, id);
  if (!entry) notFound();

  const debits = entry.lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + line.amount, 0);
  const credits = entry.lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + line.amount, 0);

  const reversed = entry.status === "reversed";
  const isReversal = entry.reversesEntryId !== null;

  return (
    <>
      <PageHeader
        title={entry.description}
        description={`${formatDate(entry.date)}${entry.reference ? ` · ${entry.reference}` : ""}`}
        action={
          <Link href="/journal" className="text-accent text-sm font-medium hover:underline">
            ← Journal
          </Link>
        }
      />

      {reversed && entry.reversedByEntryId ? (
        <div className="mb-4">
          <Alert tone="warning">
            This entry was reversed.{" "}
            <Link href={`/journal/${entry.reversedByEntryId}`} className="underline">
              View the reversing entry
            </Link>
            . It no longer affects any report.
          </Alert>
        </div>
      ) : null}

      {isReversal && entry.reversesEntryId ? (
        <div className="mb-4">
          <Alert tone="warning">
            This is a reversing entry.{" "}
            <Link href={`/journal/${entry.reversesEntryId}`} className="underline">
              View the original
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Lines" subtitle={`${entry.lines.length} lines`} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-ink-muted border-line border-b text-xs">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Account
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Debit
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Credit
                </th>
              </tr>
            </thead>

            <tbody className="divide-line divide-y">
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/accounts/${line.accountId}`}
                      className="hover:text-accent"
                    >
                      <span className="tnum text-ink-subtle">{line.accountCode}</span>{" "}
                      <span className="text-ink">{line.accountName}</span>
                    </Link>
                    {line.memo ? (
                      <p className="text-ink-subtle mt-0.5 text-xs">{line.memo}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {line.direction === "debit" ? (
                      <Money value={line.amount} />
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {line.direction === "credit" ? (
                      <Money value={line.amount} />
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-line border-t-2 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">
                  <Money value={debits} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={credits} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {!reversed && !isReversal ? (
        <div className="mt-4">
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Correct this entry</h2>
            <p className="text-ink-muted mt-1 mb-3 text-xs">
              Posted entries can&rsquo;t be edited or deleted. To correct a mistake,
              post a reversal — both the original and the correction stay on the
              record.
            </p>
            <ReverseEntryForm entryId={entry.id} today={todayISO()} />
          </Card>
        </div>
      ) : null}

      <p className="text-ink-subtle mt-4 text-xs">
        Posted {formatDate(entry.createdAt.toISOString().slice(0, 10))}
      </p>
    </>
  );
}
