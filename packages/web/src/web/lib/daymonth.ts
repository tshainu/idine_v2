/**
 * Day-and-month helpers for customer occasion dates (birthdays, anniversaries).
 *
 * Occasion dates are stored as "MM-DD" — the year is deliberately not collected,
 * because wishes only ever need the day and the month. Legacy rows that were
 * saved as "YYYY-MM-DD" are still read correctly.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a month, ignoring the year — February always allows 29. */
export function daysInMonth(mm: string): number {
  const m = Number(mm);
  if (!m) return 31;
  if (m === 2) return 29;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** "MM-DD" from either "MM-DD" or legacy "YYYY-MM-DD"; "" when unset. */
export function monthDayOf(v?: string | null): string {
  if (!v) return "";
  const s = String(v).trim();
  const full = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (full) return `${full[2]}-${full[3]}`;
  const short = s.match(/^(\d{2})-(\d{2})$/);
  return short ? `${short[1]}-${short[2]}` : "";
}

/** Human label for a stored day-month, e.g. "4 September"; "" when unset. */
export function fmtDayMonth(v?: string | null): string {
  const md = monthDayOf(v);
  if (!md) return "";
  const [mm, dd] = md.split("-");
  return `${Number(dd)} ${MONTHS[Number(mm) - 1] ?? ""}`.trim();
}
