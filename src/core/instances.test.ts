import { describe, expect, it } from 'vitest';
import { dayNumber, hm } from './dates';
import { migrate } from './document';
import { expand, isBar, isManaged, isSynced, onDay, toBlocks } from './instances';
import { at, calendar, event, legacyDoc, schoolDay } from '../test/fixtures';

const OCTOBER = [new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime()] as const;
const doc = migrate(legacyDoc())!;

describe('expanding calendars', () => {
  it('hides what is switched off', () => {
    const hidden = { ...doc, calendars: doc.calendars.map((c) => (c.id === 'timetable-school' ? { ...c, visible: false } : c)) };
    expect(expand(hidden, ...OCTOBER).some((i) => i.calId === 'timetable-school')).toBe(false);
    expect(expand(hidden, ...OCTOBER, true).some((i) => i.calId === 'timetable-school')).toBe(true);
  });

  it('knows the days an event covers: the end does not count', () => {
    const course = expand(doc, ...OCTOBER).find((i) => i.uid === 'kurz')!;
    expect(course.firstDay).toBe(dayNumber(new Date(2026, 9, 5)));
    expect(course.lastDay).toBe(dayNumber(new Date(2026, 9, 9)));
    const night = event({ uid: 'night', start: at(2026, 10, 20, 22), end: at(2026, 10, 21, 0) });
    const [inst] = expand({ calendars: [calendar({ id: 'c', name: 'c', events: [night] })] }, ...OCTOBER);
    expect(inst.lastDay).toBe(inst.firstDay);
  });

  it('colours a lesson green with a second colour of its own', () => {
    const lessons = onDay(expand(doc, ...OCTOBER), dayNumber(new Date(2026, 9, 23)));
    expect(lessons.every((l) => l.color === '#4fae6b')).toBe(true);
    const byTitle = new Map(lessons.map((l) => [l.event.title, l.accent]));
    expect(byTitle.get('Matematika')).toBeTruthy();
    expect(byTitle.get('Matematika')).not.toBe(byTitle.get('Fyzika'));
    expect(lessons.every((l) => l.managed)).toBe(true);
  });

  it('marks only what another program owns as managed', () => {
    const course = expand(doc, ...OCTOBER).find((i) => i.uid === 'kurz')!;
    expect(course.managed).toBe(false);
    const feed = calendar({ id: 'f', name: 'f', sourceUrl: 'https://x/y.ics', events: [event({ uid: 'r', remote: true, start: at(2026, 10, 2, 8), end: at(2026, 10, 2, 9) }), event({ uid: 'mine', remote: false, start: at(2026, 10, 2, 10), end: at(2026, 10, 2, 11) })] });
    const got = expand({ calendars: [feed] }, ...OCTOBER);
    expect(got.map((i) => [i.uid, i.managed])).toEqual([['r', true], ['mine', false]]);
    const added = { ...feed, events: [...feed.events, event({ uid: 'byhand', start: at(2026, 10, 3, 8), end: at(2026, 10, 3, 9) })] };
    expect(expand({ calendars: [added] }, ...OCTOBER).find((i) => i.uid === 'byhand')!.managed).toBe(false);
  });

  it('knows the events of a sync program by its name in the calendar id and in the uid', () => {
    const lesson = event({ uid: '2026-10-02-0@timetable', start: at(2026, 10, 2, 8), end: at(2026, 10, 2, 9) });
    expect(isManaged(lesson, 'timetable-school')).toBe(true);
    // The same uid in a calendar that is not that program's: an event somebody imported or moved.
    expect(isManaged(lesson, 'kx-1-0-abcde')).toBe(false);
    expect(isManaged(lesson, 'timetable')).toBe(false);
    expect(isManaged(event({ uid: 'x@', start: lesson.start, end: lesson.end }), '-')).toBe(false);
    expect(isManaged(event({ uid: 'abc@mail.example.org', start: lesson.start, end: lesson.end }), 'mail-1')).toBe(false);
    expect(isSynced(calendar({ id: 'timetable-school', name: 'x', events: [lesson] }))).toBe(true);
    expect(isSynced(calendar({ id: 'kx-1', name: 'x', events: [lesson] }))).toBe(false);
    expect(isSynced(calendar({ id: 'kx-2', name: 'x', sourceUrl: 'https://x/y.ics' }))).toBe(true);
  });
});

describe('blocks', () => {
  it('turn five identical periods into one block from the first bell to the last', () => {
    const day = onDay(expand(doc, ...OCTOBER), dayNumber(new Date(2026, 9, 14)));
    expect(day).toHaveLength(5);
    const blocks = toBlocks(day);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].parts).toHaveLength(5);
    expect([hm(blocks[0].start), hm(blocks[0].end)]).toEqual(['08:00', '12:30']);
  });

  it('join only neighbours: the same subject twice with others between stays two', () => {
    const blocks = toBlocks(onDay(expand(doc, ...OCTOBER), dayNumber(new Date(2026, 9, 23))));
    expect(blocks.map((b) => [b.head.event.title, b.parts.length])).toEqual([
      ['Slovenský jazyk a literatúra', 1], ['Matematika', 2], ['Fyzika', 1], ['Anglický jazyk', 1],
    ]);
  });

  it('do not join across a long gap, another room, or events made by hand', () => {
    const gap = schoolDay(2026, 10, 15, ['Matematika', null, null, 'Matematika']);
    const rooms = [...schoolDay(2026, 10, 16, ['Fyzika'], '12'), ...schoolDay(2026, 10, 16, [null, 'Fyzika'], '13')];
    const mine = [event({ uid: 'a', title: 'Tréning', start: at(2026, 10, 17, 8), end: at(2026, 10, 17, 9) }), event({ uid: 'b', title: 'Tréning', start: at(2026, 10, 17, 9), end: at(2026, 10, 17, 10) })];
    const test = { calendars: [calendar({ id: 'timetable-school', name: 'x', events: [...gap, ...rooms] }), calendar({ id: 'me', name: 'me', events: mine })] };
    expect(toBlocks(expand(test, ...OCTOBER))).toHaveLength(6);
  });

  it('draw whole-day and multi-day events as bars', () => {
    const blocks = toBlocks(expand(doc, ...OCTOBER));
    expect(isBar(blocks.find((b) => b.head.uid === 'kurz')!)).toBe(true);
    expect(isBar(blocks.find((b) => b.head.event.title === 'Fyzika')!)).toBe(false);
  });
});
