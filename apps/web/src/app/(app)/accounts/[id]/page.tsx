import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACCOUNT_TYPE_LABELS, NORMAL_BALANCE, runningBalance } from "@acct/core";
import { Money } from "@/components/money";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { accountLedger, getAccount } from "@/lib/queries";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;

  const account = await getAccount(user.orgId, id);
  if (!account) notFound();

  const lines = await accountLedger(user.orgId, id);
  const rows = runningBalance(lines, account.type);
  const closing = rows.at(-1)?.runningBalance ?? 0;

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.code} · ${ACCOUNT_TYPE_LABELS[account.type]} · normal balance ${NORMAL_BALANCE[account.type]}`}
        action={
          <Link href="/accounts" className="text-accent text-sm font-medium hover:underline">
            ← Accounts
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <p className="text-ink-muted text-xs font-medium">Current balance</p>
        <p className="mt-1 text-2xl font-semibold">
          <Money value={closing} showZero />
        </p>
        <p className="text-ink-subtle mt-0.5 text-xs">
          {rows.length} {rows.length === 1 ? "posting" : "postings"}
        </p>
      </Card>

      <Card>
        <CardHeader title="Ledger" subtitle="Oldest first" />

        {rows.length === 0 ? (
          <EmptyState
            title="No postings yet"
            description="Entries referencing this account will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="text-ink-muted border-line border-b text-xs">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Debit
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Credit
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>

              <tbody className="divide-line divide-y">
                {rows.map((row, index) => (
                  <tr key={`${row.entryId}-${index}`} className="hover:bg-canvas">
                    <td className="text-ink-muted px-4 py-2.5 whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/journal/${row.entryId}`} className="hover:text-accent">
                        {row.description}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.direction === "debit" ? (
                        <Money value={row.amount} />
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {row.direction === "credit" ? (
                        <Money value={row.amount} />
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      <Money value={row.runningBalance} showZero />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
