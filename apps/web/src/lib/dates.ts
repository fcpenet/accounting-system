/**
 * ISO date strings (YYYY-MM-DD) everywhere, never Date objects.
 *
 * Accounting dates are calendar dates, not instants: an entry dated
 * 2026-01-31 is on the 31st regardless of the reader's timezone. Storing a
 * timestamp would let a UTC-shift move an entry into the previous period and
 * quietly change a closed month's numbers.
 */

export function todayISO(timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return formatter.format(new Date()); // en-CA yields YYYY-MM-DD
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function yearStart(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** "2026-07-19" -> "19 Jul 2026" */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "2026-07" -> "July 2026" */
export function formatMonth(iso: string): string {
  const date = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
