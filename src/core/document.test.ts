import { describe, expect, it } from 'vitest';
import { categoriesOf } from './categories';
import { calendarColor } from './colors';
import {
  SCHEMA, addCalendar, addCategory, addEvent, deleteCalendar, deleteCategory, deleteEvent, deleteOccurrence, importCalendars, looksLikeCalendars,
  migrate, moveEvent, moved, parseDoc, replaceRemote, serialize, setAccent, updateCalendar, updateCategory, updateEvent, type EventDraft,
} from './document';
import type { CalendarDoc, StoredCalendar } from './types';
import { occurrences } from './recurrence';
import { at, calendar, event, legacyDoc } from '../test/fixtures';

/** The colour a calendar of this file is drawn in. */
const colour = (doc: CalendarDoc, calendar: StoredCalendar): string => calendarColor(calendar, categoriesOf(doc));

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  title: ' Stretnutie ', start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 15), allDay: false,
  location: 'Bratislava', notes: 'priniesť notebook', rrule: null, alarmMinutes: 30, ...over,
});

describe('reading a file', () => {
  it('accepts anything and never throws', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}, { calendars: 'no' }, { calendars: [null, 3, { events: [null, {}] }] }]) {
      expect(Array.isArray(parseDoc(raw).calendars)).toBe(true);
    }
    const [cal] = parseDoc({ calendars: [{ events: [{}] }] }).calendars;
    expect(cal.id).toBeTruthy();
    expect(cal.events[0].uid).toBeTruthy();
    expect(cal.visible).toBe(true);
  });

  it('carries through what it does not know', () => {
    const raw = { owner: 'me', calendars: [{ id: 'a', name: 'A', color: '#111111', visible: false, flavour: 'x', events: [{ uid: 'e', title: 't', start: at(2026, 1, 1), end: at(2026, 1, 2), allDay: true, rrule: null, exdates: [], alarmMinutes: '', extra: { deep: [1, 2] } }] }] };
    const back = JSON.parse(serialize(parseDoc(raw)));
    expect(back.owner).toBe('me');
    expect(back.calendars[0].flavour).toBe('x');
    expect(back.calendars[0].visible).toBe(false);
    expect(back.calendars[0].events[0].extra).toEqual({ deep: [1, 2] });
  });

  it('leaves an event a sync program wrote exactly as it wrote it', () => {
    // The sync compares its events with the file and rewrites the file when they differ.
    const theirs = { uid: '2026-10-23-0@timetable', title: 'Slovenský jazyk a literatúra', description: 'Učiteľ: X', notes: 'Učiteľ: X', location: '105', start: '2026-10-23T06:00:00.000Z', end: '2026-10-23T06:45:00.000Z', allDay: false, rrule: null, exdates: [], alarmMinutes: '' };
    const back = JSON.parse(serialize(parseDoc({ calendars: [{ id: 'timetable-school', name: 'Rozvrh hodín', color: '#628790', visible: true, colorSlot: 1, customColor: null, events: [theirs] }] })));
    expect(back.calendars[0].events[0]).toEqual(theirs);
    expect(Object.keys(back.calendars[0].events[0])).toEqual(Object.keys(theirs));
  });

  it('gives what has no id the same id on every read', () => {
    const raw = { calendars: [{ name: 'A', events: [{ title: 'x', start: at(2026, 1, 1), end: at(2026, 1, 2) }] }] };
    expect(parseDoc(raw).calendars[0].id).toBe(parseDoc(raw).calendars[0].id);
    expect(parseDoc(raw).calendars[0].events[0].uid).toBe(parseDoc(raw).calendars[0].events[0].uid);
  });

  it('ends an event with no usable end where it starts, and reads minutes written as text', () => {
    const [e] = parseDoc({ calendars: [{ id: 'a', events: [{ uid: 'e', start: at(2026, 1, 1, 8), end: '', alarmMinutes: '15' }] }] }).calendars[0].events;
    expect(e.end).toBe(at(2026, 1, 1, 8));
    expect(e.alarmMinutes).toBe(15);
  });

  it('knows a calendar file from other JSON', () => {
    for (const ok of [null, undefined, {}, { calendars: [] }, { calendars: [], schema: 2 }]) expect(looksLikeCalendars(ok)).toBe(true);
    for (const bad of [[], 'text', 42, { calendars: 'no' }, { calendars: {} }]) expect(looksLikeCalendars(bad)).toBe(false);
  });

  it('writes the file the way the first Kalendarix did', () => {
    expect(serialize({ calendars: [] })).toBe('{\n  "calendars": []\n}');
  });
});

