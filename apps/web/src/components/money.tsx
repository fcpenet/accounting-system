import { type Cents, formatAmount } from "@acct/core";

/**
 * All money on screen goes through here, so alignment and negative-number
 * treatment stay consistent. Negatives are shown in parentheses — the
 * accounting convention, and legible without relying on colour alone.
 */
export function Money({
  value,
  className = "",
  showZero = true,
  colour = false,
}: {
  value: Cents | number;
  className?: string;
  showZero?: boolean;
  /** Tint by sign. Use only where the sign carries meaning, e.g. net income. */
  colour?: boolean;
}) {
  const amount = value as Cents;

  if (amount === 0 && !showZero) {
    return <span className={`tnum text-ink-subtle ${className}`}>—</span>;
  }

  const negative = amount < 0;
  const body = formatAmount(Math.abs(amount) as Cents);
  const tone = colour ? (negative ? "text-negative" : "text-positive") : "";

  return (
    <span className={`tnum ${tone} ${className}`}>
      {negative ? `(${body})` : body}
    </span>
  );
}

/** Right-aligned money cell for tables. */
export function MoneyCell({
  value,
  className = "",
  showZero = false,
  colour = false,
  strong = false,
}: {
  value: Cents | number;
  className?: string;
  showZero?: boolean;
  colour?: boolean;
  strong?: boolean;
}) {
  return (
    <td className={`px-3 py-2 text-right ${className}`}>
      <Money
        value={value}
        showZero={showZero}
        colour={colour}
        className={strong ? "font-semibold" : ""}
      />
    </td>
  );
}
