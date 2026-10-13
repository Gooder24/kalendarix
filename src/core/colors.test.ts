import { describe, expect, it } from 'vitest';
import { ACCENT_PALETTE, autoAccents, calendarColor, eventAccent, eventColor, mix, textOn, titleKey } from './colors';
import { BUILT_IN_CATEGORIES as B } from './categories';
import { calendar, event, at } from '../test/fixtures';

const lesson = (title: string, extra = {}): ReturnType<typeof event> =>
  event({ uid: title, title, start: at(2026, 10, 12, 8), end: at(2026, 10, 12, 9), ...extra });

describe('first colour', () => {
  it('is the category colour whenever there is a category', () => {
    expect(calendarColor(calendar({ id: 'a', name: 'x', category: 'tests', color: '#111111', customColor: '#222222' }), B)).toBe('#e5584f');
  });

  it('falls back to the calendar own colour', () => {
    expect(calendarColor(calendar({ id: 'a', name: 'x', color: '#a2cdc4' }), B)).toBe('#a2cdc4');
    expect(calendarColor(calendar({ id: 'a', name: 'x', color: '#a2cdc4', customColor: '#ff9500' }), B)).toBe('#ff9500');
    expect(calendarColor(calendar({ id: 'a', name: 'x', color: 'teal', category: 'unknown' }), B)).toBe('#628790');
  });

  it('lets one event belong to another category than its calendar', () => {
    const school = calendar({ id: 'a', name: 'x', category: 'school' });
    expect(eventColor(school, lesson('Matematika'), B)).toBe('#4fae6b');
    expect(eventColor(school, lesson('Písomka', { category: 'tests' }), B)).toBe('#e5584f');
    expect(eventColor(school, lesson('Matematika', { category: 'nonsense' }), B)).toBe('#4fae6b');
  });
});

describe('second colour', () => {
  const subjects = ['Matematika', 'Fyzika', 'Slovenský jazyk a literatúra', 'Anglický jazyk', 'Dejepis', 'Biológia', 'Chémia', 'Informatika', 'Telesná výchova', 'Geografia'];
  const school = calendar({ id: 'a', name: 'x', category: 'school', autoAccent: true, events: subjects.map((s) => lesson(s)) });

  it('gives every subject its own colour', () => {
    const auto = autoAccents(school, B);
    const colours = subjects.map((s) => auto.get(titleKey(s)));
    expect(colours.every(Boolean)).toBe(true);
    expect(new Set(colours).size).toBe(subjects.length);
  });

  it('gives a cancelled lesson the colour of its subject', () => {
    const auto = autoAccents(school, B);
    expect(eventAccent(school, lesson('Zrušené: Matematika'), auto)).toBe(auto.get(titleKey('Matematika')));
  });

  it('never repeats the first colour', () => {
    for (const colour of autoAccents(school, B).values()) expect(colour).not.toBe(calendarColor(school, B));
  });

  it('does not depend on the order of the events', () => {
    const reversed = { ...school, events: [...school.events].reverse() };
    expect([...autoAccents(reversed, B)].sort()).toEqual([...autoAccents(school, B)].sort());
  });

  it('prefers the feed, then the pinned colour, then the automatic one', () => {
    const auto = autoAccents(school, B);
    const pinned = { ...school, accents: { matematika: '#123456' } };
    expect(eventAccent(pinned, lesson('Matematika', { accent: '#ABCDEF' }), auto)).toBe('#abcdef');
    expect(eventAccent(pinned, lesson('Matematika'), auto)).toBe('#123456');
    expect(eventAccent(school, lesson('Matematika'), auto)).toBe(auto.get('matematika'));
    expect(eventAccent({ ...school, autoAccent: false }, lesson('Matematika'), null)).toBeNull();
    expect(eventAccent(school, lesson('Matematika', { accent: 'red' }), null)).toBeNull();
  });

  it('still colours when there are more titles than colours', () => {
    const many = Array.from({ length: ACCENT_PALETTE.length * 2 + 3 }, (_, i) => lesson(`Predmet ${i}`));
    const auto = autoAccents({ ...school, events: many }, B);
    expect(auto.size).toBe(many.length);
  });
});

describe('helpers', () => {
  it('pick readable text and mix solid colours', () => {
    expect(textOn('#f2d14e')).toBe('#000000');
    expect(textOn('#2f55b0')).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#000a07', '#f0f0eb', 0)).toBe('#000a07');
  });
});
