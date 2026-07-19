import { Button, Field, Input } from "@/components/ui";

/**
 * Plain GET form — no client JS. Report ranges live in the URL so a
 * particular view can be bookmarked, shared, or reloaded unchanged.
 */
export function DateRangeForm({
  action,
  from,
  to,
  mode = "range",
}: {
  action: string;
  from?: string | undefined;
  to: string;
  mode?: "range" | "asOf";
}) {
  return (
    <form action={action} method="get" className="mb-4">
      <div className="flex flex-wrap items-end gap-3">
        {mode === "range" ? (
          <Field label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from} className="w-44" />
          </Field>
        ) : null}

        <Field label={mode === "range" ? "To" : "As of"} htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={to} className="w-44" />
        </Field>

        <Button type="submit">Update</Button>
      </div>
    </form>
  );
}