describe('upgrading an older file', () => {
  const upgraded = migrate(parseDoc(legacyDoc()))!;
  const colourOf = (name: string): string => colour(upgraded, upgraded.calendars.find((c) => c.name === name)!);

  it('gives every known calendar the colour of its category', () => {
    expect(colourOf('Testy')).toBe('#e5584f');
    expect(colourOf('Školské akcie')).toBe('#b9e6a2');
    expect(colourOf('Výlety')).toBe('#f0913a');
    expect(colourOf('Prááázdniny')).toBe('#f2d14e');
    expect(colourOf('Rodinné')).toBe('#9fd0f5');
    expect(colourOf('Rozvrh hodín')).toBe('#4fae6b');
  });

  it('happens once, and adds no calendar and no category', () => {
    expect(migrate(upgraded)).toBeNull();
    expect(upgraded.calendars.map((c) => c.id)).toEqual(legacyDoc().calendars.map((c) => c.id));
    expect(upgraded.categories).toBeUndefined();
  });

  it('leaves a calendar it does not recognise as it was', () => {
    for (const name of ['Kapela', 'Šport']) {
      const before = legacyDoc().calendars.find((c) => c.name === name);
      expect(upgraded.calendars.find((c) => c.name === name)).toEqual(before);
    }
  });

  it('writes the colours where other readers of the file and the old app look for them', () => {
    for (const c of upgraded.calendars.filter((c) => c.category)) {
      expect(c.color).toBe(colour(upgraded, c));
      expect(c.customColor).toBe(colour(upgraded, c));
    }
  });

  it('turns on a second colour per subject for the timetable only', () => {
    expect(upgraded.calendars.filter((c) => c.autoAccent).map((c) => c.id)).toEqual(['timetable-school']);
  });

  it('touches no event, name or visibility', () => {
    const before = legacyDoc();
    expect(upgraded.schema).toBe(SCHEMA);
    upgraded.calendars.slice(0, before.calendars.length).forEach((c, i) => {
      expect(c.events).toEqual(before.calendars[i].events);
      expect([c.id, c.name, c.visible]).toEqual([before.calendars[i].id, before.calendars[i].name, before.calendars[i].visible]);
    });
  });

  it('does not invent calendars in an empty file', () => {
    expect(migrate({ calendars: [] })!.calendars).toEqual([]);
  });

  it('respects a category somebody already chose, including none', () => {
    const doc = migrate({ calendars: [calendar({ id: 'a', name: 'Testy', category: '', color: '#123456' }), calendar({ id: 'b', name: 'Výlety', category: 'family' })] })!;
    expect(colour(doc, doc.calendars[0])).toBe('#123456');
    expect(doc.calendars[1].category).toBe('family');
  });

  it("recognises a calendar named as one of the user's own categories", () => {
    const doc = migrate({ categories: [{ id: 'choir', name: 'Zbor', color: '#2f55b0' }], calendars: [calendar({ id: 'a', name: 'zbor' })] })!;
    expect(doc.calendars[0]).toMatchObject({ category: 'choir', color: '#2f55b0', customColor: '#2f55b0' });
  });
});

