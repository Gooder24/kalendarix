// The one place the app's state lives: the calendars, the settings, and what
// is on screen. Components read the signals; everything that changes them is a
// function in this file.

import { computed, signal } from '@preact/signals';
import { categoriesOf } from '../core/categories';
import { addDays, addMonths, dayNumber, parseYmd, startOfDay, startOfMonth, startOfWeek, ymd } from '../core/dates';
import { looksLikeCalendars, migrate, parseDoc, serialize, withColors, type Change } from '../core/document';
import { translate, type TextKey } from '../core/i18n';
import { expand, toBlocks, type Block } from '../core/instances';
import { DEFAULT_SETTINGS, type CalendarDoc, type Instance, type Settings, type ViewId } from '../core/types';
import { backend, type ActualEntry, type Palette } from '../platform/backend';
import { applyTheme, chooseTheme, themeMetrics, type Metrics } from './theme';

// ---------------------------------------------------------------------------
// calendars
// ---------------------------------------------------------------------------

/** The calendars as they are on disk, and the version of the file they were read from. */
let base: CalendarDoc = { calendars: [] };
let version: string | null = null;
/** Changes made here that the file does not have yet. */
let pending: Change[] = [];
let saving = false;

/** What the views draw: the file plus the changes still on their way to it. */
export const doc = signal<CalendarDoc>(base);
export const loaded = signal(false);
/** Something the user should know, shown briefly. */
export const notice = signal<{ text: string; bad: boolean } | null>(null);

/** The categories of the file: the ones that come with the app and the user's own. */
export const categories = computed(() => categoriesOf(doc.value));

/** A notice about the file that arrived while a save was running; looked at once the save is done. */
let missed: { version: unknown } | null = null;

function refresh(): void {
  try {
    doc.value = pending.reduce((d, change) => change(d), base);
  } catch {
    // A change that cannot be made on this file is given up, not left to fail every redraw.
    pending = [];
    doc.value = base;
  }
}

function say(text: string, bad = false): void {
  notice.value = { text, bad };
  const shown = notice.value;
  setTimeout(() => {
    if (notice.value === shown) notice.value = null;
  }, bad ? 6000 : 2500);
}

async function read(): Promise<void> {
  const file = await backend.loadCalendars();
  let parsed: unknown = null;
  if (file.text !== null) {
    try {
      parsed = JSON.parse(file.text);
    } catch {
      // A half-written or foreign file: show nothing rather than guess, and never save over it.
      throw new Error('calendars.json is not readable');
    }
    if (!looksLikeCalendars(parsed)) throw new Error('calendars.json is not a calendar file');
  }
  base = parseDoc(parsed);
  // Nothing to upgrade in an empty file: it simply starts at this version, and is not written for that alone.
  if (!base.calendars.length) base = migrate(base) ?? base;
  version = file.version;
}

/**
 * Make a change: it shows at once and is then written. When the file moved on
 * in the meantime (the timetable sync writes it every quarter of an hour), the
 * fresh file is read and the change is made again on top of it, so neither side
 * loses anything.
 */
export function apply(change: Change): Promise<void> {
  try {
    change(doc.value);
  } catch (error) {
    // Refused before it is queued: one impossible change must not block every later one.
    say(`${translate(settings.value.lang, 'failed')}: ${error instanceof Error ? error.message : String(error)}`, true);
    return Promise.resolve();
  }
  pending.push(change);
  refresh();
  return flush();
}

async function flush(): Promise<void> {
  if (saving) return;
  saving = true;
  try {
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      const count = pending.length;
      const target = withColors(pending.slice(0, count).reduce((d, change) => change(d), base));
      const text = serialize(target);
      if (text === serialize(base)) {
        pending = pending.slice(count);
        continue;
      }
      const saved = await backend.saveCalendars(text, version);
      if (saved.ok) {
        base = target;
        version = saved.version;
        pending = pending.slice(count);
        attempt = -1;
      } else {
        await read();
      }
      refresh();
    }
    if (pending.length) throw new Error('the file kept changing');
  } catch (error) {
    pending = [];
    refresh();
    say(`${translate(settings.value.lang, 'failed')}: ${error instanceof Error ? error.message : String(error)}`, true);
  } finally {
    saving = false;
    // Usually the echo of the save itself, which reload() recognises by its version.
    const notice = missed;
    missed = null;
    if (notice) void reload(notice.version);
  }
}

/** Somebody else wrote the file: take their version, keeping what is still unsaved here. */
async function reload(theirVersion: unknown): Promise<void> {
  if (saving) {
    missed = { version: theirVersion };
    return;
  }
  if (theirVersion === version) return;
  try {
    await read();
    refresh();
  } catch {
    // Mid-write; the next change notice brings the finished file.
  }
}

