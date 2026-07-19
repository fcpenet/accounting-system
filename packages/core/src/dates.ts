/**
 * Calendar-date validation.
 *
 * `Date.parse` is not a validator: it rolls impossible dates over silently,
 * so "2026-02-30" parses happily as 2 March. An entry dated 30 February
 * would land in the wrong month, and a month-end report would quietly cover
 * the wrong period. Round-tripping through UTC is what actually catches it.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  // If any component survives the round trip unchanged, the date is real.
  // Feb 30 comes back as Mar 2, so the day no longer matches.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
