// Accessibility checks in a real browser, against the stand-in backend (as npm run
// e2e does): axe-core on each main state in the light and the dark scheme, and a
// walk through the core flows with the keyboard alone. No request leaves the
// server the app is served from: any other request is refused, and that fails the run.
//
//   npm run dev &                        # or: npx vite build && npx vite preview --port 1420
//   npm run a11y                         # node runs this file as it is
//   npm run a11y -- --update-baseline    # records the axe problems there are now
//
// KX_URL      where the app is served (default http://127.0.0.1:1420)
// CHROMIUM    a Chromium to drive instead of the one playwright-core installed
//
// axe problems that are already known are counted per state and rule in
// .github/a11y-axe-baseline.json and do not fail the run; a count above it does.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

const URL_BASE = process.env.KX_URL ?? 'http://127.0.0.1:1420';
const ORIGIN = new URL(URL_BASE).origin;
const BASELINE = new URL('../.github/a11y-axe-baseline.json', import.meta.url);
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
// Monday 12 October 2026: the sample calendars are built around "today".
const NOW = new Date('2026-10-12T10:00:00+02:00');
const SIZE = { width: 1366, height: 728 };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const TAB_LIMIT = 200;

interface AxeGlobal { run(context: Document, options: object): Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> }
interface Session { page: Page; context: BrowserContext; errors: string[]; leaks: string[] }

const results: string[] = [];
let failures = 0;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });

/** A fresh browser context on a page of the app, with everything outside the local server refused. */
async function open(path: string, ready: string, scheme: 'dark' | 'light'): Promise<Session> {
  const context = await browser.newContext({ viewport: path === 'popup.html' ? { width: 360, height: 650 } : SIZE, timezoneId: 'Europe/Bratislava', locale: 'sk-SK', deviceScaleFactor: 1, colorScheme: scheme });
  const leaks: string[] = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === ORIGIN) return route.continue();
    leaks.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  await page.goto(`${URL_BASE}/${path}`);
  await page.waitForSelector(ready);
  return { page, context, errors, leaks };
}

/** One check on a fresh session: a failure is reported and the other checks still run. */
async function session(name: string, path: string, ready: string, body: (s: Session) => Promise<void>, scheme: 'dark' | 'light' = 'dark'): Promise<void> {
  try {
    const s = await open(path, ready, scheme);
    try {
      await body(s);
      check(s.errors.length === 0, `errors on the page: ${s.errors.join(' | ')}`);
      check(s.leaks.length === 0, `requests outside ${ORIGIN}: ${s.leaks.join(' | ')}`);
    } finally {
      await s.context.close();
    }
    results.push(`ok    ${name}`);
  } catch (error) {
    failures++;
    // Playwright puts what it was waiting for on a line of its own, after the first.
    const lines = (error instanceof Error ? error.message : String(error)).split('\n').map((l) => l.trim());
    const waiting = lines.find((l) => l.startsWith('- waiting for'));
    results.push(`FAIL  ${name}: ${lines[0]}${waiting ? ` (${waiting.slice(2)})` : ''}`);
  }
}

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

/** What the focused element is called: its label, else its title, else its text. */
const activeName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return [el.getAttribute('aria-label'), el.title, el.textContent].map((s) => s?.trim()).find(Boolean) ?? '';
  });

const focusVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });

