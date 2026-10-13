// Everything the interface needs from outside the page: files, windows, the
// desktop's palette. In the app that is the Rust shell (src-tauri); in a plain
// browser (npm run dev, tests) a stand-in keeps the same promises with
// localStorage, so the whole interface can be worked on without building the shell.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface Loaded {
  text: string | null;
  version: string | null;
}

export interface Saved {
  /** False when the file changed since the version the save was made from. */
  ok: boolean;
  version: string | null;
}

export interface Palette {
  path: string;
  values: Record<string, string>;
}

/** One stretch of real activity from the `actually` tracker. */
export interface ActualEntry {
  uid: string;
  blockId: number | null;
  start: string;
  end: string;
  title: string;
  description: string;
  category: string;
  project: string | null;
  color: string | null;
  confidence: number;
  activeSeconds: number;
  switches: number;
  focusRatio: number;
  evidence: { app: string; what: string; s: number }[];
}

export interface NamedText {
  name: string;
  text: string;
}

export type BackendEvent =
  | 'calendars-changed'
  | 'settings-changed'
  | 'theme-changed'
  | 'actual-changed'
  | 'popup-opened'
  | 'show-date';

export interface Backend {
  /** Running inside the app rather than a browser tab. */
  readonly native: boolean;
  loadCalendars(): Promise<Loaded>;
  saveCalendars(text: string, expected: string | null): Promise<Saved>;
  loadSettings(): Promise<string | null>;
  saveSettings(text: string): Promise<void>;
  dataPath(): Promise<string>;
  getTheme(): Promise<Palette | null>;
  /** Tell the shell the pixel look is on, so it draws text on whole pixels. */
  setPixelText(on: boolean): Promise<void>;
  getActualRange(from: string, to: string): Promise<ActualEntry[]>;
  fetchUrl(url: string): Promise<string>;
  openUrl(url: string): Promise<void>;
  pickIcsFiles(): Promise<NamedText[]>;
  /** Resolves to where it was saved, or null when cancelled. */
  saveTextFile(name: string, extension: string, description: string, text: string): Promise<string | null>;
  saveFilesInFolder(files: NamedText[], extension: string): Promise<string | null>;
  showMain(date?: string): Promise<void>;
  hidePopup(): Promise<void>;
  resizePopup(height: number): Promise<void>;
  on(event: BackendEvent, handler: (payload: unknown) => void): () => void;
}

const shell: Backend = {
  native: true,
  loadCalendars: () => invoke('load_calendars'),
  saveCalendars: (text, expected) => invoke('save_calendars', { text, expected }),
  loadSettings: () => invoke('load_settings'),
  saveSettings: (text) => invoke('save_settings', { text }),
  dataPath: () => invoke('data_path'),
  getTheme: () => invoke('get_theme'),
  setPixelText: (on) => invoke('set_pixel_text', { on }),
  getActualRange: (from, to) => invoke('get_actual_range', { from, to }),
  fetchUrl: (url) => invoke('fetch_url', { url }),
  openUrl: (url) => invoke('open_url', { url }),
  pickIcsFiles: () => invoke('pick_ics_files'),
  saveTextFile: (name, extension, description, text) => invoke('save_text_file', { name, extension, description, text }),
  saveFilesInFolder: (files, extension) => invoke('save_files_in_folder', { files, extension }),
  showMain: (date) => invoke('show_main', { date: date ?? null }),
  hidePopup: () => invoke('hide_popup'),
  resizePopup: (height) => invoke('resize_popup', { height }),
  on(event, handler) {
    const stop = listen(event, (e) => handler(e.payload));
    return () => void stop.then((unlisten) => unlisten());
  },
};

// ---------------------------------------------------------------------------
// the stand-in
// ---------------------------------------------------------------------------

const KEY = 'kalendarix:calendars';
const SETTINGS_KEY = 'kalendarix:settings';

/** Change the text into a version stamp: the stand-in has no modification time. */
function stamp(text: string | null): string | null {
  if (text === null) return null;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return `${text.length}-${h}`;
}

function download(name: string, text: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function pickFiles(): Promise<NamedText[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name.replace(/\.ics$/i, ''), text: await f.text() }))));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function standIn(): Backend {
  const handlers = new Map<BackendEvent, Set<(payload: unknown) => void>>();
  const emit = (event: BackendEvent, payload?: unknown): void => handlers.get(event)?.forEach((h) => h(payload));
  // Another tab of the stand-in is "another program writing the file".
  globalThis.addEventListener?.('storage', (e) => {
    if (e.key === KEY) emit('calendars-changed', stamp(e.newValue));
    if (e.key === SETTINGS_KEY) emit('settings-changed');
  });
  return {
    native: false,
    async loadCalendars() {
      let text = localStorage.getItem(KEY);
      if (text === null && new URLSearchParams(location.search).get('demo') !== '0') {
        text = JSON.stringify((await import('./demo')).demoCalendars(), null, 2);
        localStorage.setItem(KEY, text);
      }
      return { text, version: stamp(text) };
    },
    async saveCalendars(text, expected) {
      const current = stamp(localStorage.getItem(KEY));
      if (current !== expected) return { ok: false, version: current };
      localStorage.setItem(KEY, text);
      return { ok: true, version: stamp(text) };
    },
    async loadSettings() {
      return localStorage.getItem(SETTINGS_KEY);
    },
    async saveSettings(text) {
      localStorage.setItem(SETTINGS_KEY, text);
    },
    async dataPath() {
      return 'localStorage';
    },
    async getTheme() {
      const theme = new URLSearchParams(location.search).get('theme');
      return theme === 'pixel' ? (await import('./demo')).PIXEL_PALETTE : null;
    },
    async setPixelText() {},
    async getActualRange(from, to) {
      return new URLSearchParams(location.search).has('actual') ? (await import('./demo')).demoActual(from, to) : [];
    },
    async fetchUrl(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    async openUrl(url) {
      window.open(url, '_blank', 'noopener');
    },
    pickIcsFiles: pickFiles,
    async saveTextFile(name, extension, _description, text) {
      download(`${name}.${extension}`, text);
      return `${name}.${extension}`;
    },
    async saveFilesInFolder(files, extension) {
      for (const file of files) download(`${file.name}.${extension}`, file.text);
      return 'Downloads';
    },
    async showMain(date) {
      location.href = date ? `index.html?date=${date}` : 'index.html';
    },
    async hidePopup() {},
    async resizePopup() {},
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(handler);
      return () => void set.delete(handler);
    },
  };
}

export const backend: Backend = '__TAURI_INTERNALS__' in globalThis ? shell : standIn();
