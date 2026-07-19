import type { ComponentPropsWithoutRef, ReactNode } from "react";

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cx(
        "bg-surface border-line rounded-xl border shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-ink truncate text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-ink-muted mt-0.5 text-xs">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:bg-ink-subtle border-transparent",
  secondary:
    "bg-surface text-ink border-line-strong hover:border-ink-subtle hover:bg-canvas",
  ghost: "bg-transparent text-ink-muted border-transparent hover:text-ink hover:bg-accent-soft",
  danger:
    "bg-surface text-negative border-line-strong hover:border-negative hover:bg-negative/5",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        // 44px min target on mobile — below that, taps miss.
        "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm"
          ? "min-h-9 px-3 text-xs"
          : "min-h-11 px-4 text-sm sm:min-h-10",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-ink text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-negative text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-ink-subtle text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS =
  "bg-surface border-line-strong text-ink placeholder:text-ink-subtle " +
  "min-h-11 w-full rounded-lg border px-3 text-sm transition-colors " +
  "focus:border-accent focus:outline-none sm:min-h-10";

export function Input({
  className,
  invalid,
  ...props
}: ComponentPropsWithoutRef<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cx(CONTROL_CLASS, invalid && "border-negative", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid,
  ...props
}: ComponentPropsWithoutRef<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={cx(CONTROL_CLASS, "appearance-none pr-8", invalid && "border-negative", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------

export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "warning" | "success";
}) {
  const tones = {
    error: "bg-negative/8 text-negative border-negative/25",
    warning: "bg-warning-soft text-warning-ink border-warning-ink/25",
    success: "bg-positive/8 text-positive border-positive/25",
  } as const;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-lg border px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-ink text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-ink-muted max-w-sm text-xs">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-ink text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-muted mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
