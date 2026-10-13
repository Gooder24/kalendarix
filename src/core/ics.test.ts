import { describe, expect, it } from 'vitest';
import { hm, ymd } from './dates';
import { generateIcs, isCalendarText, parseIcs, parseRRule, rruleText } from './ics';
import { generatePhoneFile, calendarPrefix, phoneProfile, PHONE_PROFILES } from './phone';
import { occurrences } from './recurrence';
import { at, event } from '../test/fixtures';

const FEED = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Rozvrh hodín',
  'BEGIN:VEVENT', 'UID:2026-10-23-0@timetable', 'DTSTAMP:20261012T160000Z',
  'DTSTART:20261023T060000Z', 'DTEND:20261023T064500Z',
  'SUMMARY:Slovenský jazyk a literatúra', 'LOCATION:33',
  'DESCRIPTION:Učiteľ: Jana Nováková\\nSkupina: 1.C\\, 1.D',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:whole', 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261010', 'SUMMARY:kurz', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:zoned', 'DTSTART;TZID=America/New_York:20261101T090000', 'DTEND;TZID=America/New_York:20261101T100000',
  'SUMMARY:Call', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4', 'EXDATE;TZID=America/New_York:20261104T090000',
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:not the event text', 'TRIGGER:-PT15M', 'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:folded', 'DTSTART:20261024T100000', 'SUMMARY:Dlhý názov, ktorý sa', '  zalomil cez dva riadky', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:nodate', 'SUMMARY:ignored', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('reading iCalendar', () => {
  const parsed = parseIcs(FEED);
  const by = Object.fromEntries(parsed.events.map((e) => [e.uid, e]));

  it('takes the calendar name and every event that has a start', () => {
    expect(parsed.name).toBe('Rozvrh hodín');
    expect(parsed.events.map((e) => e.uid)).toEqual(['2026-10-23-0@timetable', 'whole', 'zoned', 'folded']);
  });

  it('reads UTC times, text escapes and both names of the notes', () => {
    const e = by['2026-10-23-0@timetable'];
    expect([ymd(Date.parse(e.start)), hm(Date.parse(e.start)), hm(Date.parse(e.end))]).toEqual(['2026-10-23', '08:00', '08:45']);
    expect(e.notes).toBe('Učiteľ: Jana Nováková\nSkupina: 1.C, 1.D');
    expect(e.description).toBe(e.notes);
    expect(e.location).toBe('33');
    expect(e.alarmMinutes).toBe('');
  });

  it('reads whole days as local midnights, end exclusive', () => {
    expect(by.whole).toMatchObject({ allDay: true, start: at(2026, 10, 5), end: at(2026, 10, 10) });
  });

  it('places a time written in another zone', () => {
    // 09:00 in New York on 1 November 2026 (already on winter time) is 15:00 in Bratislava.
    expect(by.zoned.start).toBe('2026-11-01T14:00:00.000Z');
    expect(by.zoned.rrule).toEqual({ FREQ: 'WEEKLY', INTERVAL: 2, BYDAY: ['MO', 'WE'], COUNT: 4 });
    expect(by.zoned.exdates).toEqual(['2026-11-04T14:00:00.000Z']);
    expect(by.zoned.alarmMinutes).toBe(15);
    expect(by.zoned.notes).toBe('');
  });

  it('joins folded lines and gives an event without an end an hour', () => {
    expect(by.folded.title).toBe('Dlhý názov, ktorý sa zalomil cez dva riadky');
    expect(Date.parse(by.folded.end) - Date.parse(by.folded.start)).toBe(3600000);
  });

  it('survives rubbish', () => {
    expect(parseIcs('').events).toEqual([]);
    expect(parseIcs('BEGIN:VEVENT\nDTSTART:whenever\nEND:VEVENT').events).toEqual([]);
    expect(parseRRule('INTERVAL=2')).toBeNull();
  });
});

