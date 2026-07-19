/**
 * Money is represented everywhere as an integer number of minor units
 * (cents for USD). Floating point is never used for amounts: 0.1 + 0.2
 * is not 0.3, and a ledger that drifts by a cent is a ledger nobody trusts.
 */

/** An integer count of minor units. Branded so a raw number can't sneak in. */
export type Cents = number & { readonly __brand: "Cents" };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Largest amount we accept: ~90 trillion dollars, well inside Number.MAX_SAFE_INTEGER. */
const MAX_CENTS = 9_000_000_000_000_000;

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Amount must be a whole number of cents, got ${value}`);
  }
  if (Math.abs(value) > MAX_CENTS) {
    throw new MoneyError(`Amount ${value} exceeds the supported range`);
  }
  return value as Cents;
}

export const ZERO = cents(0);

export function add(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negate(a: Cents): Cents {
  return cents(-a);
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => add(acc, v), ZERO);
}

export function isZero(a: Cents): boolean {
  return a === 0;
}

/**
 * Parse human input into cents. Accepts "1234.56", "1,234.56", "$1,234.56",
 * "(1,234.56)" for negatives (accounting convention), "1234", ".5", "-12.3".
 *
 * Deliberately string-based: `Math.round(parseFloat(x) * 100)` is wrong for
 * values like 1.005, which parses to 1.00499999... and rounds down.
 */
export function parseAmount(input: string): Cents {
  const trimmed = input.trim();
  if (trimmed === "") throw new MoneyError("Amount is required");

  // Accounting negatives: (123.45) means -123.45
  const parenthesised = /^\((.*)\)$/.exec(trimmed);
  const unwrapped = parenthesised?.[1] ?? trimmed;

  const cleaned = unwrapped.replace(/[$\s,]/g, "");
  const match = /^(?<sign>[+-]?)(?<whole>\d*)(?:\.(?<frac>\d*))?$/.exec(cleaned);
  if (!match?.groups) {
    throw new MoneyError(`"${input}" is not a valid amount`);
  }

  const { sign, whole, frac = "" } = match.groups as {
    sign: string;
    whole: string;
    frac?: string;
  };

  if (whole === "" && frac === "") {
    throw new MoneyError(`"${input}" is not a valid amount`);
  }
  if (frac.length > 2) {
    throw new MoneyError(
      `"${input}" has more than 2 decimal places; amounts are stored to the cent`,
    );
  }

  const minor = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  const negative = sign === "-" || parenthesised !== null;
  return cents(negative ? -minor : minor);
}

/** Format cents for display: 123456 -> "1,234.56". No currency symbol. */
export function formatAmount(value: Cents): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toLocaleString("en-US");
  const body = `${grouped}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Format with a currency symbol, e.g. formatMoney(cents(-500), "USD") -> "-$5.00". */
export function formatMoney(value: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}
