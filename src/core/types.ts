// The shapes kept in ~/.config/kalendarix/calendars.json. Other programs may read
// and write this file too (a timetable sync, a calendar in the desktop's panel),
// so every field they know stays as it is and anything unknown is carried through
// untouched. The contract is written down in docs/calendars-json.md.

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** A recurrence rule as the iCalendar parser leaves it: RRULE parts by name. */
export interface RRule {
  FREQ: Freq;
  INTERVAL?: number;
  COUNT?: number;
  /** 20260514T215959Z, 20260514T215959 or 20260514. */
  UNTIL?: string;
  /** MO..SU, with an ordinal for monthly rules (2TU, -1FR). */
  BYDAY?: string[];
  BYMONTHDAY?: number[];
  [other: string]: unknown;
}

export interface StoredEvent {
  uid: string;
  title: string;
  description?: string;
  notes?: string;
  location?: string;
  /** Instants as Date.toISOString(): UTC with milliseconds. */
  start: string;
  end: string;
  /** Whole-day events run from local midnight to local midnight, end exclusive. */
  allDay: boolean;
  rrule: RRule | null;
  exdates: string[];
  /** Minutes before the start, or '' for no reminder. */
  alarmMinutes: number | '';
  /** Came from a subscribed feed and is replaced on its next refresh. */
  remote?: boolean;
  /** Category id overriding the calendar's; see categories.ts. */
  category?: string;
  /** Second colour of this event, #rrggbb. */
  accent?: string;
  [other: string]: unknown;
}

export interface StoredCalendar {
  id: string;
  name: string;
  /** The colour other readers of the file use; kept equal to what we show. */
  color: string;
  customColor?: string | null;
  colorSlot?: number;
  visible: boolean;
  sourceUrl?: string | null;
  /** Category id; the category fixes the calendar's colour. '' is "none", chosen by hand. */
  category?: string;
  /** Give every distinct title in this calendar its own second colour. */
  autoAccent?: boolean;
  /** Second colours chosen by hand, by normalised title. */
  accents?: Record<string, string>;
  events: StoredEvent[];
  [other: string]: unknown;
}

/** A category of the user's own; the ones that come with the app are in categories.ts. */
export interface StoredCategory {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
  [other: string]: unknown;
}

export interface CalendarDoc {
  /** Version of the layout this file was last brought up to; see migrate() in document.ts. */
  schema?: number;
  /** The user's own categories; absent until one is made. */
  categories?: StoredCategory[];
  calendars: StoredCalendar[];
  [other: string]: unknown;
}

/** One occurrence of an event, ready to draw. Times are epoch milliseconds. */
export interface Instance {
  /** Unique among instances: calendar, event and occurrence start. */
  key: string;
  calId: string;
  uid: string;
  event: StoredEvent;
  calendar: StoredCalendar;
  start: number;
  /** Exclusive. Equal to start for an event without a length. */
  end: number;
  allDay: boolean;
  recurring: boolean;
  /** First and last local day touched, as day numbers (dates.ts). */
  firstDay: number;
  lastDay: number;
  /** Colour of the category (or of the calendar when it has none). */
  color: string;
  /** Second colour, when the event has one. */
  accent: string | null;
  /** Written by another program and replaced by it: shown, not edited. */
  managed: boolean;
}

export type ViewId = 'year' | 'month' | 'week' | 'day';
export type Lang = 'sk' | 'en';

export interface Settings {
  lang: Lang;
  /** 'system' follows the desktop palette when there is one, else dark. */
  appearance: 'system' | 'dark' | 'light';
  view: ViewId;
  /** Which of the two colours fills a two-colour event; the other is its stripe. */
  dualFill: 'accent' | 'category';
  sidebarCollapsed: boolean;
  showActual: boolean;
  lastPhoneProfile: string;
  /** Reminder given to events that have none when exporting to a phone. */
  phoneAlarm: number | '';
  [other: string]: unknown;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'sk',
  appearance: 'system',
  view: 'month',
  dualFill: 'category',
  sidebarCollapsed: false,
  showActual: false,
  lastPhoneProfile: 'nokia-s40',
  phoneAlarm: 120,
};