// ---------------------------------------------------------------------------
// settings and theme
// ---------------------------------------------------------------------------

export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
/** settings.json as found: keys of other versions are kept when it is written back. */
let settingsFile: Record<string, unknown> = {};
const palette = signal<Palette | null>(null);
/** The pixel look is in use: components pick the pixel icons. */
export const pixelLook = signal(false);
/** The sizes the grids are laid out with; they follow the theme. */
export const metrics = signal<Metrics>({ hour: 48, lane: 22, cellHead: 26, line: 19 });

export const lang = computed(() => settings.value.lang);
export const t = (key: TextKey): string => translate(lang.value, key);

function readSettings(text: string | null): void {
  try {
    const raw: unknown = text ? JSON.parse(text) : {};
    settingsFile = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    settingsFile = {};
  }
  const s = settingsFile as Partial<Settings>;
  settings.value = {
    ...DEFAULT_SETTINGS,
    lang: s.lang === 'en' ? 'en' : 'sk',
    appearance: s.appearance === 'dark' || s.appearance === 'light' ? s.appearance : 'system',
    view: (['year', 'month', 'week', 'day'] as const).includes(s.view as ViewId) ? (s.view as ViewId) : 'month',
    dualFill: s.dualFill === 'accent' ? 'accent' : 'category',
    sidebarCollapsed: s.sidebarCollapsed === true,
    showActual: s.showActual === true,
    lastPhoneProfile: typeof s.lastPhoneProfile === 'string' ? s.lastPhoneProfile : DEFAULT_SETTINGS.lastPhoneProfile,
    phoneAlarm: typeof s.phoneAlarm === 'number' || s.phoneAlarm === '' ? s.phoneAlarm : DEFAULT_SETTINGS.phoneAlarm,
  };
}

export function setSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  settingsFile = { ...settingsFile, ...settings.value };
  paint();
  void backend.saveSettings(JSON.stringify(settingsFile, null, 2)).catch((e) => say(String(e), true));
}

let painted = false;

function paint(): void {
  const prefersLight = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
  const theme = chooseTheme(settings.value.appearance, palette.value, prefersLight);
  applyTheme(theme);
  if (pixelLook.value !== theme.pixel || !painted) void backend.setPixelText(theme.pixel).catch(() => {});
  painted = true;
  pixelLook.value = theme.pixel;
  metrics.value = themeMetrics(theme);
  document.documentElement.dataset.dual = settings.value.dualFill;
  document.documentElement.lang = settings.value.lang;
}

async function readTheme(): Promise<void> {
  palette.value = await backend.getTheme().catch(() => null);
  paint();
}

// ---------------------------------------------------------------------------
// what is on screen
// ---------------------------------------------------------------------------

export const view = signal<ViewId>('month');
/** The day the view is built around (local midnight, as a timestamp). */
export const cursor = signal<number>(startOfDay(Date.now()).getTime());
/** The current time, moved on twice a minute. */
export const now = signal<number>(Date.now());
export const today = computed(() => dayNumber(now.value));

export function show(next: ViewId, day?: Date | number): void {
  sidebarOver.value = false;
  if (day !== undefined) cursor.value = startOfDay(day).getTime();
  if (view.value !== next) {
    view.value = next;
    setSettings({ view: next });
  }
}

export function goToday(): void {
  cursor.value = startOfDay(now.value).getTime();
}

/** One step back or forward in whatever the view shows. */
export function step(direction: -1 | 1): void {
  const c = new Date(cursor.value);
  const moved =
    view.value === 'year' ? new Date(c.getFullYear() + direction, c.getMonth(), 1)
    : view.value === 'month' ? addMonths(startOfMonth(c), direction)
    : addDays(c, view.value === 'week' ? 7 * direction : direction);
  cursor.value = startOfDay(moved).getTime();
}

/** The days a view covers: [first day, one past the last], as local midnights. */
export const range = computed<[number, number]>(() => {
  const c = new Date(cursor.value);
  switch (view.value) {
    case 'year':
      return [new Date(c.getFullYear(), 0, 1).getTime(), new Date(c.getFullYear() + 1, 0, 1).getTime()];
    case 'month': {
      const first = startOfWeek(startOfMonth(c));
      const last = startOfWeek(addDays(addMonths(startOfMonth(c), 1), -1));
      return [first.getTime(), addDays(last, 7).getTime()];
    }
    case 'week': {
      const first = startOfWeek(c);
      return [first.getTime(), addDays(first, 7).getTime()];
    }
    default:
      return [startOfDay(c).getTime(), addDays(startOfDay(c), 1).getTime()];
  }
});

