// Formatting helpers shared by every screen.

export function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function lkr(n: number | null | undefined): string {
  return `Rs. ${money(n)}`;
}

// The API stores timestamps as epoch seconds or ms depending on the row's age; normalise.
export function toDate(v: number | string | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
}

export function timeOf(v: number | string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dateOf(v: number | string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function dateTimeOf(v: number | string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${dateOf(d)} · ${timeOf(d)}`;
}

// "12m" / "1h 20m" — how long a table has been sitting, or a shift running.
export function elapsed(from: number | string | Date | null | undefined, to?: Date): string {
  const start = toDate(from);
  if (!start) return "—";
  const end = to ?? new Date();
  const mins = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