describe('changing events', () => {
  const base = migrate(parseDoc(legacyDoc()))!;

  it('adds an event to its calendar and nowhere else', () => {
    const next = addEvent('c-tests', draft())(base);
    const added = next.calendars.find((c) => c.id === 'c-tests')!.events[0];
    expect(added).toMatchObject({ title: 'Stretnutie', location: 'Bratislava', notes: 'priniesť notebook', description: 'priniesť notebook', allDay: false, alarmMinutes: 30, rrule: null, exdates: [] });
    expect(added.start).toBe(new Date(2026, 9, 20, 14).toISOString());
    expect(next.calendars.filter((c) => c.id !== 'c-tests')).toEqual(base.calendars.filter((c) => c.id !== 'c-tests'));
    expect(base.calendars.find((c) => c.id === 'c-tests')!.events).toHaveLength(0);
  });

  it('adds the same event when the change has to be made again on a newer file', () => {
    const change = addEvent('c-tests', draft());
    const uidOf = (d: ReturnType<typeof change>): string => d.calendars.find((c) => c.id === 'c-tests')!.events[0].uid;
    expect(uidOf(change(base))).toBe(uidOf(change(base)));
  });

  it('edits in place, keeping what the form does not show', () => {
    const start = { calendars: [calendar({ id: 'a', name: 'a', events: [event({ uid: 'e', start: at(2026, 1, 1, 8), end: at(2026, 1, 1, 9), exdates: [at(2026, 1, 8, 8)], secret: 7 })] }), calendar({ id: 'b', name: 'b' })] };
    // Same day, another hour: the days taken out of the series stay where they are.
    const sameDay = { start: new Date(2026, 0, 1, 10), end: new Date(2026, 0, 1, 11) };
    const next = updateEvent('a', 'e', draft({ ...sameDay, category: 'tests', accent: '#00ff00' }))(start);
    expect(next.calendars[0].events[0]).toMatchObject({ uid: 'e', title: 'Stretnutie', secret: 7, exdates: [at(2026, 1, 8, 8)], category: 'tests', accent: '#00ff00' });
    const cleared = updateEvent('a', 'e', draft(sameDay))(next);
    expect(cleared.calendars[0].events[0]).not.toHaveProperty('category');
    expect(cleared.calendars[0].events[0]).not.toHaveProperty('accent');
  });

  it('moves an event to another calendar', () => {
    const start = { calendars: [calendar({ id: 'a', name: 'a', events: [event({ uid: 'e', start: at(2026, 1, 1, 8), end: at(2026, 1, 1, 9) })] }), calendar({ id: 'b', name: 'b' })] };
    const next = updateEvent('a', 'e', draft(), 'b')(start);
    expect(next.calendars.map((c) => c.events.map((e) => e.uid))).toEqual([[], ['e']]);
    expect(updateEvent('a', 'e', draft(), 'gone')(start).calendars[0].events).toHaveLength(1);
    expect(updateEvent('a', 'missing', draft())(start)).toBe(start);
  });

  it('deletes one event, or one occurrence of a series', () => {
    const series = event({ uid: 's', start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 9), rrule: { FREQ: 'DAILY', COUNT: 4 } });
    const start = { calendars: [calendar({ id: 'a', name: 'a', events: [series, event({ uid: 'x', start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 9) })] })] };
    expect(deleteEvent('a', 'x')(start).calendars[0].events.map((e) => e.uid)).toEqual(['s']);
    const without = deleteOccurrence('a', 's', new Date(2026, 9, 6, 8).getTime())(start);
    const days = occurrences(without.calendars[0].events[0], new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime());
    expect(days.map((o) => new Date(o.start).getDate())).toEqual([5, 7, 8]);
  });

  it('moves a series as a whole when one occurrence is dragged', () => {
    const series = event({ uid: 's', start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 9), rrule: { FREQ: 'WEEKLY' } });
    const start = { calendars: [calendar({ id: 'a', name: 'a', events: [series] })] };
    // The second occurrence (12 October 08:00) is dropped on the 13th at 10:00.
    const moved = moveEvent('a', 's', new Date(2026, 9, 12, 8).getTime(), new Date(2026, 9, 13, 10).getTime())(start);
    expect(moved.calendars[0].events[0].start).toBe(at(2026, 10, 6, 10));
    expect(moved.calendars[0].events[0].end).toBe(at(2026, 10, 6, 11));
  });
});

