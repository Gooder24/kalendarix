// Every word the interface says, in Slovak and English, and how dates,
// durations and distances in time are put into words.

import { MS_DAY, MS_MINUTE, dayNumber, hm, sameDay } from './dates';
import type { Lang } from './types';

const sk = {
  today: 'Dnes', year: 'Rok', month: 'Mesiac', week: 'Týždeň', day: 'Deň',
  previous: 'Späť', next: 'Ďalej', search: 'Hľadať', settings: 'Nastavenia', sidebar: 'Bočný panel',
  calendars: 'Kalendáre', newCalendar: 'Nový kalendár', newEvent: 'Nová udalosť', editEvent: 'Upraviť udalosť',
  editCalendar: 'Upraviť kalendár', allDay: 'Celý deň', repeat: 'Opakovanie', location: 'Miesto', notes: 'Poznámky',
  alarm: 'Pripomienka', save: 'Uložiť', cancel: 'Zrušiť', delete: 'Vymazať', edit: 'Upraviť', close: 'Zavrieť',
  done: 'Hotovo', add: 'Pridať', show: 'Zobraziť', hide: 'Skryť',
  title: 'Názov', start: 'Začiatok', end: 'Koniec', calendar: 'Kalendár', category: 'Kategória', name: 'Názov',
  color: 'Farba', secondColor: 'Druhá farba', none: 'Žiadne', noneF: 'Žiadna', custom: 'Vlastné', ownColor: 'Vlastná farba',
  never: 'Nikdy', daily: 'Denne', weekly: 'Týždenne', monthly: 'Mesačne', yearly: 'Ročne',
  every: 'Každých', times: 'Počet opakovaní', until: 'Do', forever: 'bez konca',
  unitDaily: 'dní', unitWeekly: 'týždňov', unitMonthly: 'mesiacov', unitYearly: 'rokov',
  untitled: '(bez názvu)', noEvents: 'Žiadne udalosti', nothingPlanned: 'Na tento deň nie je nič naplánované.',
  more: 'ďalších', weekShort: 'týž.', now: 'práve teraz', ended: 'skončilo', cancelled: 'Zrušené',
  repeats: 'Opakuje sa', lessons: 'vyučovacích hodín', lessonsFew: 'vyučovacie hodiny', period: 'hodina',
  before: 'Predtým', after: 'Potom', firstOfDay: 'Prvá udalosť dňa', lastOfDay: 'Posledná udalosť dňa',
  managed: 'Spravuje iný program', managedHint: 'Udalosť prichádza z odoberaného zdroja a pri ďalšej synchronizácii sa prepíše. Upraviť sa dá len tam, odkiaľ pochádza.',
  subscribed: 'Odoberaný kalendár', openLink: 'Otvoriť odkaz', copy: 'Kopírovať',
  confirmDelete: 'Naozaj vymazať túto udalosť?', confirmDeleteCalendar: 'Vymazať kalendár aj so všetkými jeho udalosťami?',
  deleteOne: 'Len túto', deleteAll: 'Celú sériu', deleteSeriesAsk: 'Udalosť sa opakuje. Čo vymazať?',
  titleMissing: 'Udalosť potrebuje názov.', endBeforeStart: 'Koniec je pred začiatkom.', badDate: 'Dátum nerozumiem.', badTime: 'Čas nerozumiem.',
  needCalendar: 'Najprv vytvor kalendár.', events: 'udalostí', eventsOne: 'udalosť', eventsFew: 'udalosti',
  categories: 'Kategórie', newCategory: 'Nová kategória',
  autoAccent: 'Druhá farba podľa názvu', autoAccentHint: 'Každý názov v tomto kalendári dostane vlastnú druhú farbu (napr. každý predmet rozvrhu).',
  accentFor: 'Druhá farba pre všetky udalosti s názvom', accentAuto: 'Automaticky', accentOff: 'Bez druhej farby',
  appearance: 'Vzhľad', language: 'Jazyk', theme: 'Téma', themeSystem: 'Podľa systému', themeDark: 'Tmavá', themeLight: 'Svetlá',
  dualFill: 'Dvojfarebné udalosti', dualAccent: 'Výplň druhou farbou, pásik kategórie', dualCategory: 'Výplň farbou kategórie, pásik druhej farby',
  data: 'Dáta', importIcs: 'Importovať .ics', exportIcs: 'Exportovať .ics', exportAll: 'Exportovať všetky kalendáre',
  exportPhone: 'Export do telefónu', subscribe: 'Odoberať z adresy', subscribeUrl: 'Adresa .ics kalendára', refresh: 'Obnoviť',
  refreshing: 'Obnovujem…', refreshed: 'Obnovené', importHint: 'Pretiahni sem .ics súbory alebo vyber kategóriu a začni písať udalosti.',
  welcome: 'Vitaj v Kalendarixe', welcomeText: 'Zatiaľ tu nie je žiadny kalendár. Vytvor si prvý, alebo importuj súbory .ics.',
  createFirst: 'Vytvoriť kalendár', personal: 'Osobné',
  phone: 'Telefón', phoneHint: 'Vyber rodinu telefónu; súbor dostane formát, kódovanie a dĺžky, ktoré zvláda.',
  range: 'Obdobie', rangeUpcoming: 'Od dnes ďalej', rangeAll: 'Všetko', defaultAlarm: 'Pripomienka, keď udalosť žiadnu nemá',
  saved: 'Uložené', failed: 'Nepodarilo sa', conflict: 'Súbor sa medzitým zmenil; zmena sa použila na novú verziu.',
  actual: 'Skutočnosť', actualHint: 'Vedľa plánu ukázať, čo si naozaj robil', actualEmpty: 'Pre tento týždeň nie sú záznamy skutočnosti.',
  actualActive: 'aktívne', actualFocus: 'sústredenie', actualSwitches: 'prepnutí', actualConfidence: 'Istota',
  actualLow: 'nízka, over', actualEvidence: 'Podklady', actualFix: 'Oprava popisu:',
  cat_deep_work: 'Hlboká práca', cat_shallow_work: 'Bežná práca', cat_meeting: 'Stretnutie', cat_comms: 'Komunikácia',
  cat_learning: 'Učenie', cat_admin: 'Administratíva', cat_distraction: 'Rozptýlenie', cat_break: 'Prestávka',
  openInApp: 'Otvoriť v aplikácii', shortcuts: 'Skratky', hintCreate: 'Dvojklik do prázdneho miesta vytvorí udalosť.',
  m5: '5 minút pred', m15: '15 minút pred', m30: '30 minút pred', h1: '1 hodinu pred', h2: '2 hodiny pred', d1: '1 deň pred',
  minutesBefore: 'min pred', teacher: 'Učiteľ', group: 'Skupina', topic: 'Téma', link: 'Odkaz', room: 'Miestnosť',
  version: 'Verzia', dataFile: 'Súbor s dátami', about: 'O aplikácii',
  fromCalendar: 'Podľa kalendára', moreOptions: 'Kategória a farba', lessonsShort: 'hod.', periods: 'Hodiny',
};

