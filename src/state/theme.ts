// How the app looks. A theme is a handful of colours, a font and three numbers;
// the stylesheet (styles/app.css) is written against the CSS variables set here
// and against nothing else.
//
// With a desktop palette (Omarchy's, or a colors.toml of one's own) the app
// wears it. A palette that names a bitmap font is a pixel desktop's: one font
// at multiples of its grid, two-pixel borders, and nothing that fades or
// moves. That is the "pixel" look. Corners are
// rounded in every look, the pixel one included.

import { contrast, isHex, luminance, mix } from '../core/colors';
import type { Palette } from '../platform/backend';

export interface Theme {
  dark: boolean;
  /** Bitmap font, pixel icons and two-pixel borders, as on a pixel desktop. */
  pixel: boolean;
  colors: {
    /** Window, panel, button, and what the pointer is on: four steps up. */
    bg: string; bg1: string; bg2: string; bg3: string;
    /** Borders and switched-off things. */
    line: string;
    text: string; text2: string; text3: string;
    /** The accent as a fill, and what is written on it. */
    accent: string; accentText: string;
    /** The accent as a colour of text: what is on, where you are. */
    accent2: string;
    warn: string; err: string;
  };
  font: string | null;
  /** Base text size in pixels; headings are twice and four times it on a pixel desktop. */
  size: number;
}

const DARK: Theme = {
  dark: true,
  pixel: false,
  colors: {
    bg: '#15171a', bg1: '#1b1e22', bg2: '#24282d', bg3: '#2e333a', line: '#3b424b',
    text: '#eceef1', text2: '#a9b0ba', text3: '#737c88',
    accent: '#3b6fd9', accentText: '#ffffff', accent2: '#8fb4ff', warn: '#e2b05c', err: '#e5786d',
  },
  font: null,
  size: 13,
};

const LIGHT: Theme = {
  dark: false,
  pixel: false,
  colors: {
    bg: '#ffffff', bg1: '#f6f7f9', bg2: '#eceef2', bg3: '#e0e3e9', line: '#cfd4dc',
    text: '#1c2026', text2: '#5b6470', text3: '#8a929e',
    accent: '#2f6fe4', accentText: '#ffffff', accent2: '#1f58c2', warn: '#9a6a12', err: '#c4392d',
  },
  font: null,
  size: 13,
};

export const BUILT_IN = { dark: DARK, light: LIGHT } as const;

/** A theme out of the desktop's colors.toml, or null when it is not a usable palette. */
export function themeFromPalette(palette: Palette | null): Theme | null {
  const v = palette?.values;
  if (!v || !isHex(v.background) || !isHex(v.foreground) || !isHex(v.accent)) return null;
  const bg = v.background;
  const text = v.foreground;
  const bg2 = isHex(v.lighter_background) ? v.lighter_background : mix(bg, text, 0.1);
  const size = Number.parseInt(v.font_size ?? '', 10);
  const pixel = /pixel/i.test(v.icons ?? '') || /pixel/i.test(v.font ?? '');
  const accentText = contrast(v.accent, bg) >= contrast(v.accent, text) ? bg : text;
  return {
    dark: v.mode ? v.mode === 'dark' : luminance(bg) < luminance(text),
    pixel,
    colors: {
      bg,
      bg1: isHex(v.dark_background) ? v.dark_background : mix(bg, text, 0.04),
      bg2,
      bg3: mix(bg2, text, 0.06),
      line: isHex(v.selection) ? v.selection : mix(bg, text, 0.3),
      text,
      text2: mix(bg, text, 0.75),
      text3: mix(bg, text, 0.5),
      accent: v.accent,
      accentText,
      accent2: isHex(v.green) ? v.green : mix(v.accent, text, 0.4),
      warn: isHex(v.yellow) ? v.yellow : text,
      err: isHex(v.red) ? v.red : text,
    },
    font: v.font ? `"${v.font.replace(/["\\]/g, '')}", monospace` : null,
    size: size >= 8 && size <= 24 ? size : pixel ? 11 : 13,
  };
}

/** The theme to use for a setting and whatever the desktop offers. */
export function chooseTheme(appearance: 'system' | 'dark' | 'light', palette: Palette | null, prefersLight: boolean): Theme {
  if (appearance === 'dark') return DARK;
  if (appearance === 'light') return LIGHT;
  return themeFromPalette(palette) ?? (prefersLight ? LIGHT : DARK);
}

/** Sizes the grids are computed from, in pixels; the stylesheet gets the same numbers. */
export interface Metrics {
  /** Height of one hour in the day and week views. */
  hour: number;
  /** Height of one line of events in a row of days. */
  lane: number;
  /** Height of the day number above those lines. */
  cellHead: number;
  /** Height of a line of wrapped text. */
  line: number;
}

export function themeMetrics(theme: Theme): Metrics {
  const line = Math.round(theme.size * (theme.pixel ? 14 / 11 : 1.45));
  return theme.pixel
    ? { hour: theme.size * 4, lane: theme.size + 7, cellHead: theme.size + 9, line }
    : { hour: 48, lane: theme.size + 9, cellHead: theme.size + 13, line };
}

/** The CSS variables a theme stands for. */
export function themeVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  const px = (n: number): string => `${n}px`;
  const m = themeMetrics(theme);
  return {
    '--bg': c.bg, '--bg-1': c.bg1, '--bg-2': c.bg2, '--bg-3': c.bg3, '--line': c.line,
    '--text': c.text, '--text-2': c.text2, '--text-3': c.text3,
    '--accent': c.accent, '--accent-text': c.accentText, '--accent-2': c.accent2,
    '--warn': c.warn, '--err': c.err,
    // Weekend and "other month" cells: a step that is there but does not shout.
    '--bg-dim': mix(c.bg, c.bg1, 0.6),
    '--font': theme.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
    '--fs': px(theme.size),
    // A bitmap font is sharp only at multiples of its grid.
    '--fs-2': px(theme.pixel ? theme.size * 2 : Math.round(theme.size * 1.4)),
    '--fs-3': px(theme.pixel ? theme.size * 4 : Math.round(theme.size * 2.2)),
    '--lh': px(m.line),
    // Everything drawn is rounded, in both looks: controls, the small things inside them, and what floats
    // over the rest. (The pixel desktop draws its own panels square; this app, by its owner's wish, does not.)
    '--radius': '10px',
    '--radius-s': '6px',
    '--radius-l': '14px',
    '--bw': theme.pixel ? '2px' : '1px',
    '--row': px(theme.pixel ? 32 : 30),
    '--lane': px(m.lane),
    '--cell-head': px(m.cellHead),
    '--hour': px(m.hour),
  };
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
  root.dataset.theme = theme.dark ? 'dark' : 'light';
  root.dataset.look = theme.pixel ? 'pixel' : 'smooth';
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}