describe('moving an event', () => {
  const days = (e: { start: string; end: string }): string => `${new Date(e.start).toString().slice(4, 21)} → ${new Date(e.end).toString().slice(4, 21)}`;
  const local = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime();

  it('keeps a whole-day event one day long wherever it is dropped among the hours', () => {
    const e = event({ uid: 'a', start: at(2026, 10, 20), end: at(2026, 10, 21), allDay: true });
    // Tuesday, picked up and dropped on Thursday at the nine o'clock row.
    expect(days(moved(e, local(2026, 10, 20), local(2026, 10, 22, 9)))).toBe('Oct 22 2026 00:00 → Oct 23 2026 00:00');
  });

  it('keeps a whole day whole across the nights the clocks change', () => {
    const march = event({ uid: 'a', start: at(2026, 3, 28), end: at(2026, 3, 29), allDay: true });
    expect(days(moved(march, local(2026, 3, 28), local(2026, 3, 29)))).toBe('Mar 29 2026 00:00 → Mar 30 2026 00:00');
    const october = event({ uid: 'a', start: at(2026, 10, 25), end: at(2026, 10, 26), allDay: true });
    expect(days(moved(october, local(2026, 10, 25), local(2026, 10, 24)))).toBe('Oct 24 2026 00:00 → Oct 25 2026 00:00');
  });

  it('moves a series by the clock: eight o\'clock stays eight o\'clock in summer and winter', () => {
    const daily = event({ uid: 'd', start: at(2026, 6, 1, 8), end: at(2026, 6, 1, 9), rrule: { FREQ: 'DAILY' } });
    // Its occurrence on Saturday 24 October is dragged to the Sunday the clocks go back.
    const after = moved(daily, local(2026, 10, 24, 8), local(2026, 10, 25, 8));
    expect(days(after)).toBe('Jun 02 2026 08:00 → Jun 02 2026 09:00');
    const hours = occurrences(after, local(2026, 10, 20), local(2026, 10, 30)).map((o) => new Date(o.start).getHours());
    expect(new Set(hours)).toEqual(new Set([8]));
  });

  it('keeps the length of a timed event and changes its hour', () => {
    const e = event({ uid: 't', start: at(2026, 10, 18, 12), end: at(2026, 10, 18, 14) });
    expect(days(moved(e, local(2026, 10, 18, 12), local(2026, 10, 17, 10, 15)))).toBe('Oct 17 2026 10:15 → Oct 17 2026 12:15');
    expect(moved(e, local(2026, 10, 18, 12), local(2026, 10, 18, 12))).toBe(e);
  });

  it('takes the weekdays of a weekly rule and the days taken out of it along', () => {
    const weekly = event({ uid: 'w', start: at(2026, 10, 5, 9), end: at(2026, 10, 5, 10), rrule: { FREQ: 'WEEKLY', BYDAY: ['MO'] }, exdates: [at(2026, 10, 12, 9)] });
    const after = moved(weekly, local(2026, 10, 19, 9), local(2026, 10, 21, 9)); // a Monday dragged to Wednesday
    expect(after.rrule).toEqual({ FREQ: 'WEEKLY', BYDAY: ['WE'] });
    const got = occurrences(after, local(2026, 10, 1), local(2026, 11, 1)).map((o) => new Date(o.start).getDate());
    expect(got).toEqual([7, 21, 28]); // Wednesdays, and the one that was taken out is still out
  });

  it('survives an event whose end nobody can read', () => {
    const broken = event({ uid: 'b', start: at(2026, 10, 20, 8), end: 'whenever' });
    expect(days(moved(broken, local(2026, 10, 20, 8), local(2026, 10, 21, 9)))).toBe('Oct 21 2026 09:00 → Oct 21 2026 09:00');
    expect(moved(event({ uid: 'c', start: 'never', end: '' }), 0, 86400000)).toMatchObject({ start: 'never' });
  });
});

describe('editing a series', () => {
  it('moves what was taken out of it, and its weekdays, when its day changes', () => {
    const weekly = event({ uid: 'w', start: at(2026, 10, 5, 9), end: at(2026, 10, 5, 10), rrule: { FREQ: 'WEEKLY', BYDAY: ['MO'] }, exdates: [at(2026, 10, 12, 9)] });
    const start = { calendars: [calendar({ id: 'a', name: 'a', events: [weekly] })] };
    const edited = updateEvent('a', 'w', draft({ start: new Date(2026, 9, 6, 9), end: new Date(2026, 9, 6, 10), rrule: weekly.rrule }))(start).calendars[0].events[0];
    expect(edited.rrule).toEqual({ FREQ: 'WEEKLY', BYDAY: ['TU'] });
    expect(edited.exdates).toEqual([at(2026, 10, 13, 9)]);
  });
});

describe('changing calendars', () => {
  it('adds, edits and removes them', () => {
    let doc = addCalendar({ id: 'n', name: 'Nový', category: 'tests' })({ calendars: [] });
    expect(colour(doc, doc.calendars[0])).toBe('#e5584f');
    doc = updateCalendar('n', { category: '', customColor: '#010203' })(doc);
    expect(JSON.parse(serialize(doc)).calendars[0]).toMatchObject({ color: '#010203', customColor: '#010203' });
    doc = addCalendar({ id: 'm', name: 'Druhý' })(doc);
    expect(colour(doc, doc.calendars[1])).not.toBe(colour(doc, doc.calendars[0]));
    expect(deleteCalendar('n')(doc).calendars.map((c) => c.id)).toEqual(['m']);
  });

  it('pins and unpins a second colour by title', () => {
    const start = { calendars: [calendar({ id: 'a', name: 'a' })] };
    const pinned = setAccent('a', 'Zrušené: Matematika', '#abcdef')(start);
    expect(pinned.calendars[0].accents).toEqual({ matematika: '#abcdef' });
    expect(setAccent('a', 'matematika', null)(pinned).calendars[0].accents).toEqual({});
  });

  it('replaces a feed download but keeps what was added by hand', () => {
    const start = { calendars: [calendar({ id: 'f', name: 'f', sourceUrl: 'https://x', events: [event({ uid: 'old', remote: true, start: at(2026, 1, 1), end: at(2026, 1, 2) }), event({ uid: 'mine', start: at(2026, 1, 3), end: at(2026, 1, 4) })] })] };
    const next = replaceRemote('f', [event({ uid: 'new', start: at(2026, 2, 1), end: at(2026, 2, 2) })])(start);
    expect(next.calendars[0].events.map((e) => [e.uid, e.remote])).toEqual([['mine', undefined], ['new', true]]);
  });

  it('recognises the category of an imported calendar', () => {
    const doc = importCalendars([{ name: 'Výlety 2026', events: [] }, { name: 'Práca', events: [] }])({ calendars: [] });
    expect(doc.calendars.map((c) => c.category)).toEqual(['trips', undefined]);
  });
});

