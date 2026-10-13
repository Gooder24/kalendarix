// Sample calendars for the browser stand-in: enough of every kind of event to
// see how the views behave. Loaded only outside the app, never shipped data.
// Every name, place and event in here is made up.

import { addDays, startOfWeek, ymd } from '../core/dates';
import type { CalendarDoc, StoredCalendar, StoredEvent } from '../core/types';
import type { ActualEntry, Palette } from './backend';

/** The palette of a pixel desktop, as its colors.toml gives it (index.html?theme=pixel). */
export const PIXEL_PALETTE: Palette = {
  path: 'demo',
  values: {
    mode: 'dark', background: '#000a07', dark_background: '#0a1512', lighter_background: '#1a2320',
    selection: '#585f5d', foreground: '#f0f0eb', accent: '#628790', cyan: '#abe7e6', green: '#a2cdc4',
    yellow: '#e2c08d', red: '#e5786d', font: 'Departure Mono Pixel', font_size: '11', icons: 'pixel-2000',
  },
};

const iso = (day: Date, h = 0, m = 0): string => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString();

function event(uid: string, title: string, start: string, end: string, extra: Partial<StoredEvent> = {}): StoredEvent {
  return { uid, title, description: '', notes: '', location: '', start, end, allDay: false, rrule: null, exdates: [], alarmMinutes: '', ...extra };
}

function wholeDays(uid: string, title: string, first: Date, days: number, extra: Partial<StoredEvent> = {}): StoredEvent {
  return event(uid, title, iso(first), iso(addDays(first, days)), { allDay: true, ...extra });
}

function calendar(id: string, name: string, color: string, events: StoredEvent[], extra: Partial<StoredCalendar> = {}): StoredCalendar {
  return { id, name, color, customColor: null, colorSlot: 1, visible: true, events, ...extra };
}

const PERIODS: [number, number, number, number][] = [
  [8, 0, 8, 45], [8, 50, 9, 35], [9, 45, 10, 30], [10, 50, 11, 35], [11, 45, 12, 30], [12, 40, 13, 25], [14, 0, 14, 45],
];

const TEACHERS: Record<string, [string, string]> = {
  'Slovenský jazyk a literatúra': ['Jana Nováková', '105'],
  Matematika: ['Peter Hronec', '12'],
  'Anglický jazyk': ['Jana Kováčová', '21'],
  Fyzika: ['Ján Mrva', 'F1'],
  Informatika: ['Tomáš Belan', 'PC2'],
  Dejepis: ['Eva Šimková', '105'],
  Biológia: ['Zuzana Lacková', 'B1'],
  Chémia: ['Milan Oravec', 'CH'],
  Geografia: ['Lucia Ďurišová', '105'],
  'Telesná a športová výchova': ['Marek Paluš', 'TV'],
  'Občianska náuka': ['Eva Šimková', '105'],
  'Nemecký jazyk': ['Iveta Bartošová', '24'],
};

const WEEK: (string | null)[][] = [
  ['Slovenský jazyk a literatúra', 'Matematika', 'Anglický jazyk', 'Fyzika', 'Dejepis', 'Informatika', 'Informatika'],
  ['Matematika', 'Matematika', 'Biológia', 'Nemecký jazyk', 'Slovenský jazyk a literatúra', 'Geografia'],
  ['Anglický jazyk', 'Chémia', 'Fyzika', 'Matematika', 'Telesná a športová výchova', 'Telesná a športová výchova'],
  ['Dejepis', 'Slovenský jazyk a literatúra', 'Nemecký jazyk', 'Biológia', 'Občianska náuka', 'Chémia'],
  ['Slovenský jazyk a literatúra', 'Matematika', 'Anglický jazyk', 'Geografia', 'Informatika'],
];

const DRILL = 'Účelové cvičenie – ochrana života a zdravia v teréne';

/** A timetable the way a sync program writes it: one event per lesson, the uid ending in the program's name. */
function timetable(monday: Date, weeks: number): StoredEvent[] {
  const out: StoredEvent[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 5; d++) {
      const day = addDays(monday, w * 7 + d);
      // One day that is a single thing all morning, and a cancelled lesson, as real weeks have.
      const special = w === 1 && d === 2;
      const subjects = special ? [DRILL, DRILL, DRILL, DRILL, DRILL] : WEEK[d];
      subjects.forEach((subject, i) => {
        if (!subject) return;
        const [sh, sm, eh, em] = PERIODS[i];
        const [teacher, room] = TEACHERS[subject] ?? ['Jana Nováková', '105'];
        const cancelled = w === 0 && d === 3 && i === 4;
        const notes = `Učiteľ: ${teacher}\nSkupina: 1.C${subject === 'Informatika' ? '\nOnline: https://meet.example.org/inf-1c' : ''}`;
        out.push(event(`${ymd(day)}-${i}@timetable`, (cancelled ? 'Zrušené: ' : '') + subject, iso(day, sh, sm), iso(day, eh, em), {
          location: room, description: notes, notes,
        }));
      });
    }
  }
  return out;
}

