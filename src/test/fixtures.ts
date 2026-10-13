// Calendars shaped like a real file: the same fields, names typed by hand, and
// a timetable written by a sync program.

import type { CalendarDoc, StoredCalendar, StoredEvent } from '../core/types';

/** Local wall-clock time in the test zone (Europe/Bratislava) as the stored ISO instant. */
export function at(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

export function event(partial: Partial<StoredEvent> & { uid: string; start: string; end: string }): StoredEvent {
  return { title: partial.uid, description: '', notes: '', location: '', allDay: false, rrule: null, exdates: [], alarmMinutes: '', ...partial };
}

export function calendar(partial: Partial<StoredCalendar> & { id: string; name: string }): StoredCalendar {
  return { color: '#628790', customColor: null, colorSlot: 1, visible: true, events: [], ...partial };
}

const PERIODS: [number, number, number, number][] = [
  [8, 0, 8, 45], [8, 50, 9, 35], [9, 45, 10, 30], [10, 50, 11, 35], [11, 45, 12, 30], [12, 40, 13, 25],
];

/** One school day as a timetable sync writes it: a lesson per period, uid "<date>-<position>@timetable". */
export function schoolDay(y: number, m: number, d: number, subjects: (string | null)[], room = '105'): StoredEvent[] {
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return subjects.flatMap((subject, i) => {
    if (!subject) return [];
    const [sh, sm, eh, em] = PERIODS[i];
    return [event({
      uid: `${date}-${i}@timetable`, title: subject, location: room,
      description: 'Učiteľ: Jana Nováková\nSkupina: 1.C', notes: 'Učiteľ: Jana Nováková\nSkupina: 1.C',
      start: at(y, m, d, sh, sm), end: at(y, m, d, eh, em),
    })];
  });
}

const DRILL = 'Účelové cvičenie – ochrana života a zdravia v teréne';

/** The calendars as they were before this version: seven made by hand, and a timetable a sync program writes. */
export function legacyDoc(): CalendarDoc {
  return {
    calendars: [
      calendar({ id: 'c-band', name: 'Kapela', color: '#a2cdc4', colorSlot: 5 }),
      calendar({ id: 'c-family', name: 'Rodinné', color: '#ff9500', customColor: '#ff9500', colorSlot: 2 }),
      calendar({ id: 'c-sport', name: 'Šport', color: '#ffcc00', customColor: '#ffcc00', colorSlot: 3 }),
      calendar({ id: 'c-holidays', name: 'Prááázdniny', color: '#abe7e6', colorSlot: 3 }),
      calendar({ id: 'c-trips', name: 'Výlety', color: '#30b0c7', customColor: '#30b0c7', colorSlot: 6 }),
      calendar({
        id: 'c-school', name: 'Školské akcie', color: '#ccffee', colorSlot: 4,
        events: [event({ uid: 'kurz', title: 'kurz', start: at(2026, 10, 5), end: at(2026, 10, 10), allDay: true })],
      }),
      calendar({ id: 'c-tests', name: 'Testy', color: '#96ac9c', colorSlot: 8 }),
      calendar({
        id: 'timetable-school', name: 'Rozvrh hodín', color: '#628790', colorSlot: 1,
        events: [
          ...schoolDay(2026, 10, 14, [DRILL, DRILL, DRILL, DRILL, DRILL]),
          ...schoolDay(2026, 10, 23, ['Slovenský jazyk a literatúra', 'Matematika', 'Matematika', 'Fyzika', 'Anglický jazyk']),
        ],
      }),
    ],
  };
}
