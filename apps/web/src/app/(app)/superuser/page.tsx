import type { Metadata } from "next";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireSuperuser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { listAllOrganizations } from "@/lib/queries";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Superuser" };

export default async function AdminPage() {
  // Non-superusers are redirected to their dashboard — the area doesn't exist
  // for them.
  await requireSuperuser();
  const orgs = await listAllOrganizations();

  return (
    <>
      <PageHeader
        title="Superuser"
        description="Create organizations and invite their first admin. Superuser only."
      />

      <div className="mb-4">
        <CreateOrgForm />
      </div>

      <Card>
        <CardHeader
          title="Organizations"
          subtitle={`${orgs.length} in the system`}
        />
        {orgs.length === 0 ? (
          <EmptyState title="No organizations yet" description="Create the first one above." />
        ) : (
          <ul className="divide-line divide-y">
            {orgs.map((org) => (
              <li key={org.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-medium">{org.name}</p>
                  <p className="text-ink-subtle text-xs">
                    {org.memberCount} {org.memberCount === 1 ? "member" : "members"} ·{" "}
                    {org.currency} · created {formatDate(org.createdAt.toISOString().slice(0, 10))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
