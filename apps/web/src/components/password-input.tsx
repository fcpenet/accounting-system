"use client";

import { type ComponentPropsWithoutRef, useId, useState } from "react";
import { Input } from "@/components/ui";

/**
 * A password field with a reveal toggle.
 *
 * Lives in its own file so `ui.tsx` can stay free of "use client" — server
 * pages import Card and PageHeader from there, and marking that whole module
 * client-side would drag them into the browser bundle for no reason.
 */
export function PasswordInput({
  invalid,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  const describedBy = useId();

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        invalid={invalid ?? false}
        aria-describedby={describedBy}
        // Room for the toggle so a long password never runs underneath it.
        className={`pr-12 ${className ?? ""}`}
      />

      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // aria-pressed communicates the toggle state; the label says what
        // pressing it will do next.
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={props.id}
        // Full-height 44px target — the whole right edge is tappable, not
        // just the icon.
        className="text-ink-subtle hover:text-ink absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg transition-colors"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>

      <span id={describedBy} className="sr-only">
        {visible ? "Password is visible" : "Password is hidden"}
      </span>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17 17 0 0 1-2.7 3.5M6.6 6.6A17 17 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.5-1.1" />
      <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