type Key = keyof typeof sk;

const en: Record<Key, string> = {
  today: 'Today', year: 'Year', month: 'Month', week: 'Week', day: 'Day',
  previous: 'Back', next: 'Forward', search: 'Search', settings: 'Settings', sidebar: 'Sidebar',
  calendars: 'Calendars', newCalendar: 'New calendar', newEvent: 'New event', editEvent: 'Edit event',
  editCalendar: 'Edit calendar', allDay: 'All day', repeat: 'Repeat', location: 'Location', notes: 'Notes',
  alarm: 'Reminder', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', close: 'Close',
  done: 'Done', add: 'Add', show: 'Show', hide: 'Hide',
  title: 'Title', start: 'Start', end: 'End', calendar: 'Calendar', category: 'Category', name: 'Name',
  color: 'Colour', secondColor: 'Second colour', none: 'None', noneF: 'None', custom: 'Custom', ownColor: 'Own colour',
  never: 'Never', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
  every: 'Every', times: 'Number of times', until: 'Until', forever: 'no end',
  unitDaily: 'days', unitWeekly: 'weeks', unitMonthly: 'months', unitYearly: 'years',
  untitled: '(untitled)', noEvents: 'No events', nothingPlanned: 'Nothing is planned for this day.',
  more: 'more', weekShort: 'wk', now: 'right now', ended: 'ended', cancelled: 'Cancelled',
  repeats: 'Repeats', lessons: 'lessons', lessonsFew: 'lessons', period: 'period',
  before: 'Before', after: 'After', firstOfDay: 'First event of the day', lastOfDay: 'Last event of the day',
  managed: 'Managed by another program', managedHint: 'This event comes from a subscribed source and is rewritten on its next sync. It can only be changed where it comes from.',
  subscribed: 'Subscribed calendar', openLink: 'Open link', copy: 'Copy',
  confirmDelete: 'Really delete this event?', confirmDeleteCalendar: 'Delete the calendar with all its events?',
  deleteOne: 'Only this one', deleteAll: 'The whole series', deleteSeriesAsk: 'This event repeats. What should go?',
  titleMissing: 'An event needs a title.', endBeforeStart: 'The end is before the start.', badDate: 'That is not a date.', badTime: 'That is not a time.',
  needCalendar: 'Create a calendar first.', events: 'events', eventsOne: 'event', eventsFew: 'events',
  categories: 'Categories', newCategory: 'New category',
  autoAccent: 'Second colour by title', autoAccentHint: 'Every title in this calendar gets a second colour of its own (each subject of a timetable, say).',
  accentFor: 'Second colour for every event titled', accentAuto: 'Automatic', accentOff: 'No second colour',
  appearance: 'Appearance', language: 'Language', theme: 'Theme', themeSystem: 'Follow the system', themeDark: 'Dark', themeLight: 'Light',
  dualFill: 'Two-colour events', dualAccent: 'Filled with the second colour, category stripe', dualCategory: 'Filled with the category colour, second-colour stripe',
  data: 'Data', importIcs: 'Import .ics', exportIcs: 'Export .ics', exportAll: 'Export all calendars',
  exportPhone: 'Export to a phone', subscribe: 'Subscribe to an address', subscribeUrl: 'Address of an .ics calendar', refresh: 'Refresh',
  refreshing: 'Refreshing…', refreshed: 'Refreshed', importHint: 'Drop .ics files here, or pick a category and start adding events.',
  welcome: 'Welcome to Kalendarix', welcomeText: 'There is no calendar here yet. Create your first one, or import .ics files.',
  createFirst: 'Create a calendar', personal: 'Personal',
  phone: 'Phone', phoneHint: 'Pick the phone family; the file gets the format, encoding and lengths it can take.',
  range: 'Period', rangeUpcoming: 'From today on', rangeAll: 'Everything', defaultAlarm: 'Reminder for events that have none',
  saved: 'Saved', failed: 'That did not work', conflict: 'The file changed in the meantime; the change was applied to the new version.',
  actual: 'Actual', actualHint: 'Show what you really did next to the plan', actualEmpty: 'Nothing was recorded for this week.',
  actualActive: 'active', actualFocus: 'focus', actualSwitches: 'switches', actualConfidence: 'Confidence',
  actualLow: 'low, check it', actualEvidence: 'Evidence', actualFix: 'Fix the label:',
  cat_deep_work: 'Deep work', cat_shallow_work: 'Shallow work', cat_meeting: 'Meeting', cat_comms: 'Comms',
  cat_learning: 'Learning', cat_admin: 'Admin', cat_distraction: 'Distraction', cat_break: 'Break',
  openInApp: 'Open in the app', shortcuts: 'Shortcuts', hintCreate: 'Double-click an empty spot to create an event.',
  m5: '5 minutes before', m15: '15 minutes before', m30: '30 minutes before', h1: '1 hour before', h2: '2 hours before', d1: '1 day before',
  minutesBefore: 'min before', teacher: 'Teacher', group: 'Group', topic: 'Topic', link: 'Link', room: 'Room',
  version: 'Version', dataFile: 'Data file', about: 'About',
  fromCalendar: 'As its calendar', moreOptions: 'Category and colour', lessonsShort: 'lessons', periods: 'Lessons',
};

