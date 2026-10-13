// iCalendar (RFC 5545) in and out: importing .ics files and subscribed feeds,
// exporting calendars for other programs.

import { uid } from './document';
import { MS_HOUR, addDays, pad2, startOfDay } from './dates';
import { allDayLength } from './recurrence';
import type { RRule, StoredEvent } from './types';

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

interface Line {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Lines of the file with folded continuations (leading space or tab) joined back. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function parseLine(line: string): Line | null {
  // The value starts at the first colon outside a quoted parameter.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const [name, ...rest] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * A wall-clock time in a named zone as an instant. Without a way to ask "what
 * instant is 08:00 in Europe/Bratislava", guess the instant, see what the zone's
 * clock shows for it, and correct by the difference.
 */
function zoned(parts: number[], zone: string): number | null {
  try {
    const format = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    const wanted = Date.UTC(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
    let guess = wanted;
    for (let i = 0; i < 2; i++) {
      const shown: Record<string, number> = {};
      for (const p of format.formatToParts(guess)) if (p.type !== 'literal') shown[p.type] = +p.value;
      guess += wanted - Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    }
    return guess;
  } catch {
    return null; // a zone this system does not know
  }
}

function parseDateValue(value: string, params: Record<string, string>): { at: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : { at: new Date(t), allDay: false };
  }
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (m[4] === undefined || params.VALUE === 'DATE') return { at: new Date(y, mo, d), allDay: true };
  const clock = [y, mo, d, +m[4], +m[5], +m[6]];
  if (m[7]) return { at: new Date(Date.UTC(y, mo, d, +m[4], +m[5], +m[6])), allDay: false };
  const inZone = params.TZID ? zoned(clock, params.TZID) : null;
  return { at: inZone !== null ? new Date(inZone) : new Date(y, mo, d, +m[4], +m[5], +m[6]), allDay: false };
}

export function parseRRule(value: string): RRule | null {
  const rule: Record<string, unknown> = {};
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    const v = part.slice(eq + 1);
    if (key === 'INTERVAL' || key === 'COUNT') rule[key] = parseInt(v, 10);
    else if (key === 'BYDAY') rule.BYDAY = v.split(',');
    else if (key === 'BYMONTHDAY' || key === 'BYSETPOS' || key === 'BYMONTH') rule[key] = v.split(',').map((x) => parseInt(x, 10));
    else rule[key] = v;
  }
  return typeof rule.FREQ === 'string' ? (rule as RRule) : null;
}

/** DURATION (P5D, PT2H, P1W, P1DT12H) as days and milliseconds; days are calendar days. */
function parseDuration(value: string): { days: number; ms: number } | null {
  const m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  return { days: +(m[1] ?? 0) * 7 + +(m[2] ?? 0), ms: (+(m[3] ?? 0) * 60 + +(m[4] ?? 0)) * 60_000 + +(m[5] ?? 0) * 1000 };
}

/** The first lines of a real calendar, and its last: not a web page, and not cut short. */
export function isCalendarText(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(text) && /END:VCALENDAR\s*$/i.test(text);
}

/** -PT15M, -P1D, -PT2H as minutes before the start. */
function parseTrigger(value: string): number | null {
  const m = /^-P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!m) return null;
  return (+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * 1440 + +(m[3] ?? 0) * 60 + +(m[4] ?? 0);
}

export interface ParsedCalendar {
  /** X-WR-CALNAME, when the file names itself. */
  name: string | null;
  events: StoredEvent[];
}

export function parseIcs(text: string): ParsedCalendar {
  const events: StoredEvent[] = [];
  let name: string | null = null;
  let current: (Partial<StoredEvent> & { startAt?: Date; endAt?: Date; exdateAt: Date[]; length?: { days: number; ms: number }; replaces?: Date }) | null = null;
  let inAlarm = false;
  /** Occurrences of a series that were changed on their own: [uid of the series, the occurrence they stand in for]. */
  const overrides: [string, Date][] = [];

  for (const raw of unfold(text)) {
    const line = parseLine(raw);
    if (!line) continue;
    const { name: prop, params, value } = line;

    if (prop === 'BEGIN' && value === 'VEVENT') {
      current = { exdateAt: [], alarmMinutes: '' };
      continue;
    }
    if (prop === 'END' && value === 'VEVENT') {
      if (current?.startAt) {
        const start = current.startAt;
        const end = current.endAt ?? endFrom(start, !!current.allDay, current.length);
        const notes = current.description ?? '';
        let id = current.uid || uid();
        if (current.replaces) {
          // A changed occurrence is an event of its own; the series skips the day it stands in for.
          overrides.push([id, current.replaces]);
          id = `${id}#${current.replaces.toISOString()}`;
        }
        events.push({
          uid: id,
          title: current.title ?? '',
          description: notes,
          notes,
          location: current.location ?? '',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: !!current.allDay,
          rrule: current.rrule ?? null,
          exdates: current.exdateAt.map((d) => d.toISOString()),
          alarmMinutes: current.alarmMinutes ?? '',
        });
      }
      current = null;
      continue;
    }
    if (prop === 'BEGIN' && value === 'VALARM') inAlarm = true;
    if (prop === 'END' && value === 'VALARM') inAlarm = false;
    if (!current) {
      if (prop === 'X-WR-CALNAME') name = unescapeText(value);
      continue;
    }
    if (inAlarm) {
      const minutes = prop === 'TRIGGER' ? parseTrigger(value) : null;
      if (minutes !== null) current.alarmMinutes = minutes;
      continue;
    }
    if (/base64|^b$/i.test(params.ENCODING ?? '')) continue;

    switch (prop) {
      case 'UID': current.uid = value; break;
      case 'SUMMARY': current.title = unescapeText(value); break;
      case 'DESCRIPTION': current.description = unescapeText(value); break;
      case 'LOCATION': current.location = unescapeText(value); break;
      case 'DTSTART': {
        const parsed = parseDateValue(value, params);
        if (parsed) {
          current.startAt = parsed.at;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case 'DTEND': {
        const parsed = parseDateValue(value, params);
        if (parsed) current.endAt = parsed.at;
        break;
      }
      case 'DURATION': current.length = parseDuration(value) ?? undefined; break;
      case 'RECURRENCE-ID': current.replaces = parseDateValue(value, params)?.at; break;
      case 'RRULE': current.rrule = parseRRule(value); break;
      case 'EXDATE':
        for (const v of value.split(',')) {
          const parsed = parseDateValue(v, params);
          if (parsed) current.exdateAt.push(parsed.at);
        }
        break;
      default: break;
    }
  }
  for (const [seriesUid, day] of overrides) {
    const series = events.find((e) => e.uid === seriesUid && e.rrule);
    if (series) series.exdates.push(day.toISOString());
  }
  return { name, events };
}

/** The end of an event that names none: its DURATION, else a day for a whole-day event and an hour otherwise. */
function endFrom(start: Date, allDay: boolean, length: { days: number; ms: number } | undefined): Date {
  const days = length ? length.days : allDay ? 1 : 0;
  const ms = length ? length.ms : allDay ? 0 : MS_HOUR;
  // Days are calendar days: the day the clocks change is not 24 hours long.
  return new Date(addDays(start, days).getTime() + ms);
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets, never inside a character. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let from = 0;
  while (from < bytes.length) {
    let to = Math.min(bytes.length, from + (chunks.length ? 74 : 75));
    while (to < bytes.length && (bytes[to] & 0xc0) === 0x80) to--;
    chunks.push(decoder.decode(bytes.subarray(from, to)));
    from = to;
  }
  return chunks.join('\r\n ');
}

function utc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Local time with no zone ("floating"): the reader takes it by its own clock. */
function floating(d: Date): string {
  return `${localDate(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function localDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export function rruleText(rule: RRule | null): string | null {
  if (!rule?.FREQ) return null;
  const parts = [`FREQ=${rule.FREQ}`];
  if (rule.INTERVAL && rule.INTERVAL > 1) parts.push(`INTERVAL=${rule.INTERVAL}`);
  if (rule.COUNT) parts.push(`COUNT=${rule.COUNT}`);
  if (rule.UNTIL) parts.push(`UNTIL=${rule.UNTIL}`);
  if (rule.BYDAY?.length) parts.push(`BYDAY=${rule.BYDAY.join(',')}`);
  if (rule.BYMONTHDAY?.length) parts.push(`BYMONTHDAY=${rule.BYMONTHDAY.join(',')}`);
  for (const key of ['BYMONTH', 'BYSETPOS'] as const) {
    const value = rule[key];
    if (Array.isArray(value) && value.length) parts.push(`${key}=${value.join(',')}`);
    else if (typeof value === 'string' || typeof value === 'number') parts.push(`${key}=${value}`);
  }
  return parts.join(';');
}

export function generateIcs(calendarName: string, events: StoredEvent[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//esyst//Kalendarix 2//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end || event.start);
    if (Number.isNaN(start.getTime())) continue;
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${utc(now)}`);
    if (event.allDay) {
      // By the days it covers: a file may hold a whole-day event with hours in it.
      const after = addDays(startOfDay(start), allDayLength(start.getTime(), end.getTime()));
      lines.push(`DTSTART;VALUE=DATE:${localDate(start)}`, `DTEND;VALUE=DATE:${localDate(after)}`);
    }
    // A single event is an instant. A repeating one repeats by the clock on the wall ("every Monday at
    // eight"), which a UTC time cannot say across a clock change; written without a zone, it can.
    else if (event.rrule?.FREQ) lines.push(`DTSTART:${floating(start)}`, `DTEND:${floating(end)}`);
    else lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`);
    if (event.title) lines.push(`SUMMARY:${escapeText(event.title)}`);
    const notes = event.notes || event.description;
    if (notes) lines.push(`DESCRIPTION:${escapeText(notes)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    const rule = rruleText(event.rrule);
    if (rule) lines.push(`RRULE:${rule}`);
    for (const ex of event.exdates ?? []) {
      const at = new Date(ex);
      if (Number.isNaN(at.getTime())) continue;
      lines.push(event.allDay ? `EXDATE;VALUE=DATE:${localDate(at)}` : `EXDATE:${floating(at)}`);
    }
    if (typeof event.alarmMinutes === 'number') {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(event.title || 'Kalendarix')}`,
        `TRIGGER:-PT${event.alarmMinutes}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
