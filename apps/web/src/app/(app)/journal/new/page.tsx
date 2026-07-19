import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, PageHeader, Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { listAccounts } from "@/lib/queries";
import { EntryForm } from "./entry-form";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage() {
  const { user } = await requireSession();
  const accounts = await listAccounts(user.orgId);

  return (
    <>
      <PageHeader
        title="New journal entry"
        description="Debits and credits must balance before this can be posted."
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            title="No accounts yet"
            description="Add at least two accounts before posting an entry."
            action={
              <Link href="/accounts">
                <Button variant="primary" size="sm">
                  Go to accounts
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <EntryForm accounts={accounts} today={todayISO()} />
      )}
    </>
  );
}
