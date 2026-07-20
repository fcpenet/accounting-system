"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Shows a generated link with a Copy button. The invite is delivered by the
 * owner pasting this wherever they like — there's no email step.
 */
export function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the input
      // is selectable as a fallback, so this is non-fatal.
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <p className="text-ink text-xs font-medium">{label}</p> : null}
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="bg-canvas border-line-strong text-ink-muted min-h-11 w-full rounded-lg border px-3 font-mono text-xs sm:min-h-10"
        />
        <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
          {copied ? "Copied ✓" : "Copy"}
        </Button>
      </div>
      <p className="text-ink-subtle text-xs">
        Send this link to the person. It expires in 7 days and can be used once.
      </p>
    </div>
  );
}
