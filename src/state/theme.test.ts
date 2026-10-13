import { describe, expect, it } from 'vitest';
import { contrast } from '../core/colors';
import { PIXEL_PALETTE } from '../platform/demo';
import { BUILT_IN, chooseTheme, themeFromPalette, themeMetrics, themeVariables } from './theme';

describe('the desktop palette', () => {
  const theme = themeFromPalette(PIXEL_PALETTE)!;

  it('becomes the pixel look: its colours and its bitmap font', () => {
    expect(theme.dark).toBe(true);
    expect(theme.pixel).toBe(true);
    expect(theme.colors).toMatchObject({ bg: '#000a07', bg1: '#0a1512', bg2: '#1a2320', line: '#585f5d', text: '#f0f0eb', accent: '#628790', accent2: '#a2cdc4', err: '#e5786d' });
    expect(theme.font).toBe('"Departure Mono Pixel", monospace');
    const vars = themeVariables(theme);
    expect(vars['--bw']).toBe('2px');
    // A bitmap font is only sharp at multiples of its grid.
    expect([vars['--fs'], vars['--fs-2'], vars['--fs-3']]).toEqual(['11px', '22px', '44px']);
    expect(vars['--lh']).toBe('14px');
    expect(themeMetrics(theme)).toEqual({ hour: 44, lane: 18, cellHead: 20, line: 14 });
  });

  it('keeps text readable on the accent', () => {
    expect(contrast(theme.colors.accent, theme.colors.accentText)).toBeGreaterThan(4.5);
    expect(contrast(theme.colors.bg, theme.colors.text2)).toBeGreaterThan(7);
  });

  it('fills in what a smaller palette leaves out', () => {
    const small = themeFromPalette({ path: 'x', values: { background: '#ffffff', foreground: '#111111', accent: '#3355ff' } })!;
    expect(small.dark).toBe(false);
    expect(small.pixel).toBe(false);
    expect(small.font).toBeNull();
    expect(small.size).toBe(13);
    for (const colour of Object.values(small.colors)) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is refused when it is not a palette', () => {
    expect(themeFromPalette(null)).toBeNull();
    expect(themeFromPalette({ path: 'x', values: { background: '#000000' } })).toBeNull();
    expect(themeFromPalette({ path: 'x', values: { background: 'black', foreground: '#ffffff', accent: '#ffffff' } })).toBeNull();
  });

  it('cannot smuggle anything into the font stack', () => {
    const odd = themeFromPalette({ path: 'x', values: { ...PIXEL_PALETTE.values, font: 'A"; background: url(x)' } })!;
    expect(odd.font).toBe('"A; background: url(x)", monospace');
  });
});

describe('corners', () => {
  it('are rounded in every look, the pixel one included', () => {
    for (const theme of [themeFromPalette(PIXEL_PALETTE)!, BUILT_IN.dark, BUILT_IN.light]) {
      const vars = themeVariables(theme);
      const px = (name: string): number => Number.parseInt(vars[name], 10);
      expect(px('--radius-s')).toBeGreaterThan(0);
      expect(px('--radius')).toBeGreaterThan(px('--radius-s'));
      expect(px('--radius-l')).toBeGreaterThan(px('--radius'));
    }
  });
});

describe('choosing a theme', () => {
  it('follows the setting, then the desktop, then light or dark', () => {
    expect(chooseTheme('dark', PIXEL_PALETTE, false)).toBe(BUILT_IN.dark);
    expect(chooseTheme('light', PIXEL_PALETTE, false)).toBe(BUILT_IN.light);
    expect(chooseTheme('system', PIXEL_PALETTE, false).pixel).toBe(true);
    expect(chooseTheme('system', null, false)).toBe(BUILT_IN.dark);
    expect(chooseTheme('system', null, true)).toBe(BUILT_IN.light);
  });

  it('gives the built-in looks readable text too', () => {
    for (const theme of Object.values(BUILT_IN)) {
      expect(contrast(theme.colors.bg, theme.colors.text)).toBeGreaterThan(10);
      expect(contrast(theme.colors.bg, theme.colors.text2)).toBeGreaterThan(4.5);
      expect(contrast(theme.colors.accent, theme.colors.accentText)).toBeGreaterThan(4);
    }
  });
});
