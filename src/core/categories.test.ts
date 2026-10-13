import { describe, expect, it } from 'vitest';
import { BUILT_IN, BUILT_IN_CATEGORIES, categoriesOf, categoryById, categoryId, categoryName, guessCategory } from './categories';
import { CATEGORY_PALETTE, contrast, textOn } from './colors';
import { calendar } from '../test/fixtures';

describe('the categories that come with the app', () => {
  it('each have a colour of their kind', () => {
    // Hue families, checked by which channel leads rather than by exact hex.
    const part = (id: string): number[] => {
      const hex = categoryById(BUILT_IN_CATEGORIES, id)!.color;
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };
    expect(part('tests')[0]).toBeGreaterThan(2 * part('tests')[1]); // red
    expect(part('school')[1]).toBeGreaterThan(part('school')[0]); // green
    expect(part('school-events')[1]).toBeGreaterThan(part('school')[1]); // a lighter green
    expect(part('trips')[0]).toBeGreaterThan(part('trips')[1]); // orange: red over green over blue
    expect(part('trips')[1]).toBeGreaterThan(part('trips')[2]);
    expect(Math.abs(part('holidays')[0] - part('holidays')[1])).toBeLessThan(50); // yellow: red and green together
    expect(part('holidays')[2]).toBeLessThan(120);
    expect(part('family')[2]).toBeGreaterThan(part('family')[0]); // light blue
  });

  it('are all different from one another, and from the colours offered for new ones', () => {
    const colours = [...BUILT_IN.map((c) => c.color), ...CATEGORY_PALETTE];
    expect(new Set(colours).size).toBe(colours.length);
    expect(new Set(BUILT_IN.map((c) => c.id)).size).toBe(BUILT_IN.length);
  });

  it('can carry readable text', () => {
    for (const c of BUILT_IN) expect(contrast(c.color, textOn(c.color)), c.id).toBeGreaterThan(4.5);
    for (const c of CATEGORY_PALETTE) expect(contrast(c, textOn(c)), c).toBeGreaterThan(4.5);
  });

  it('are named in the language of the interface', () => {
    const tests = categoryById(BUILT_IN_CATEGORIES, 'tests')!;
    expect([categoryName(tests, 'sk'), categoryName(tests, 'en')]).toEqual(['Testy', 'Tests']);
  });
});

describe("the user's own categories", () => {
  const own = { id: 'choir', name: 'Zbor', color: '#A374E0' };

  it('stand next to the ones that come with the app, named as written', () => {
    const all = categoriesOf({ categories: [own], calendars: [] });
    expect([...all.keys()]).toEqual([...BUILT_IN.map((c) => c.id), 'choir']);
    expect(all.get('choir')).toEqual({ id: 'choir', name: 'Zbor', color: '#a374e0', own: true });
    expect(categoryName(all.get('choir')!, 'en')).toBe('Zbor');
  });

  it('win over one that comes with the app when they use its id', () => {
    const all = categoriesOf({ categories: [{ id: 'tests', name: 'Skúšky', color: '#112233' }], calendars: [] });
    expect(all.get('tests')).toMatchObject({ name: 'Skúšky', color: '#112233' });
    expect(all.size).toBe(BUILT_IN.length);
  });

  it('are read from whatever is in the file, skipping what is not a category', () => {
    const odd = [null, 3, 'x', {}, { id: '' }, { id: 'a', color: 'red' }, { id: 'b', color: '#123456' }] as never;
    const all = categoriesOf({ categories: odd, calendars: [] });
    expect([...all.keys()].slice(BUILT_IN.length)).toEqual(['b']);
    expect(all.get('b')!.name).toBe('b');
    expect(categoriesOf({ categories: 'no' as never, calendars: [] }).size).toBe(BUILT_IN.length);
  });

  it('include a category only a calendar speaks of, named and coloured as that calendar', () => {
    const calendars = [
      calendar({ id: 'a', name: 'Šach', category: 'chess', color: '#6e4526', customColor: '#6e4526' }),
      calendar({ id: 'b', name: 'Šach – turnaje', category: 'chess', color: '#111111' }),
      calendar({ id: 'c', name: 'Bez farby', category: 'odd', color: 'teal' }),
      calendar({ id: 'd', name: 'Nič', category: '' }),
    ];
    const all = categoriesOf({ calendars });
    expect(all.get('chess')).toEqual({ id: 'chess', name: 'Šach', color: '#6e4526', own: true });
    expect(all.has('odd')).toBe(false);
    expect(all.has('')).toBe(false);
    // Once it is written down, the file's word counts.
    expect(categoriesOf({ categories: [{ id: 'chess', name: 'Šachy', color: '#2f55b0' }], calendars }).get('chess')).toMatchObject({ name: 'Šachy', color: '#2f55b0' });
  });

  it('get an id from their name that nothing else has', () => {
    const all = categoriesOf({ categories: [own], calendars: [] });
    expect(categoryId('Krúžok robotiky', all)).toBe('kruzok-robotiky');
    expect(categoryId('Tests', all)).toBe('tests-2');
    expect(categoryId('!!!', all)).toBe('category');
  });
});

describe('recognising a calendar by its name', () => {
  it.each([
    ['Testy', 'tests'],
    ['Školské akcie', 'school-events'],
    ['Trips', 'trips'],
    ['Výlety', 'trips'],
    ['Prááázdniny', 'holidays'],
    ['Prázdniny', 'holidays'],
    ['Rodinné', 'family'],
    ['Rozvrh hodín', 'school'],
    ['Školské predmety', 'school'],
  ])('%s is %s', (name, id) => {
    expect(guessCategory(name)?.id).toBe(id);
  });

  it("knows one of the user's own by its very name", () => {
    const all = categoriesOf({ categories: [{ id: 'choir', name: 'Zbor', color: '#a374e0' }], calendars: [] });
    expect(guessCategory('  ZBOR ', all)?.id).toBe('choir');
    expect(guessCategory('Zborovňa', all)).toBeNull();
    expect(guessCategory('Testy', all)?.id).toBe('tests');
  });

  it('leaves alone what it does not know', () => {
    expect(guessCategory('Kapela')).toBeNull();
    expect(guessCategory('')).toBeNull();
    expect(categoryById(BUILT_IN_CATEGORIES, 'nope')).toBeNull();
    expect(categoryById(BUILT_IN_CATEGORIES, undefined)).toBeNull();
  });
});