describe('reading what other programs export', () => {
  const wrap = (...lines: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

  it('keeps a changed occurrence apart from its series', () => {
    // A weekly stand-up whose 12 October meeting was moved to the 13th, as Google exports it.
    const parsed = parseIcs(wrap(
      'BEGIN:VEVENT', 'UID:standup', 'DTSTART:20261005T080000Z', 'DTEND:20261005T083000Z', 'SUMMARY:Standup', 'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:standup', 'RECURRENCE-ID:20261012T080000Z', 'DTSTART:20261013T090000Z', 'DTEND:20261013T093000Z', 'SUMMARY:Standup (moved)', 'END:VEVENT',
    )).events;
    expect(new Set(parsed.map((e) => e.uid)).size).toBe(2);
    const [series, single] = parsed;
    const range = [new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime()] as const;
    expect(occurrences(series, ...range).map((o) => new Date(o.start).getDate())).toEqual([5, 19]);
    expect(occurrences(single, ...range).map((o) => new Date(o.start).getDate())).toEqual([13]);
    expect(single.rrule).toBeNull();
  });

  it('gives a whole day without an end one day, also when the clocks change', () => {
    const [e] = parseIcs(wrap('BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20260329', 'SUMMARY:Narodeniny', 'END:VEVENT')).events;
    expect(e).toMatchObject({ allDay: true, start: at(2026, 3, 29), end: at(2026, 3, 30) });
  });

  it('reads a length given as DURATION', () => {
    const parsed = parseIcs(wrap(
      'BEGIN:VEVENT', 'UID:camp', 'DTSTART;VALUE=DATE:20260706', 'DURATION:P5D', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:talk', 'DTSTART:20260706T080000Z', 'DURATION:PT2H30M', 'END:VEVENT',
    )).events;
    expect(parsed[0]).toMatchObject({ start: at(2026, 7, 6), end: at(2026, 7, 11) });
    expect(Date.parse(parsed[1].end) - Date.parse(parsed[1].start)).toBe(2.5 * 3600000);
  });

  it('reads the parts of a rule it can expand as numbers', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2')).toEqual({ FREQ: 'MONTHLY', BYDAY: ['TU'], BYSETPOS: [2] });
    expect(parseRRule('FREQ=YEARLY;BYMONTH=3,10;BYDAY=-1SU')).toEqual({ FREQ: 'YEARLY', BYMONTH: [3, 10], BYDAY: ['-1SU'] });
  });

  it('tells a calendar from a web page and from a download cut short', () => {
    expect(isCalendarText(wrap())).toBe(true);
    expect(isCalendarText('\uFEFF\n' + wrap() + '\r\n')).toBe(true);
    expect(isCalendarText('<!doctype html><title>Sign in</title>')).toBe(false);
    expect(isCalendarText('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x')).toBe(false);
    expect(isCalendarText('')).toBe(false);
  });
});

describe('writing iCalendar', () => {
  const events = [
    event({ uid: 'a@x', title: 'Písomka; fyzika, 2. ročník', notes: 'riadok 1\nriadok 2', location: 'B12', start: at(2026, 10, 23, 8), end: at(2026, 10, 23, 8, 45), alarmMinutes: 30 }),
    event({ uid: 'b@x', title: 'kurz', start: at(2026, 10, 5), end: at(2026, 10, 10), allDay: true }),
    event({ uid: 'c@x', title: 'Tréning', start: at(2026, 9, 1, 17), end: at(2026, 9, 1, 18), rrule: { FREQ: 'WEEKLY', INTERVAL: 2, BYDAY: ['TU', 'TH'], UNTIL: '20261231T225959Z' }, exdates: [at(2026, 9, 15, 17)] }),
  ];
  const text = generateIcs('Škola, 1.C', events, new Date(Date.UTC(2026, 9, 12, 16)));

  it('comes back as the same events', () => {
    const back = parseIcs(text);
    expect(back.name).toBe('Škola, 1.C');
    expect(back.events).toEqual(events.map((e) => ({ ...e, description: e.notes })));
  });

  it('describes the same occurrences after a round trip', () => {
    const range = [new Date(2026, 8, 1).getTime(), new Date(2026, 9, 1).getTime()] as const;
    expect(occurrences(parseIcs(text).events[2], ...range)).toEqual(occurrences(events[2], ...range));
  });

  it('writes a repeating event by the clock on the wall, a single one as an instant', () => {
    // "Every Monday at eight" is eight in summer and in winter; an instant in UTC would drift an hour elsewhere.
    expect(text).toContain('DTSTART:20260901T170000\r\n');
    expect(text).toContain('EXDATE:20260915T170000\r\n');
    expect(text).toContain('DTSTART:20261023T060000Z');
    expect(rruleText({ FREQ: 'MONTHLY', BYDAY: ['TU'], BYSETPOS: [2] })).toBe('FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2');
  });

  it('writes a whole-day event by its days even when the file holds hours', () => {
    const odd = generateIcs('x', [event({ uid: 'odd', start: at(2026, 7, 24, 9), end: at(2026, 7, 26, 10), allDay: true })]);
    expect(odd).toContain('DTSTART;VALUE=DATE:20260724');
    expect(odd).toContain('DTEND;VALUE=DATE:20260727');
    expect(parseIcs(odd).events[0]).toMatchObject({ allDay: true, start: at(2026, 7, 24), end: at(2026, 7, 27) });
  });

  it('uses CRLF, escapes text and folds long lines on character boundaries', () => {
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain(String.raw`SUMMARY:Písomka\; fyzika\, 2. ročník`);
    expect(text).toContain('DTSTART;VALUE=DATE:20261005');
    expect(text).toContain('TRIGGER:-PT30M');
    const long = generateIcs('x', [event({ uid: 'l', title: 'ž'.repeat(120), start: at(2026, 1, 1, 8), end: at(2026, 1, 1, 9) })]);
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parseIcs(long).events[0].title).toBe('ž'.repeat(120));
    expect(rruleText({ FREQ: 'DAILY', INTERVAL: 1 })).toBe('FREQ=DAILY');
  });
});