describe("the user's own categories", () => {
  const choir = { id: 'choir', name: 'Zbor', color: '#2f55b0' };
  const start: CalendarDoc = {
    calendars: [
      calendar({ id: 'a', name: 'Spev', category: 'choir', events: [event({ uid: 'e', category: 'choir', start: at(2026, 1, 1), end: at(2026, 1, 2) })] }),
      calendar({ id: 'b', name: 'Iné', color: '#111111', events: [event({ uid: 'f', category: 'choir', start: at(2026, 1, 1), end: at(2026, 1, 2) })] }),
    ],
  };

  it('are added once, and colour what is of that kind', () => {
    const doc = addCategory(choir)(start);
    expect(doc.categories).toEqual([choir]);
    expect(addCategory({ ...choir, name: 'Iný zbor' })(doc)).toBe(doc);
    expect(JSON.parse(serialize(doc)).calendars[0]).toMatchObject({ color: '#2f55b0', customColor: '#2f55b0' });
    expect(JSON.parse(serialize(doc)).categories).toEqual([choir]);
  });

  it('are renamed and recoloured, and the calendars follow', () => {
    const doc = updateCategory('choir', { name: 'Spevokol', color: '#a374e0' })(addCategory(choir)(start));
    expect(doc.categories).toEqual([{ id: 'choir', name: 'Spevokol', color: '#a374e0' }]);
    expect(JSON.parse(serialize(doc)).calendars[0]).toMatchObject({ color: '#a374e0', customColor: '#a374e0' });
    expect(updateCategory('tests', { color: '#000000' })(doc)).toBe(doc);
    expect(updateCategory('nope', { color: '#000000' })(doc)).toBe(doc);
  });

  it('are written down the first time one that only a calendar spoke of is changed', () => {
    const spoken: CalendarDoc = { calendars: [calendar({ id: 'a', name: 'Šach', category: 'chess', color: '#6e4526', customColor: '#6e4526' })] };
    expect(JSON.parse(serialize(spoken)).categories).toBeUndefined();
    const doc = updateCategory('chess', { name: 'Šachy' })(spoken);
    expect(doc.categories).toEqual([{ id: 'chess', name: 'Šachy', color: '#6e4526' }]);
  });

  it('are removed without anything changing colour', () => {
    const doc = deleteCategory('choir')(addCategory(choir)(start));
    expect(doc.categories).toEqual([]);
    expect(doc.calendars[0]).toMatchObject({ category: '', color: '#2f55b0', customColor: '#2f55b0' });
    expect(colour(doc, doc.calendars[0])).toBe('#2f55b0');
    expect(doc.calendars.flatMap((c) => c.events).some((e) => 'category' in e)).toBe(false);
    expect(doc.calendars[1].color).toBe('#111111');
    expect(categoriesOf(doc).has('choir')).toBe(false);
    expect(deleteCategory('tests')(doc)).toBe(doc);
  });

  it('give the place back when one that replaced a category of the app is removed', () => {
    const replaced: CalendarDoc = { categories: [{ id: 'tests', name: 'Skúšky', color: '#112233' }], calendars: [calendar({ id: 'a', name: 'a', category: 'tests' })] };
    const doc = deleteCategory('tests')(replaced);
    expect(doc.categories).toEqual([]);
    expect(doc.calendars[0].category).toBe('tests');
    expect(colour(doc, doc.calendars[0])).toBe('#e5584f');
  });

  it('keep what else somebody put under "categories"', () => {
    const odd = { ...start, categories: [null, { id: 'x' }, choir] as never };
    expect(updateCategory('choir', { name: 'Zbor 2' })(odd).categories).toEqual([null, { id: 'x' }, { id: 'choir', name: 'Zbor 2', color: '#2f55b0' }]);
    expect(deleteCategory('choir')(odd).categories).toEqual([null, { id: 'x' }]);
  });
});
