// When an event happens: once, or again and again by its RRULE.
//
// A calendar in the desktop's panel may expand the same rules from the same
// file, so the common cases are the plain reading of iCalendar: a rule
// repeats at the wall-clock time of its start, UNTIL is inclusive, COUNT counts
// skipped dates too, and EXDATE skips whole days.

import { MS_DAY, addDays, dayNumber, daysInMonth, startOfDay, startOfWeek } from './dates';
import type { RRule, StoredEvent } from './types';

export interface Occurrence {
  start: number;
  /** Exclusive; equal to start for an event without a length. */
  end: number;
}

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
/** No rule in a personal calendar comes near this; it only stops a broken one. */
const MAX_STEPS = 20_000;

/** How many days a whole-day event from `start` to `end` covers; the end itself does not count. */
export function allDayLength(start: number, end: number): number {
  return Math.max(1, dayNumber(end > start ? end - 1 : start) - dayNumber(start) + 1);
}

/** UNTIL as iCalendar writes it; a bare date means the whole of that day. */
export function parseUntil(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(value));
  if (!m) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (m[4] === undefined) return new Date(y, mo, d, 23, 59, 59, 999).getTime();
  const parts: [number, number, number, number, number, number] = [y, mo, d, +m[4], +m[5], +m[6]];
  return m[7] ? Date.UTC(...parts) : new Date(...parts).getTime();
}

/** Occurrences of an event that overlap [from, to), in order. */
export function occurrences(event: StoredEvent, from: number, to: number): Occurrence[] {
  const first = Date.parse(event.start);
  if (Number.isNaN(first)) return [];
  const lastRaw = Date.parse(event.end);
  const length = Number.isNaN(lastRaw) ? 0 : Math.max(0, lastRaw - first);

  // A whole-day event covers days, whatever hours are written in the file: older
  // files hold "all day, 09:00 to 10:00" as often as midnight to midnight, and the
  // day the clocks change is 23 or 25 hours long. It ends at the midnight after
  // the last day it touches.
  const days = event.allDay ? allDayLength(first, first + length) : 0;
  const endOf = (start: Date): number => (days ? addDays(startOfDay(start), days).getTime() : start.getTime() + length);
  const overlaps = (s: number, e: number): boolean => (e > s ? s < to && e > from : s >= from && s < to);

  const rule = event.rrule;
  if (!rule || !rule.FREQ) {
    const end = endOf(new Date(first));
    return overlaps(first, end) ? [{ start: first, end }] : [];
  }

  const out: Occurrence[] = [];
  const start = new Date(first);
  const until = rule.UNTIL ? parseUntil(rule.UNTIL) : null;
  const count = rule.COUNT && rule.COUNT > 0 ? rule.COUNT : Infinity;
  const skipped = new Set((event.exdates ?? []).map((d) => dayNumber(Date.parse(d))));
  let produced = 0;

  /** False once the rule is over or has run past the window. */
  const emit = (candidate: Date): boolean => {
    const s = candidate.getTime();
    if (produced >= count || (until !== null && s > until) || s >= to) return false;
    produced++;
    if (!skipped.has(dayNumber(s))) {
      const e = endOf(candidate);
      if (overlaps(s, e)) out.push({ start: s, end: e });
    }
    return true;
  };

  let step = 0;
  for (const period of periods(rule, start, firstUsefulPeriod(rule, first, endOf(start) - first, from))) {
    if (++step > MAX_STEPS) break;
    let alive = true;
    for (const candidate of candidatesIn(rule, start, period)) {
      if (candidate.getTime() < first) continue;
      if (!emit(candidate)) {
        alive = false;
        break;
      }
    }
    if (!alive) break;
  }
  return out;
}

const intervalOf = (rule: RRule): number => (rule.INTERVAL && rule.INTERVAL > 0 ? Math.floor(rule.INTERVAL) : 1);

/**
 * How many periods can be skipped because they end before the window. A rule
 * with COUNT has to be counted from its start, so it skips none.
 */
function firstUsefulPeriod(rule: RRule, first: number, length: number, from: number): number {
  const gap = from - length - first;
  if (rule.COUNT || gap <= 0) return 0;
  // The longest a period can be, so the estimate never lands past the window.
  const longest = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[rule.FREQ] * MS_DAY * intervalOf(rule);
  return Math.max(0, Math.floor(gap / longest) - 2);
}

/** The start of every period the rule visits: the start itself, then one INTERVAL on. */
function* periods(rule: RRule, start: Date, firstIndex: number): Generator<Date> {
  const interval = intervalOf(rule);
  const wall = [start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()] as const;
  for (let n = firstIndex; ; n++) {
    const y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    switch (rule.FREQ) {
      case 'DAILY':
        yield new Date(y, m, d + n * interval, ...wall);
        break;
      case 'WEEKLY':
        yield new Date(y, m, d + n * interval * 7, ...wall);
        break;
      // Months and years are visited by their first day: the 31st does not exist
      // in every month, and candidatesIn() decides which days of the month count.
      case 'MONTHLY':
        yield new Date(y, m + n * interval, 1, ...wall);
        break;
      case 'YEARLY':
        yield new Date(y + n * interval, m, 1, ...wall);
        break;
      default:
        return;
    }
  }
}

/** A rule part as numbers: a list, one value, or the comma-separated text older files keep unknown parts as. */
function numbers(value: unknown): number[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value == null ? [] : [value];
  return list.map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isFinite(n));
}

