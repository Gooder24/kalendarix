// Export to feature phones: one .vcs file a Nokia, Sony Ericsson, Motorola,
// Samsung or Siemens takes over a cable (see gammu/). Each family wants its own
// format, encoding and field lengths; a profile says which.

import { pad2 } from './dates';
import type { RRule, StoredEvent } from './types';

export interface PhoneProfile {
  id: string;
  name: string;
  examples: string;
  format: 'vCalendar 1.0' | 'iCalendar 2.0';
  /** How text values are written. */
  encoding: 'QUOTED-PRINTABLE' | 'UTF-8';
  /** The bytes the phone expects; Latin-1 phones get carons folded to plain letters. */
  charset: 'UTF-8' | 'ISO-8859-1';
  maxSummary: number;
  maxDescription: number;
  alarm: 'AALARM' | 'VALARM' | null;
  /** full keeps the RRULE, simple only the four plain frequencies, false none. */
  recurring: 'full' | 'simple' | false;
  location: boolean;
  /** Write the calendar as a real CATEGORIES property. */
  categories: boolean;
  /** Tag times with a zone and ship its definition, instead of floating local times. */
  timezone: boolean;
  uid: boolean;
  /** Put "[CAL] " in front of the title: the only place a small phone shows the calendar. */
  prefix: boolean;
  /** Script in gammu/ that pushes the file to the phone. */
  script: string;
}

const base = {
  format: 'vCalendar 1.0', encoding: 'QUOTED-PRINTABLE', charset: 'UTF-8', alarm: 'AALARM', recurring: 'simple',
  location: true, categories: false, timezone: false, uid: false, prefix: true, script: 'generic',
} as const;

export const PHONE_PROFILES: readonly PhoneProfile[] = [
  { ...base, id: 'nokia-s40', name: 'Nokia Series 40', examples: '3310, 6300, C2-01, 6700, Asha', maxSummary: 40, maxDescription: 255, script: 'nokia-s40' },
  {
    ...base, id: 'nokia-s60', name: 'Nokia S60 (Symbian)', examples: 'N95, E71, 6600, N70', format: 'iCalendar 2.0', encoding: 'UTF-8',
    maxSummary: 100, maxDescription: 1000, alarm: 'VALARM', recurring: 'full', categories: true, timezone: true, uid: true, prefix: false, script: 'nokia-s60',
  },
  { ...base, id: 'sonyericsson', name: 'Sony Ericsson', examples: 'W800, K750, W810, K800', maxSummary: 35, maxDescription: 200, script: 'sonyericsson' },
  { ...base, id: 'motorola-razr', name: 'Motorola RAZR / ROKR', examples: 'V3, V3i, L7, ROKR E1', charset: 'ISO-8859-1', maxSummary: 32, maxDescription: 128, location: false },
  { ...base, id: 'samsung-bada', name: 'Samsung Feature', examples: 'E250, D900, Corby', maxSummary: 50, maxDescription: 300 },
  { ...base, id: 'siemens', name: 'Siemens / BenQ-Siemens', examples: 'A65, C65, SL75', charset: 'ISO-8859-1', maxSummary: 30, maxDescription: 100, recurring: false, location: false },
  { ...base, id: 'generic-vcal', name: 'Generic vCalendar', examples: 'Any other feature phone', maxSummary: 32, maxDescription: 128, alarm: null, recurring: false, location: false },
];

export function phoneProfile(id: string): PhoneProfile {
  return PHONE_PROFILES.find((p) => p.id === id) ?? PHONE_PROFILES[PHONE_PROFILES.length - 1];
}

export interface PhoneItem {
  event: StoredEvent;
  calendarName: string;
}

/** Local time with no zone: the phone shows what the clock said here. */
function floating(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function utc(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

/** Up to three capitals from the calendar's name. */
export function calendarPrefix(name: string): string {
  return name.replace(/[^a-zA-ZÀ-ž]/g, '').toUpperCase().slice(0, 3) || 'XX';
}

function plain(text: string | undefined, max: number): string {
  const flat = String(text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) : flat;
}

// Letters outside Latin-1 that these phones cannot draw, folded to the nearest one they can.
const FOLD: Record<string, string> = {
  č: 'c', Č: 'C', š: 's', Š: 'S', ž: 'z', Ž: 'Z', ť: 't', Ť: 'T', ľ: 'l', Ľ: 'L', ň: 'n', Ň: 'N',
  ď: 'd', Ď: 'D', ŕ: 'r', Ŕ: 'R', ĺ: 'l', Ĺ: 'L', ě: 'e', Ě: 'E', ř: 'r', Ř: 'R', ů: 'u', Ů: 'U',
  ő: 'o', Ő: 'O', ű: 'u', Ű: 'U', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', '€': 'EUR', '–': '-', '—': '-',
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
};

function bytes(text: string, charset: PhoneProfile['charset']): number[] {
  if (charset === 'UTF-8') return [...new TextEncoder().encode(text)];
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) out.push(code);
    else for (const c of FOLD[ch] ?? '?') out.push(c.charCodeAt(0));
  }
  return out;
}

