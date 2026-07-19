import type { Metadata } from "next";
import Link from "next/link";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  NORMAL_BALANCE,
  accountBalances,
} from "@acct/core";
import { Money } from "@/components/money";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listAccounts, listLedgerLines } from "@/lib/queries";
import { NewAccountForm } from "./new-account-form";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const { user } = await requireSession();

  const [accounts, lines] = await Promise.all([
    listAccounts(user.orgId, { includeArchived: true }),
    listLedgerLines(user.orgId),
  ]);

  const balances = accountBalances(lines, accounts);
  const byId = new Map(balances.map((row) => [row.account.id, row]));

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Balances shown in each account's normal direction."
      />

      <div className="mb-4">
        <NewAccountForm />
      </div>

      <div className="flex flex-col gap-4">
        {ACCOUNT_TYPES.map((type) => {
          const group = accounts.filter((account) => account.type === type);
          if (group.length === 0) return null;

          const subtotal = group.reduce(
            (sum, account) => sum + (byId.get(account.id)?.balance ?? 0),
            0,
          );

          return (
            <Card key={type}>
              <CardHeader
                title={`${ACCOUNT_TYPE_LABELS[type]} accounts`}
                subtitle={`Normal balance: ${NORMAL_BALANCE[type]}`}
                action={
                  <span className="tnum text-ink text-sm font-semibold">
                    <Money value={subtotal} />
                  </span>
                }
              />

              <ul className="divide-line divide-y">
                {group.map((account) => {
                  const balance = byId.get(account.id)?.balance ?? 0;

                  return (
                    <li key={account.id}>
                      <Link
                        href={`/accounts/${account.id}`}
                        className="hover:bg-canvas flex items-center justify-between gap-3 px-4 py-3 transition-colors"
                      >
                        <div className="flex min-w-0 items-baseline gap-2.5">
                          <span className="tnum text-ink-subtle text-xs">
                            {account.code}
                          </span>
                          <span
                            className={`truncate text-sm ${
                              account.archived ? "text-ink-subtle" : "text-ink"
                            }`}
                          >
                            {account.name}
                          </span>
                          {account.archived ? (
                            <span className="text-ink-subtle border-line shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                              Archived
                            </span>
                          ) : null}
                        </div>

                        <Money value={balance} className="shrink-0 text-sm" showZero />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