/** BYDAY as upper-case tokens ("MO", "2TU", "-1FR"). */
function weekdayTokens(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
}

const weekdayOf = (token: string): number => WEEKDAYS.indexOf(token.slice(-2));

/** The days inside one period on which the rule fires, at the start's time of day. */
function candidatesIn(rule: RRule, start: Date, period: Date): Date[] {
  const at = (y: number, m: number, d: number): Date =>
    new Date(y, m, d, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  const y = period.getFullYear();
  const m = period.getMonth();
  const byDay = weekdayTokens(rule.BYDAY);

  switch (rule.FREQ) {
    case 'DAILY': {
      // On a daily rule BYDAY narrows it: "every working day".
      const allowed = byDay.map(weekdayOf).filter((i) => i >= 0);
      return !allowed.length || allowed.includes((period.getDay() + 6) % 7) ? [period] : [];
    }
    case 'WEEKLY': {
      if (!byDay.length) return [period];
      const monday = startOfWeek(period);
      return [...new Set(byDay.map(weekdayOf).filter((i) => i >= 0))]
        .sort((a, b) => a - b)
        .map((i) => at(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    }
    case 'MONTHLY':
      return nth(rule, daysOfMonth(rule, start, y, m, byDay).map((d) => at(y, m, d)));
    case 'YEARLY': {
      const months = numbers(rule.BYMONTH).map((n) => n - 1).filter((n) => n >= 0 && n < 12);
      const inMonths = (months.length ? [...new Set(months)].sort((a, b) => a - b) : [start.getMonth()]).flatMap((month) =>
        daysOfMonth(rule, start, y, month, byDay).map((d) => at(y, month, d)),
      );
      return nth(rule, inMonths);
    }
    default:
      return [period];
  }
}

/**
 * The days of one month a rule names: by weekday ("2TU", every "FR"), by day of
 * the month (negative from its end), or the day the event started on. A day the
 * month does not have (the 31st, 29 February) is simply not there.
 */
function daysOfMonth(rule: RRule, start: Date, year: number, month: number, byDay: string[]): number[] {
  const size = daysInMonth(year, month);
  const monthDays = numbers(rule.BYMONTHDAY).map((n) => (n < 0 ? size + 1 + n : n));
  let dates: number[];
  if (byDay.length) {
    dates = byDay.flatMap((token) => weekdaysOfMonth(year, month, token));
    // Both at once is an intersection: "Friday the 13th".
    if (monthDays.length) dates = dates.filter((d) => monthDays.includes(d));
  } else {
    dates = monthDays.length ? monthDays : [start.getDate()];
  }
  return [...new Set(dates)].filter((d) => d >= 1 && d <= size).sort((a, b) => a - b);
}

/** BYSETPOS keeps the n-th of a period's days: "the second Tuesday", "the last working day". */
function nth(rule: RRule, days: Date[]): Date[] {
  const positions = numbers(rule.BYSETPOS);
  if (!positions.length) return days;
  const picked = positions.map((p) => (p > 0 ? days[p - 1] : days[days.length + p])).filter((d): d is Date => d !== undefined);
  return [...new Set(picked)].sort((a, b) => a.getTime() - b.getTime());
}

/** Days of a month a BYDAY token names: "TU" every Tuesday, "2TU" the second, "-1FR" the last Friday. */
function weekdaysOfMonth(year: number, month: number, token: string): number[] {
  const m = /^(-?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token);
  if (!m) return [];
  const weekday = WEEKDAYS.indexOf(m[2]);
  const all: number[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    if ((new Date(year, month, d).getDay() + 6) % 7 === weekday) all.push(d);
  }
  if (!m[1]) return all;
  const ordinal = +m[1];
  const picked = ordinal > 0 ? all[ordinal - 1] : all[all.length + ordinal];
  return picked === undefined ? [] : [picked];
}

/** A rule in a sentence-sized form: which of the simple choices it is, if any. */
export function simpleRepeat(rule: RRule | null): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' {
  if (!rule || !rule.FREQ) return 'none';
  const plain =
    (rule.INTERVAL ?? 1) === 1 && !rule.COUNT && !rule.UNTIL && !rule.BYDAY && !rule.BYMONTHDAY && !rule.BYSETPOS && !rule.BYMONTH;
  if (!plain) return 'custom';
  return ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as const)[rule.FREQ] ?? 'custom';
}

/**
 * A rule after its event was moved from one day to another. A weekly rule's
 * weekdays move along ("Monday and Wednesday", moved a day on, is "Tuesday and
 * Thursday"). A monthly or yearly rule that named its day ("the second Tuesday",
 * "the 15th") described where the event used to be; it now simply follows the
 * new start.
 */
export function shiftRule(rule: RRule | null, from: number, to: number): RRule | null {
  const days = dayNumber(to) - dayNumber(from);
  if (!rule || !days) return rule;
  const next: RRule = { ...rule };
  if (rule.FREQ === 'WEEKLY') {
    const moved = weekdayTokens(rule.BYDAY)
      .map(weekdayOf)
      .filter((i) => i >= 0)
      .map((i) => (((i + days) % 7) + 7) % 7);
    if (moved.length) next.BYDAY = [...new Set(moved)].sort((a, b) => a - b).map((i) => WEEKDAYS[i]);
  } else if (rule.FREQ === 'MONTHLY' || rule.FREQ === 'YEARLY') {
    delete next.BYDAY;
    delete next.BYMONTHDAY;
    delete next.BYSETPOS;
    delete next.BYMONTH;
  }
  return next;
}