/** Presses Tab until the focused element matches the selector and its name contains the text. */
async function tabTo(page: Page, selector: string, name: string): Promise<void> {
  for (let i = 0; i < TAB_LIMIT; i++) {
    const here = await page.evaluate(([sel, text]) => {
      const el = document.activeElement as HTMLElement | null;
      return !!el?.matches(sel) && (el.getAttribute('aria-label') ?? el.textContent ?? '').includes(text);
    }, [selector, name] as const);
    if (here) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached "${name}" (${selector})`);
}

// --- automated: axe-core on each main state, in both schemes -----------------------------

const STATES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'month', open: async () => {} },
  { name: 'week', open: async (p) => { await p.keyboard.press('w'); await p.waitForSelector('.tg'); } },
  { name: 'day', open: async (p) => { await p.keyboard.press('d'); await p.waitForSelector('.dayview'); } },
  { name: 'year', open: async (p) => { await p.keyboard.press('y'); await p.waitForSelector('.year'); } },
  { name: 'new event', open: async (p) => { await p.keyboard.press('m'); await p.keyboard.press('n'); await p.waitForSelector('.dialog.form'); } },
  { name: 'search', open: async (p) => { await p.keyboard.press('Control+k'); await p.waitForSelector('.search-input'); } },
  { name: 'search results', open: async (p) => { await p.keyboard.press('Control+k'); await p.waitForSelector('.search-input'); await p.locator('.search-input').fill('pisomka'); await p.waitForSelector('.search-results button'); } },
  { name: 'settings', open: async (p) => { await p.locator('button[aria-label="Nastavenia"]').click(); await p.waitForSelector('.own-category'); } },
];

/**
 * What axe finds, counted per "state | rule" (state includes the scheme). The baseline
 * stores these counts, not axe's element selectors: a selector such as
 * `.card:nth-child(4)` changes when an unrelated element is added, a count does not.
 * The elements are kept only for the report.
 */
const problems = new Map<string, { help: string; targets: string[] }>();
async function scan(page: Page, state: string): Promise<void> {
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async (tags) => {
    const { axe } = window as unknown as { axe: AxeGlobal };
    const run = await axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return run.violations.map((v) => ({ id: v.id, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
  }, TAGS);
  for (const v of violations) problems.set(`${state} | ${v.id}`, { help: v.help, targets: v.targets });
}

for (const scheme of ['dark', 'light'] as const) {
  await session(`axe, ${scheme} scheme: ${STATES.length} states`, 'index.html', '.toolbar', async (s) => {
    for (const state of STATES) {
      await s.page.keyboard.press('m');
      await s.page.waitForSelector('.month');
      await state.open(s.page);
      await scan(s.page, `${scheme} ${state.name}`);
      if ((await s.page.locator('.overlay').count()) > 0) await s.page.keyboard.press('Escape');
      await s.page.waitForSelector('.overlay', { state: 'detached' });
    }
  }, scheme);
}
for (const scheme of ['dark', 'light'] as const) await session(`axe, ${scheme} popup (small calendar)`, 'popup.html', '.popup', async (s) => {
  await scan(s.page, `${scheme} popup`);
}, scheme);

const known: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const counts = Object.fromEntries([...problems.keys()].sort().map((k) => [k, problems.get(k)!.targets.length]));
const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
if (process.argv.includes('--update-baseline')) {
  // A state that failed to open would leave its problems out, so nothing is written then.
  if (failures) results.push('baseline not written: a check failed above');
  else {
    writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n', 'utf8');
    results.push(`baseline: ${total(counts)} known axe problem(s) in ${Object.keys(counts).length} state/rule pair(s) written to .github/a11y-axe-baseline.json`);
  }
} else {
  const fixedRules = new Set(['color-contrast', 'target-size', 'nested-interactive', 'label-content-name-mismatch', 'heading-order', 'page-has-heading-one', 'landmark-no-duplicate-banner', 'landmark-unique', 'landmark-one-main', 'region', 'aria-input-field-name']);
  const worse = Object.keys(counts).filter((k) => counts[k] > (fixedRules.has(k.split(' | ')[1]) ? 0 : (known[k] ?? 0)));
  const better = Object.keys(known).filter((k) => (counts[k] ?? 0) < known[k]);
  results.push(`axe: ${total(counts)} problem(s), baseline ${total(known)}, ${worse.length} state/rule pair(s) above the baseline` +
    (better.length ? `; ${better.length} pair(s) below it: run with --update-baseline` : ''));
  for (const k of worse) {
    const { help, targets } = problems.get(k)!;
    failures++;
    results.push(`FAIL  new axe problem: ${k}: ${counts[k]} element(s), baseline ${known[k] ?? 0} (${help}): ${targets.join(', ')}`);
  }
}

// --- keyboard only: the core flows, with the mouse never touched -------------------------

await session('keyboard: every toolbar control is reached by Tab, with a visible focus', 'index.html', '.toolbar', async ({ page }) => {
  const expected = ['Bočný panel', 'Dnes', 'Späť', 'Ďalej', 'Deň', 'Týždeň', 'Mesiac', 'Rok', 'Hľadať (Ctrl+K)', 'Nová udalosť', 'Nastavenia'];
  const reached = new Map<string, boolean>();
  for (let i = 0; i < 30 && reached.size < expected.length; i++) {
    await page.keyboard.press('Tab');
    const name = await activeName(page);
    if (expected.includes(name)) reached.set(name, await focusVisible(page));
  }
  const missing = expected.filter((name) => !reached.has(name));
  check(missing.length === 0, `not reached by Tab: ${missing.join(', ')}`);
  const hidden = [...reached].filter(([, visible]) => !visible).map(([name]) => name);
  check(hidden.length === 0, `no visible focus on: ${hidden.join(', ')}`);
});

await session('keyboard: the shortcuts switch views, move in time and go back to today', 'index.html', '.toolbar', async ({ page }) => {
  const view = () => page.locator('.view').getAttribute('data-view');
  const title = () => page.locator('.toolbar-title').innerText();
  const start = await title();
  for (const [key, expected] of [['d', 'day'], ['w', 'week'], ['y', 'year'], ['m', 'month']] as const) {
    await page.keyboard.press(key);
    check((await view()) === expected, `"${key}" shows the ${expected} view, found ${await view()}`);
  }
  await page.keyboard.press('ArrowRight');
  check((await title()) !== start, 'the arrow key moves on in time');
  await page.keyboard.press('t');
  check((await title()) === start, '"t" brings back today');
});

await session('keyboard: an event is made and saved without the mouse', 'index.html', '.toolbar', async ({ page }) => {
  await page.keyboard.press('n');
  // The dialog takes the focus a moment after it is drawn: type only once it has it.
  await page.waitForFunction(() => document.activeElement?.classList.contains('form-title') === true);
  await page.keyboard.type('Test z klávesnice');
  await tabTo(page, '.dialog button.btn.primary', 'Uložiť');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.dialog', { state: 'detached' });
  check((await page.locator('.chip', { hasText: 'Test z klávesnice' }).count()) === 1, 'the event is in the month');
});

await session('keyboard: search opens an event, Escape closes it and Tab goes on to the page', 'index.html', '.toolbar', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.activeElement?.classList.contains('search-input') === true);
  await page.keyboard.type('pisomka');
  await page.waitForSelector('.search-results button');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.dialog.detail');
  check((await page.locator('.dialog.detail h2').innerText()) === 'Písomka z matematiky', 'Enter opens the event that was found');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay', { state: 'detached' });
  await page.keyboard.press('Tab');
  const onPage = await page.evaluate(() => {
    const el = document.activeElement;
    return !!el && el !== document.body && !el.closest('.overlay');
  });
  check(onPage, 'after closing, Tab lands on an element of the page');
});

await session('keyboard: settings open from the toolbar, Escape closes them and the focus goes back', 'index.html', '.toolbar', async ({ page }) => {
  await tabTo(page, 'button[aria-label="Nastavenia"]', 'Nastavenia');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.own-category');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay', { state: 'detached' });
  // The focus goes back once the dialog has unmounted, which is a moment later.
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Nastavenia');
});

// Traverse every visible control in both directions, including both boundaries.
for (const [name, opener, ready] of [
  ['settings', 'Nastavenia', '.own-category'],
  ['search', 'Hľadať (Ctrl+K)', '.search-input'],
  ['search results', 'Hľadať (Ctrl+K)', '.search-results button'],
] as const) {
  await session(`keyboard: ${name} traps focus and returns it to its opener`, 'index.html', '.toolbar', async ({ page }) => {
    await tabTo(page, 'button', opener);
    await page.keyboard.press('Enter');
    if (name === 'search results') await page.locator('.search-input').fill('pisomka');
    await page.waitForSelector(ready);
    await page.waitForFunction(() => !!document.activeElement?.closest('.dialog'));
    const count = await page.locator('.dialog button, .dialog input, .dialog select, .dialog textarea').count();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < count + 2; i++) {
        await page.keyboard.press(key);
        check(await page.evaluate(() => !!document.activeElement?.closest('.dialog')), `${key} left the ${name} dialog at step ${i + 1}`);
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.overlay', { state: 'detached' });
    await page.waitForFunction((label) => document.activeElement?.getAttribute('aria-label') === label, opener);
  });
}

await session('keyboard: a day is opened from the month grid with Enter', 'index.html', '.toolbar', async ({ page }) => {
  await tabTo(page, '.cell-day', '14. októbra');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.dayview');
  check((await page.locator('.toolbar-title').innerText()).includes('14. októbra 2026'), 'the day that was focused is shown');
});

await browser.close();
console.log(results.join('\n'));
const passed = results.filter((r) => r.startsWith('ok ')).length;
console.log(failures ? `\n${failures} check(s) failed` : `\nall ${passed} checks passed`);
process.exit(failures ? 1 : 0);
