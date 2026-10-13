import { describe, expect, it } from 'vitest';
import { linkify, parseDetails, splitCancelled } from './details';
import { alarmText, countEvents, countLessons, duration, longDate, monthName, relativeDay, relativeTime, translate, weekdayNames, whenLine } from './i18n';
import { expand } from './instances';
import { score, search } from './search';
import { at, calendar, event } from '../test/fixtures';

describe('details', () => {
  it('reads the labelled lines a timetable feed writes', () => {
    const { fields, notes } = parseDetails('Učiteľ: Jana Nováková\nSkupina: 1.C, 1.D\nTéma: Štúrovci\nOnline: https://meet.example/abc\nPriniesť čitateľský denník.');
    expect(fields).toEqual([
      { kind: 'teacher', label: 'Učiteľ', value: 'Jana Nováková' },
      { kind: 'group', label: 'Skupina', value: '1.C, 1.D' },
      { kind: 'topic', label: 'Téma', value: 'Štúrovci' },
      { kind: 'link', label: 'Online', value: 'https://meet.example/abc' },
    ]);
    expect(notes).toBe('Priniesť čitateľský denník.');
  });

  it('does not mistake ordinary text for a label', () => {
    const text = 'Stretneme sa o 12:30 pri vchode.\nhttps://example.com/a:b\nDlhá veta, ktorá má na konci dvojbodku a pokračuje: takto.';
    expect(parseDetails(text)).toEqual({ fields: [], notes: text });
    expect(parseDetails(undefined)).toEqual({ fields: [], notes: '' });
  });

  it('keeps labels it does not know and spots a bare link', () => {
    expect(parseDetails('Vstupné: 5 €\nWeb: https://x.sk').fields.map((f) => f.kind)).toEqual(['other', 'link']);
  });

  it('finds links in running text', () => {
    expect(linkify('Pozri https://example.com/a?b=1, potom napíš.')).toEqual([
      { text: 'Pozri ' }, { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' }, { text: ', potom napíš.' },
    ]);
    expect(linkify('bez odkazu')).toEqual([{ text: 'bez odkazu' }]);
  });

  it('splits the cancelled mark from the title', () => {
    expect(splitCancelled('Zrušené: Matematika')).toEqual({ title: 'Matematika', cancelled: true });
    expect(splitCancelled('Matematika')).toEqual({ title: 'Matematika', cancelled: false });
  });
});

describe('search', () => {
  const now = new Date(2026, 9, 12, 12).getTime();
  const doc = { calendars: [calendar({ id: 'c', name: 'Škola', events: [
    event({ uid: 'sj', title: 'Slovenský jazyk a literatúra', location: '33', notes: 'Učiteľ: Jana Nováková', start: at(2026, 10, 23, 8), end: at(2026, 10, 23, 9) }),
    event({ uid: 'weekly', title: 'Tréning', start: at(2026, 9, 1, 17), end: at(2026, 9, 1, 18), rrule: { FREQ: 'WEEKLY' } }),
    event({ uid: 'old', title: 'Výlet do Tatier', start: at(2026, 8, 1), end: at(2026, 8, 3), allDay: true }),
  ] })] };
  const all = expand(doc, new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime());

  it('ignores diacritics and case', () => {
    expect(search('ucitel', all, now).map((i) => i.uid)).toEqual(['sj']);
    expect(search('SLOVENSKY', all, now)[0].uid).toBe('sj');
    expect(search('tatier', all, now)[0].uid).toBe('old');
  });

  it('gives a repeating event once, at its next occurrence', () => {
    const hits = search('trening', all, now);
    expect(hits).toHaveLength(1);
    expect(new Date(hits[0].start).getDate()).toBe(13); // Tuesday after "now"
  });

  it('finds by calendar name and by letters in order', () => {
    expect(search('skola', all, now)).toHaveLength(3);
    expect(score('slj', 'Slovenský jazyk')).toBeGreaterThan(0);
    expect(score('xyz', 'Slovenský jazyk')).toBe(-1);
    expect(search('   ', all, now)).toEqual([]);
  });
});

describe('words', () => {
  const now = new Date(2026, 9, 12, 12);

  it('speaks both languages', () => {
    expect(translate('sk', 'today')).toBe('Dnes');
    expect(translate('en', 'today')).toBe('Today');
    expect(monthName('sk', 9)).toBe('Október');
    expect(monthName('en', 9)).toBe('October');
    expect(weekdayNames('sk')).toEqual(['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']);
    expect(weekdayNames('en')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(longDate('sk', new Date(2026, 9, 23))).toBe('piatok 23. októbra 2026');
    expect(longDate('en', new Date(2026, 9, 23))).toMatch(/^Friday,? 23 October 2026$/);
  });

  it('counts the Slovak way', () => {
    expect([1, 2, 5].map((n) => countEvents('sk', n))).toEqual(['1 udalosť', '2 udalosti', '5 udalostí']);
    expect([1, 3, 5].map((n) => countLessons('sk', n))).toEqual(['1 vyučovacia hodina', '3 vyučovacie hodiny', '5 vyučovacích hodín']);
    expect(countEvents('en', 1)).toBe('1 event');
  });

  it('says how long and how far', () => {
    expect(duration('sk', 45 * 60000)).toBe('45 min');
    expect(duration('sk', 90 * 60000)).toBe('1 h 30 min');
    expect(duration('sk', 2 * 3600000)).toBe('2 h');
    expect(duration('sk', 3 * 86400000)).toBe('3 dni');
    expect(duration('en', 86400000)).toBe('1 day');
    expect(relativeDay('sk', new Date(2026, 9, 12, 23), now)).toBe('dnes');
    expect(relativeDay('sk', new Date(2026, 9, 13, 1), now)).toBe('zajtra');
    expect(relativeDay('sk', new Date(2026, 9, 23), now)).toBe('o 11 dní');
    expect(relativeDay('sk', new Date(2026, 9, 9), now)).toBe('pred 3 dňami');
    expect(relativeDay('en', new Date(2026, 9, 23), now)).toBe('in 11 days');
    expect(relativeTime('sk', new Date(2026, 9, 12, 12, 25).getTime(), now.getTime())).toBe('o 25 min');
    expect(relativeTime('en', new Date(2026, 9, 14).getTime(), now.getTime())).toBe('in 2 days');
  });

  it('describes when an event is', () => {
    const d = (day: number, h = 0): number => new Date(2026, 9, day, h).getTime();
    expect(whenLine('sk', d(23, 8), d(23, 9), false)).toBe('Piatok 23. októbra 2026');
    expect(whenLine('sk', d(5), d(10), true)).toBe('Po 5. 10. – pi 9. 10.');
    expect(whenLine('sk', d(5), d(6), true)).toBe('Pondelok 5. októbra 2026');
    expect(whenLine('sk', d(20, 22), d(21, 2), false)).toBe('Ut 20. 10. 22:00 – st 21. 10. 02:00');
  });

  it('names reminders', () => {
    expect(alarmText('sk', '')).toBe('Žiadna');
    expect(alarmText('sk', 120)).toBe('2 hodiny pred');
    expect(alarmText('sk', 7)).toBe('7 min pred');
  });
});
