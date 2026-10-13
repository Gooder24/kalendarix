// The store against the browser stand-in: localStorage plays the file, and a
// write to it from outside plays the other programs that share calendars.json.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvent, deleteEvent } from '../core/document';
import { legacyDoc } from '../test/fixtures';

const KEY = 'kalendarix:calendars';
const stored = (): { schema?: number; calendars: { id: string; name: string; category?: string; events: { uid: string; title: string }[] }[] } =>
  JSON.parse(localStorage.getItem(KEY)!);
const titles = (): string[] => stored().calendars.flatMap((c) => c.events.map((e) => e.title));
const draft = (title: string) => ({
  title, start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 15), allDay: false, location: '', notes: '', rrule: null, alarmMinutes: '' as const,
});

/** A fresh copy of the store: it keeps its state in the module. */
async function load() {
  vi.resetModules();
  return import('./store');
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/?demo=0');
});

describe('starting up', () => {
  it('brings an older file up to date once, and writes it', async () => {
    localStorage.setItem(KEY, JSON.stringify(legacyDoc(), null, 2));
    const store = await load();
    await store.start();
    await vi.waitFor(() => expect(stored().schema).toBe(2));
    expect(stored().calendars.find((c) => c.name === 'Výlety')!.category).toBe('trips');
    expect(stored().calendars.find((c) => c.name === 'Šport')!.category).toBeUndefined();
    expect(store.categories.value.get('trips')!.color).toBe('#f0913a');
    expect(store.loaded.value).toBe(true);
  });

  it('writes nothing when there is nothing to change', async () => {
    const store = await load();
    await store.start();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(store.doc.value.calendars).toEqual([]);
  });

  it('never saves over a file it could not read', async () => {
    localStorage.setItem(KEY, '{"calendars": [ half a file');
    const store = await load();
    await store.start();
    expect(store.notice.value?.bad).toBe(true);
    await store.apply(addEvent('nowhere', draft('lost')));
    expect(localStorage.getItem(KEY)).toBe('{"calendars": [ half a file');
  });

  it('never saves over JSON that is not a calendar file', async () => {
    for (const foreign of ['[1, 2, 3]', '{"calendars": {"not": "a list"}}']) {
      localStorage.setItem(KEY, foreign);
      const store = await load();
      await store.start();
      expect(store.notice.value?.bad).toBe(true);
      await store.apply(addEvent('nowhere', draft('lost')));
      expect(localStorage.getItem(KEY)).toBe(foreign);
    }
  });

  it('opens on the day it was asked for', async () => {
    history.replaceState(null, '', '/?demo=0&date=2026-10-23');
    const store = await load();
    await store.start();
    expect(store.view.value).toBe('day');
    expect(new Date(store.cursor.value).getDate()).toBe(23);
  });
});

describe('changing the calendars', () => {
  async function started() {
    localStorage.setItem(KEY, JSON.stringify(legacyDoc(), null, 2));
    const store = await load();
    await store.start();
    await vi.waitFor(() => expect(stored().schema).toBe(2));
    return store;
  }

  it('shows a change at once and then writes it', async () => {
    const store = await started();
    const saving = store.apply(addEvent('c-tests', draft('Písomka')));
    expect(store.doc.value.calendars.find((c) => c.id === 'c-tests')!.events.map((e) => e.title)).toEqual(['Písomka']);
    await saving;
    expect(titles()).toContain('Písomka');
  });

  it('writes several quick changes without losing one', async () => {
    const store = await started();
    await Promise.all(['a', 'b', 'c'].map((title) => store.apply(addEvent('c-tests', draft(title)))));
    expect(titles()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('makes the change again on the new file when another program got there first', async () => {
    const store = await started();
    // The timetable sync replaces its events while the app is open, and the app has not noticed yet.
    const theirs = stored();
    theirs.calendars.find((c) => c.id === 'timetable-school')!.events.push({ uid: '2026-10-20-0@timetable', title: 'Nová hodina' } as never);
    localStorage.setItem(KEY, JSON.stringify(theirs, null, 2));

    await store.apply(addEvent('c-tests', draft('Moja udalosť')));
    expect(titles()).toEqual(expect.arrayContaining(['Nová hodina', 'Moja udalosť']));
    expect(store.doc.value.calendars.find((c) => c.id === 'timetable-school')!.events.some((e) => e.title === 'Nová hodina')).toBe(true);
    expect(store.notice.value?.bad).not.toBe(true);
  });

  it('refuses a change that cannot be made, and goes on working', async () => {
    const store = await started();
    await store.apply(() => {
      throw new Error('Invalid time value');
    });
    expect(store.notice.value?.bad).toBe(true);
    await store.apply(addEvent('c-tests', draft('Po chybe')));
    expect(titles()).toContain('Po chybe');
  });

  it('does not write when a change changes nothing', async () => {
    const store = await started();
    const before = localStorage.getItem(KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    await store.apply(deleteEvent('c-tests', 'no-such-event'));
    expect(spy).not.toHaveBeenCalledWith(KEY, expect.anything());
    expect(localStorage.getItem(KEY)).toBe(before);
    spy.mockRestore();
  });

  it('keeps the settings of other versions when it saves its own', async () => {
    localStorage.setItem('kalendarix:settings', JSON.stringify({ theme: 'gruvbox', apiKey: '', lang: 'en', walkPlaces: [1] }));
    const store = await started();
    expect(store.settings.value.lang).toBe('en');
    store.setSettings({ dualFill: 'accent' });
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('kalendarix:settings')!).dualFill).toBe('accent'));
    expect(JSON.parse(localStorage.getItem('kalendarix:settings')!)).toMatchObject({ theme: 'gruvbox', walkPlaces: [1], lang: 'en' });
  });
});

describe('moving around', () => {
  it('steps by what the view shows and covers whole weeks in a month', async () => {
    const store = await load();
    await store.start();
    store.show('month', new Date(2026, 9, 12));
    const [from, to] = store.range.value;
    expect([new Date(from).getDate(), new Date(to).getDate()]).toEqual([28, 2]); // 28 September to 1 November, end exclusive
    store.step(1);
    expect(new Date(store.cursor.value).getMonth()).toBe(10);
    store.show('week', new Date(2026, 9, 14));
    expect(new Date(store.range.value[0]).getDate()).toBe(12);
    store.step(-1);
    expect(new Date(store.cursor.value).getDate()).toBe(7);
    store.show('day');
    store.step(1);
    expect(new Date(store.cursor.value).getDate()).toBe(8);
    store.show('year');
    store.step(1);
    expect(new Date(store.cursor.value).getFullYear()).toBe(2027);
  });
});
