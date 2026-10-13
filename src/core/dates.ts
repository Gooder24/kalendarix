// Local-time date helpers. A "day number" is an integer that grows by one per
// calendar day in the local zone, so spans and grids can be computed without
// tripping over the 23- and 25-hour days around a clock change.

export const MS_MINUTE = 60_000;
export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function startOfDay(d: Date | number): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date | number, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Same day of the month n months on; clamped to the month's last day. */
export function addMonths(d: Date | number, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, daysInMonth(r.getFullYear(), r.getMonth())));
  return r;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function startOfMonth(d: Date | number): Date {
  const r = new Date(d);
  return new Date(r.getFullYear(), r.getMonth(), 1);
}

/** Monday of the week d falls in. */
export function startOfWeek(d: Date | number): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

export function sameDay(a: Date | number, b: Date | number): boolean {
  return dayNumber(a) === dayNumber(b);
}

export function dayNumber(d: Date | number): number {
  const r = new Date(d);
  return Math.round(Date.UTC(r.getFullYear(), r.getMonth(), r.getDate()) / MS_DAY);
}

/** Local midnight of a day number. */
export function fromDayNumber(n: number): Date {
  const u = new Date(n * MS_DAY);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

/** ISO week number (weeks start on Monday, week 1 holds the first Thursday). */
export function weekNumber(d: Date | number): number {
  const r = startOfDay(d);
  r.setDate(r.getDate() + 3 - ((r.getDay() + 6) % 7));
  const firstThursday = new Date(r.getFullYear(), 0, 4);
  return 1 + Math.round((dayNumber(r) - dayNumber(firstThursday) - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

export function ymd(d: Date | number): string {
  const r = new Date(d);
  return `${r.getFullYear()}-${pad2(r.getMonth() + 1)}-${pad2(r.getDate())}`;
}

export function parseYmd(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const r = new Date(+m[1], +m[2] - 1, +m[3]);
  return r.getMonth() === +m[2] - 1 ? r : null;
}

export function hm(d: Date | number): string {
  const r = new Date(d);
  return `${pad2(r.getHours())}:${pad2(r.getMinutes())}`;
}

/** Minutes since local midnight. */
export function minuteOfDay(d: Date | number): number {
  const r = new Date(d);
  return r.getHours() * 60 + r.getMinutes();
}

/** The given day at a number of minutes past midnight. */
export function atMinute(day: Date | number, minutes: number): Date {
  const r = startOfDay(day);
  r.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return r;
}

/** What somebody typed as a time: "8", "830", "8:30", "08.30", "8,30". */
export function parseTime(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,2})(?:[:.,h ]?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** What somebody typed as a date: "23.10.2026", "23.10.", "23. 10. 26", "2026-10-23". */
export function parseDate(text: string, fallbackYear: number): Date | null {
  const t = text.trim();
  const iso = parseYmd(t);
  if (iso) return iso;
  const m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*(?:[./-]\s*(\d{2}|\d{4})?)?$/.exec(t);
  if (!m) return null;
  const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear;
  const r = new Date(year, +m[2] - 1, +m[1]);
  return r.getMonth() === +m[2] - 1 && r.getDate() === +m[1] ? r : null;
}

/** The next half hour: where a new event starts by default. */
export function roundedNow(now: number = Date.now()): Date {
  const r = new Date(now);
  r.setMinutes(r.getMinutes() < 30 ? 30 : 60, 0, 0);
  return r;
}