const WORDS: Record<Lang, Record<Key, string>> = { sk, en };

export type { Key as TextKey };

export function translate(lang: Lang, key: Key): string {
  return WORDS[lang][key] ?? WORDS.sk[key] ?? key;
}

export const locale = (lang: Lang): string => (lang === 'en' ? 'en-GB' : 'sk-SK');

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = lang + JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(locale(lang), options)));
  return f;
}

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Month names in the nominative ("október"), which is what a heading wants. */
export function monthName(lang: Lang, month: number, style: 'long' | 'short' = 'long'): string {
  return cap(fmt(lang, { month: style }).format(new Date(2024, month, 1)));
}

/** Weekday names from Monday. */
export function weekdayNames(lang: Lang, style: 'long' | 'short' | 'narrow' = 'short'): string[] {
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => cap(fmt(lang, { weekday: style }).format(new Date(2024, 0, 1 + i))));
}

/** "piatok 23. októbra 2026" */
export function longDate(lang: Lang, date: Date | number): string {
  return fmt(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** "pi 23. 10." */
export function shortDate(lang: Lang, date: Date | number): string {
  return fmt(lang, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(date);
}

/** "23. októbra" */
export function dayMonth(lang: Lang, date: Date | number): string {
  return fmt(lang, { day: 'numeric', month: 'long' }).format(date);
}

/** "23. 10. 2026" */
export function numericDate(lang: Lang, date: Date | number): string {
  return fmt(lang, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(date);
}

/** Slovak has three plural forms: 1, 2 to 4, and the rest. */
function plural(lang: Lang, n: number, one: string, few: string, many: string): string {
  if (lang === 'en') return n === 1 ? one : many;
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

export function countEvents(lang: Lang, n: number): string {
  return `${n} ${plural(lang, n, translate(lang, 'eventsOne'), translate(lang, 'eventsFew'), translate(lang, 'events'))}`;
}

export function countLessons(lang: Lang, n: number): string {
  return lang === 'en'
    ? `${n} ${n === 1 ? 'lesson' : 'lessons'}`
    : `${n} ${plural(lang, n, 'vyučovacia hodina', 'vyučovacie hodiny', 'vyučovacích hodín')}`;
}

/** "45 min", "1 h 30 min", "3 dni" */
export function duration(lang: Lang, ms: number): string {
  const totalMinutes = Math.round(ms / MS_MINUTE);
  if (totalMinutes >= 24 * 60 && totalMinutes % (24 * 60) === 0) {
    const days = totalMinutes / (24 * 60);
    return lang === 'en' ? `${days} ${days === 1 ? 'day' : 'days'}` : `${days} ${plural(lang, days, 'deň', 'dni', 'dní')}`;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Where a moment lies from now, in words: "dnes", "zajtra", "o 11 dní", "pred 3 dňami". */
export function relativeDay(lang: Lang, date: Date | number, now: Date | number): string {
  const diff = dayNumber(date) - dayNumber(now);
  if (lang === 'en') {
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
  }
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'zajtra';
  if (diff === -1) return 'včera';
  return diff > 0 ? `o ${diff} ${plural(lang, diff, 'deň', 'dni', 'dní')}` : `pred ${-diff} ${-diff === 1 ? 'dňom' : 'dňami'}`;
}

/** "o 25 min", "o 2 h", for something later today. */
export function relativeTime(lang: Lang, at: number, now: number): string {
  const gap = at - now;
  if (gap <= 0 || gap >= MS_DAY) return relativeDay(lang, at, now);
  const text = duration(lang, gap);
  return lang === 'en' ? `in ${text}` : `o ${text}`;
}

/** When an event is, as one line: a day, a time range, or a span of days. */
export function whenLine(lang: Lang, start: number, end: number, allDay: boolean): string {
  if (allDay) {
    const last = end > start ? end - 1 : start;
    return sameDay(start, last) ? cap(longDate(lang, start)) : `${cap(shortDate(lang, start))} – ${shortDate(lang, last)}`;
  }
  if (sameDay(start, end) || end <= start) return cap(longDate(lang, start));
  return `${cap(shortDate(lang, start))} ${hm(start)} – ${shortDate(lang, end)} ${hm(end)}`;
}

export function alarmText(lang: Lang, minutes: number | ''): string {
  if (minutes === '') return translate(lang, 'noneF');
  const known: Record<number, Key> = { 5: 'm5', 15: 'm15', 30: 'm30', 60: 'h1', 120: 'h2', 1440: 'd1' };
  return known[minutes] ? translate(lang, known[minutes]) : `${minutes} ${translate(lang, 'minutesBefore')}`;
}

export const ALARM_CHOICES = [5, 15, 30, 60, 120, 1440];