/** NAME;ENCODING=QUOTED-PRINTABLE;CHARSET=…:value, soft-wrapped at 75 without splitting an =HH. */
function quotedPrintable(name: string, value: string, charset: PhoneProfile['charset']): string {
  const units = bytes(value, charset).map((b) =>
    b === 0x3d || b < 0x20 || b > 0x7e ? '=' + b.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(b),
  );
  let out = '';
  let line = `${name};ENCODING=QUOTED-PRINTABLE;CHARSET=${charset}:`;
  for (const unit of units) {
    if (line.length + unit.length > 75) {
      out += line + '=\r\n';
      line = '';
    }
    line += unit;
  }
  return out + line;
}

function escapeIcal(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function foldIcal(line: string): string {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) parts.push(' ' + line.slice(i, i + 73));
  return parts.join('\r\n');
}

function textLine(name: string, value: string, profile: PhoneProfile): string {
  if (profile.encoding === 'QUOTED-PRINTABLE') return quotedPrintable(name, value, profile.charset);
  return foldIcal(`${name}:${escapeIcal(value)}`);
}

/** vCalendar 1.0 shorthand: D1, W2, MD1, YM1, then how long. */
function rruleVcal(rule: RRule): string | null {
  const token = { DAILY: 'D', WEEKLY: 'W', MONTHLY: 'MD', YEARLY: 'YM' }[rule.FREQ];
  if (!token) return null;
  const head = token + (rule.INTERVAL && rule.INTERVAL > 0 ? rule.INTERVAL : 1);
  if (rule.COUNT) return `${head} #${rule.COUNT}`;
  const until = /^(\d{8})/.exec(String(rule.UNTIL ?? ''));
  return until ? `${head} ${until[1]}T000000` : `${head} #0`;
}

function rruleIcal(rule: RRule): string {
  let out = `FREQ=${rule.FREQ}`;
  if (rule.INTERVAL && rule.INTERVAL > 1) out += `;INTERVAL=${rule.INTERVAL}`;
  if (rule.COUNT) out += `;COUNT=${rule.COUNT}`;
  else if (rule.UNTIL) out += `;UNTIL=${rule.UNTIL}`;
  return out;
}

const ZONE = 'Europe/Bratislava';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${ZONE}`,
  'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'TZNAME:CEST', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'TZNAME:CET', 'END:STANDARD',
  'END:VTIMEZONE',
];

export function generatePhoneFile(
  items: PhoneItem[],
  profile: PhoneProfile,
  options: { defaultAlarm: number | ''; now?: Date } = { defaultAlarm: 120 },
): string {
  const ical = profile.format === 'iCalendar 2.0';
  const zoned = ical && profile.timezone;
  const lines = ['BEGIN:VCALENDAR', `VERSION:${ical ? '2.0' : '1.0'}`, 'PRODID:-//esyst//Kalendarix//EN'];
  if (ical) lines.push('CALSCALE:GREGORIAN', 'METHOD:PUBLISH');
  if (zoned) lines.push(...VTIMEZONE);

  for (const { event, calendarName } of items) {
    const start = new Date(event.start);
    const end = new Date(event.end || event.start);
    if (Number.isNaN(start.getTime())) continue;
    const title = plain(event.title, 999);
    const summary = (profile.prefix ? `[${calendarPrefix(calendarName)}] ${title}` : title).slice(0, profile.maxSummary);

    lines.push('BEGIN:VEVENT');
    if (ical) lines.push(`DTSTAMP:${utc(options.now ?? new Date())}`);
    if (profile.uid) lines.push(`UID:${event.uid}`);
    lines.push(textLine('SUMMARY', summary, profile));
    const notes = event.notes || event.description;
    if (notes) lines.push(textLine('DESCRIPTION', plain(notes, profile.maxDescription), profile));
    if (profile.location && event.location) lines.push(textLine('LOCATION', plain(event.location, profile.maxDescription), profile));
    if (profile.categories && calendarName) lines.push(textLine('CATEGORIES', plain(calendarName, 100), profile));

    const tz = zoned ? `;TZID=${ZONE}` : '';
    lines.push(`DTSTART${tz}:${floating(start)}`, `DTEND${tz}:${floating(end)}`);

    if (profile.recurring && event.rrule?.FREQ) {
      const rule = ical ? rruleIcal(event.rrule) : rruleVcal(event.rrule);
      if (rule) lines.push(`RRULE:${rule}`);
    }

    const alarm = typeof event.alarmMinutes === 'number' ? event.alarmMinutes : options.defaultAlarm;
    if (profile.alarm && typeof alarm === 'number') {
      if (profile.alarm === 'VALARM') {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', textLine('DESCRIPTION', summary || 'Reminder', profile), `TRIGGER:-PT${Math.max(0, alarm)}M`, 'END:VALARM');
      } else {
        lines.push(`AALARM:${floating(new Date(start.getTime() - alarm * 60_000))}`);
      }
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