export const instances = computed<Instance[]>(() => expand(doc.value, range.value[0], range.value[1]));
export const blocks = computed<Block[]>(() => toBlocks(instances.value));

/** Blocks of a single day, for wherever one day is shown outside the main view. */
export function blocksOn(day: Date | number): Block[] {
  const from = startOfDay(day);
  const wanted = dayNumber(from);
  return toBlocks(expand(doc.value, from.getTime(), addDays(from, 1).getTime())).filter(
    (b) => b.firstDay <= wanted && b.lastDay >= wanted,
  );
}

/**
 * A block as it is now. A dialog holds on to the block it was opened for while
 * the calendars change under it (its colour is pinned, the feed is refreshed);
 * null once the event is gone.
 */
export function current(block: Block): Block | null {
  const from = startOfDay(block.start);
  const day = toBlocks(expand(doc.value, from.getTime(), addDays(from, 1).getTime(), true));
  return day.find((b) => b.key === block.key) ?? day.find((b) => b.parts.some((p) => p.key === block.head.key)) ?? null;
}

/** The window is too narrow for a sidebar beside the view; it opens over it instead. */
export const narrow = signal(false);
const sidebarOver = signal(false);
export const sidebarShown = computed(() => (narrow.value ? sidebarOver.value : !settings.value.sidebarCollapsed));

export function toggleSidebar(): void {
  if (narrow.value) sidebarOver.value = !sidebarOver.value;
  else setSettings({ sidebarCollapsed: !settings.value.sidebarCollapsed });
}

// dialogs: at most one of each, null when closed

/** The block whose details are shown. */
export const detail = signal<Block | null>(null);

export interface FormRequest {
  /** The event being edited; absent for a new one. */
  editing?: Instance;
  /** Where a new event starts. */
  start?: Date;
  end?: Date;
  allDay?: boolean;
}
export const form = signal<FormRequest | null>(null);
/** Calendar id being edited, or 'new'. */
export const calendarEditor = signal<string | null>(null);
export const searchOpen = signal(false);
export const settingsOpen = signal(false);
export const phoneExportOpen = signal(false);

export function closeDialogs(): void {
  detail.value = null;
  form.value = null;
  calendarEditor.value = null;
  searchOpen.value = false;
  settingsOpen.value = false;
  phoneExportOpen.value = false;
}

export function newEvent(start?: Date, end?: Date, allDay?: boolean): void {
  if (!doc.value.calendars.length) {
    calendarEditor.value = 'new';
    say(t('needCalendar'));
    return;
  }
  detail.value = null;
  form.value = { start, end, allDay };
}

// ---------------------------------------------------------------------------
// the "actual" lane
// ---------------------------------------------------------------------------

export const actual = signal<{ from: string; entries: ActualEntry[] }>({ from: '', entries: [] });

export async function loadActual(from: Date, days: number): Promise<void> {
  const key = `${ymd(from)}+${days}`;
  const entries = await backend.getActualRange(ymd(from), ymd(addDays(from, days - 1))).catch(() => []);
  actual.value = { from: key, entries };
}

// ---------------------------------------------------------------------------
// starting up
// ---------------------------------------------------------------------------

/** Read everything and keep it current. Resolves once the first picture can be drawn. */
export async function start(): Promise<void> {
  readSettings(await backend.loadSettings().catch(() => null));
  view.value = settings.value.view;
  await readTheme();

  const wanted = parseYmd(new URLSearchParams(location.search).get('date') ?? '');
  if (wanted) show('day', wanted);

  // Listening before the first read: a write that lands while starting up is then not missed.
  backend.on('calendars-changed', (theirs) => void reload(theirs));
  try {
    await read();
    refresh();
    // An older file is brought up to this version once, as a change like any other.
    if (migrate(base)) void apply((d) => migrate(d) ?? d);
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true);
  }
  loaded.value = true;

  backend.on('settings-changed', async () => {
    readSettings(await backend.loadSettings().catch(() => null));
    paint();
  });
  backend.on('theme-changed', () => void readTheme());
  backend.on('show-date', (date) => {
    const day = typeof date === 'string' ? parseYmd(date) : null;
    if (day) show('day', day);
  });
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', paint);
  const small = globalThis.matchMedia?.('(max-width: 900px)');
  if (small) {
    narrow.value = small.matches;
    small.addEventListener?.('change', () => (narrow.value = small.matches));
  }
  setInterval(() => (now.value = Date.now()), 30_000);
}

export { say };