/** Calendars as they looked before this version: old colours, no categories. */
export function demoCalendars(today: Date = new Date()): CalendarDoc {
  const monday = startOfWeek(today);
  const at = (offset: number): Date => addDays(monday, offset);
  return {
    calendars: [
      calendar('demo-band', 'Kapela', '#a2cdc4', [
        event('b1', 'Skúška kapely', iso(at(1), 16), iso(at(1), 18), { location: 'Skúšobňa', rrule: { FREQ: 'WEEKLY' }, alarmMinutes: 60 }),
        event('b2', 'Koncert', iso(at(12), 18), iso(at(12), 20, 30), { location: 'Mestský klub', notes: 'Zvuková skúška o 16:30.\nVstupenky: https://klub.example.org/koncert' }),
      ], { colorSlot: 5 }),
      calendar('demo-family', 'Rodinné', '#ff9500', [
        wholeDays('f1', 'Otcove narodeniny', at(5), 1, { rrule: { FREQ: 'YEARLY' } }),
        event('f2', 'Rodinný obed', iso(at(6), 12), iso(at(6), 14), { location: 'U starých rodičov' }),
      ], { customColor: '#ff9500' }),
      calendar('demo-sport', 'Šport', '#af52de', [
        event('s1', 'Beh', iso(at(0), 19), iso(at(0), 20), { rrule: { FREQ: 'WEEKLY', BYDAY: ['MO', 'TH'] } }),
        event('s2', 'Plávanie', iso(at(6), 9), iso(at(6), 10), { location: 'Plaváreň', rrule: { FREQ: 'WEEKLY' } }),
        wholeDays('s3', 'Bežecké preteky', at(12), 2, { location: 'Bratislava', notes: 'Registrácia: https://preteky.example.org' }),
      ], { customColor: '#af52de' }),
      calendar('demo-club', 'Krúžky', '#ffcc00', [
        event('k1', 'Robotický krúžok', iso(at(3), 16, 30), iso(at(3), 18), { location: 'Centrum voľného času', rrule: { FREQ: 'WEEKLY' }, alarmMinutes: 120 }),
        event('k2', 'Nemčina – konverzácia', iso(at(4), 18), iso(at(4), 20), { location: 'Jazyková škola', rrule: { FREQ: 'WEEKLY', INTERVAL: 2 } }),
        wholeDays('k3', 'Sústredenie', at(11), 3, { location: 'Malá Fatra', notes: 'Zoznam vecí príde do stredy.' }),
      ], { customColor: '#ffcc00' }),
      calendar('demo-holidays', 'Prázdniny', '#abe7e6', [wholeDays('h1', 'Jesenné prázdniny', at(17), 5)]),
      calendar('demo-trips', 'Výlety', '#30b0c7', [
        event('t1', 'Viedeň', iso(at(19), 7), iso(at(21), 20), { location: 'Wien Hbf', notes: 'Vlak 7:12 z hlavnej stanice.' }),
      ], { customColor: '#30b0c7' }),
      calendar('demo-school', 'Školské akcie', '#ccffee', [
        wholeDays('a1', 'Lyžiarsky kurz', at(7), 5, { location: 'Jasná' }),
        event('a2', 'Rodičovské združenie', iso(at(2), 16), iso(at(2), 17), { location: 'Trieda 105' }),
        wholeDays('a3', 'Deň otvorených dverí', at(10), 1),
      ]),
      calendar('demo-tests', 'Testy', '#96ac9c', [
        event('p1', 'Písomka z matematiky', iso(at(3), 8, 50), iso(at(3), 9, 35), { location: '12', notes: 'Kvadratické rovnice, kapitoly 3 – 5.', alarmMinutes: 1440 }),
        event('p2', 'Test – anglické časy', iso(at(8), 9, 45), iso(at(8), 10, 30), { location: '21' }),
        event('p3', 'Štvrťročná práca zo slovenčiny', iso(at(15), 8), iso(at(15), 9, 35), { location: '105' }),
      ]),
      calendar('timetable-school', 'Rozvrh hodín', '#628790', timetable(addDays(monday, -7), 4)),
    ],
  };
}

/** A made-up week of tracked activity (index.html?actual). */
export function demoActual(from: string, to: string): ActualEntry[] {
  const out: ActualEntry[] = [];
  const kinds: [string, string, number, number, number][] = [
    ['deep_work', 'Seminárna práca: osnova', 9, 11, 0.9],
    ['comms', 'Správy a e-mail', 11, 11.5, 0.7],
    ['learning', 'Učebnica, kapitola 10', 13, 14.5, 0.8],
    ['distraction', 'Videá', 14.5, 15, 0.4],
  ];
  for (let day = new Date(from + 'T00:00'); ymd(day) <= to; day = addDays(day, 1)) {
    if (day > new Date()) break;
    kinds.forEach(([category, title, a, b, confidence], i) => {
      const start = new Date(day.getTime() + a * 3600000);
      const end = new Date(day.getTime() + b * 3600000);
      out.push({
        uid: `${ymd(day)}-${i}`, blockId: i + 1, start: start.toISOString(), end: end.toISOString(), title, description: '',
        category, project: null, color: null, confidence, activeSeconds: (b - a) * 3000, switches: 4 + i, focusRatio: 0.6 + i * 0.1,
        evidence: [{ app: 'editor', what: title, s: (b - a) * 2400 }],
      });
    });
  }
  return out;
}