const unwrapped = (text: string): string => text.replace(/=\r\n/g, '');

describe('export to a phone', () => {
  const items = [{ calendarName: 'Školské akcie', event: event({ uid: 'u1', title: 'Účelové cvičenie – žiaci', notes: 'Zraz o 7:45', location: 'Štadión', start: at(2026, 10, 23, 8), end: at(2026, 10, 23, 12), rrule: { FREQ: 'WEEKLY', INTERVAL: 2, COUNT: 3 } }) }];
  const fixed = { defaultAlarm: 120 as const, now: new Date(Date.UTC(2026, 9, 12, 16)) };

  it('writes vCalendar 1.0 for a Nokia Series 40: quoted-printable, local times, shorthand rule', () => {
    const text = generatePhoneFile(items, phoneProfile('nokia-s40'), fixed);
    const lines = text.split('\r\n');
    expect(lines.slice(0, 4)).toEqual(['BEGIN:VCALENDAR', 'VERSION:1.0', 'PRODID:-//esyst//Kalendarix//EN', 'BEGIN:VEVENT']);
    // Soft line breaks ("=" at the end of a line) are part of the encoding, not of the text.
    expect(unwrapped(text)).toContain('SUMMARY;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:[=C5=A0KO] =C3=9A=C4=8Delov=C3=A9 cvi=C4=8Denie =E2=80=93 =C5=BEiaci');
    expect(text).toMatch(/=\r\n=[0-9A-F]{2}|=\r\n[^=]/); // it did wrap, and not inside an =HH
    expect(text).toContain('DTSTART:20261023T080000');
    expect(text).toContain('DTEND:20261023T120000');
    expect(text).toContain('RRULE:W2 #3');
    expect(text).toContain('AALARM:20261023T060000');
    expect(text).not.toContain('UID:');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('writes iCalendar 2.0 with a time zone for Symbian', () => {
    const text = generatePhoneFile(items, phoneProfile('nokia-s60'), fixed);
    expect(text).toContain('VERSION:2.0');
    expect(text).toContain('BEGIN:VTIMEZONE');
    expect(text).toContain('UID:u1');
    expect(text).toContain('SUMMARY:Účelové cvičenie – žiaci');
    expect(text).toContain('DTSTART;TZID=Europe/Bratislava:20261023T080000');
    expect(text).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3');
    expect(text).toContain('TRIGGER:-PT120M');
    expect(text).toContain('CATEGORIES:Školské akcie');
  });

  it('folds letters a Latin-1 phone cannot draw and drops what it cannot hold', () => {
    const text = generatePhoneFile(items, phoneProfile('siemens'), fixed);
    expect(unwrapped(text)).toContain('CHARSET=ISO-8859-1:[SKO] =DAcelov=E9 cvicenie - ziaci');
    expect(text).not.toContain('RRULE');
    expect(text).not.toContain('LOCATION');
  });

  it('cuts the title to what the phone shows and honours an event without a reminder', () => {
    const long = [{ calendarName: 'Trips', event: event({ uid: 'x', title: 'a'.repeat(100), start: at(2026, 1, 1, 8), end: at(2026, 1, 1, 9), alarmMinutes: 15 }) }];
    const text = generatePhoneFile(long, phoneProfile('generic-vcal'), { defaultAlarm: '' });
    expect(/SUMMARY[^:]*:(.*)/.exec(unwrapped(text))![1]).toHaveLength(32);
    expect(text).not.toContain('AALARM');
    expect(generatePhoneFile(long, phoneProfile('nokia-s40'), { defaultAlarm: '' })).toContain('AALARM:20260101T074500');
  });

  it('knows seven phone families and falls back to the generic one', () => {
    expect(PHONE_PROFILES).toHaveLength(7);
    expect(phoneProfile('nothing').id).toBe('generic-vcal');
    expect(calendarPrefix('Školské akcie')).toBe('ŠKO');
    expect(calendarPrefix('123')).toBe('XX');
  });
});
