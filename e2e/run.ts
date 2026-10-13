// End-to-end check of the interface in a real browser, against the stand-in
// backend (no Rust shell needed): the things that were wrong before the rewrite
// are asserted here, and a screenshot of every state is left behind to look at.
//
//   npm run dev &            # or any server of the built files
//   npm run e2e              # node runs this file as it is: the types are stripped, not compiled
//
// KX_URL      where the app is served (default http://127.0.0.1:1420)
// KX_BROWSER  chromium (default) or webkit, the engine the app itself runs on under Linux
// CHROMIUM    a Chromium to drive instead of the one playwright-core installed
// KX_SHOTS    where screenshots go (default e2e/shots)

import { mkdirSync } from 'node:fs';
import { chromium, webkit, type BrowserContext, type Locator, type Page } from 'playwright-core';

const URL_BASE = process.env.KX_URL ?? 'http://127.0.0.1:1420';
const SHOTS = process.env.KX_SHOTS ?? new URL('./shots', import.meta.url).pathname;
// Monday 12 October 2026, ten in the morning: the sample calendars are built around "today".
const NOW = new Date('2026-10-12T10:00:00+02:00');
const SIZE = { width: 1366, height: 728 };

mkdirSync(SHOTS, { recursive: true });
const browser =
  process.env.KX_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox', '--disable-gpu'] });

/** The parts of calendars.json these checks look at. */
interface Doc {
  schema?: number;
  categories?: { id: string; name: string; color: string }[];
  calendars: {
    id: string;
    name: string;
    category?: string;
    color: string;
    customColor?: string | null;
    autoAccent?: boolean;
    events: { uid: string; title: string; start: string; end: string; allDay: boolean; [other: string]: unknown }[];
  }[];
}

interface Options {
  /** Page to open (default index.html) and what to put after it. */
  path?: string;
  query?: string;
  size?: { width: number; height: number };
  /** Selector that says the page is up. */
  ready?: string;
  scheme?: 'dark' | 'light';
}

interface Stage {
  page: Page;
  context: BrowserContext;
  /** Save a screenshot named after the scenario and this label. */
  shot: (label: string) => Promise<unknown>;
}

let failures = 0;
const results: string[] = [];

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function scenario(name: string, options: Options, body: (stage: Stage) => Promise<void>): Promise<void> {
  const context = await browser.newContext({
    viewport: options.size ?? SIZE,
    timezoneId: 'Europe/Bratislava',
    locale: 'sk-SK',
    deviceScaleFactor: 1,
    colorScheme: options.scheme ?? 'dark',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install({ time: NOW });
  const shot = (label: string): Promise<unknown> => page.screenshot({ path: `${SHOTS}/${name}${label ? '-' + label : ''}.png` });
  try {
    await page.goto(`${URL_BASE}/${options.path ?? 'index.html'}${options.query ?? ''}`);
    await page.waitForSelector(options.ready ?? '.toolbar');
    await body({ page, context, shot });
    check(errors.length === 0, `errors on the page: ${errors.join(' | ')}`);
    results.push(`ok    ${name}`);
  } catch (error) {
    failures++;
    results.push(`FAIL  ${name}: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    await shot('FAILED').catch(() => {});
  } finally {
    await context.close();
  }
}

const rgb = (hex: string): string => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const box = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> =>
  (await locator.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
const PIXEL = '?theme=pixel';

// --- the month: one bar per event, however many days it covers ------------------

await scenario('month', { query: PIXEL }, async ({ page, shot }) => {
  await shot('');
  const bars = page.locator('.chip', { hasText: 'Lyžiarsky kurz' });
  check((await bars.count()) === 1, `the ski course covers five days and must be one bar, found ${await bars.count()}`);
  const bar = await box(bars.first());
  const cell = await box(page.locator('.week .cell').first());
  check(bar.width > cell.width * 4.5, `the bar is ${Math.round(bar.width)}px wide, five days are ${Math.round(cell.width * 5)}px`);


  // Bars sit on the same line across the days they cover (they used to be loose labels).
  const tops = await page.locator('.week').nth(3).locator('.chip').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  const lane = 18;
  check(tops.every((t) => (t - tops[0]) % lane === 0), `chips are not on a common grid of lines: ${tops}`);

  // A school day is one line, not six.
  const summaries = page.locator('.week').nth(2).locator('.chip.summary');
  check((await summaries.count()) >= 4, 'each school day of the week is summarised');
  check((await page.locator('.week').nth(2).locator('.chip', { hasText: 'Matematika' }).count()) === 0, 'single lessons are not listed in the month');

  // A trip from Saturday to Monday runs over the end of a row: cut flush there, continued in the next.
  await page.locator('.toolbar .btn[aria-label="Ďalej"]').click();
  const trip = page.locator('.chip', { hasText: 'Viedeň' });
  check((await trip.count()) === 2, `the trip crosses a week boundary: two pieces, found ${await trip.count()}`);
  check(await trip.first().evaluate((el) => el.classList.contains('goes-on')), 'the first piece says it goes on');
  check(await trip.nth(1).evaluate((el) => el.classList.contains('from-before')), 'the second piece says it began before');
  await shot('november');
});

// --- clicking a day opens that day, not a form -----------------------------------

await scenario('day-from-month', { query: PIXEL }, async ({ page, shot }) => {
  await page.locator('.cell', { has: page.locator('.num', { hasText: /^14$/ }) }).click();
  await page.waitForSelector('.dayview');
  await shot('');
  check((await page.locator('.dialog').count()) === 0, 'no dialog opens on a click on a day');
  check((await page.locator('.toolbar-title').innerText()).includes('14. októbra 2026'), 'the heading names the day');
  check((await page.locator('.agenda-head h2').innerText()).startsWith('Streda 14. októbra'), 'the list is headed by the day');

  // Five identical periods are one card, with the whole title readable.
  const cards = page.locator('.card', { hasText: 'Účelové cvičenie' });
  check((await cards.count()) === 1, `five periods of the same thing are one card, found ${await cards.count()}`);
  check((await cards.innerText()).includes('5 vyučovacích hodín'), 'the card says it is five lessons');
  const title = cards.locator('.card-title');
  check((await title.innerText()) === 'Účelové cvičenie – ochrana života a zdravia v teréne', 'the title is whole');
  check(await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the title is not cut off');
  check((await page.locator('.slot', { hasText: 'Účelové cvičenie' }).count()) === 1, 'and one block among the hours');
});

// --- an event's details ----------------------------------------------------------

await scenario('detail', { query: PIXEL }, async ({ page, shot }) => {
  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.tg');
  await shot('week');
  await page.locator('.slot', { hasText: 'Slovenský jazyk a literatúra' }).first().click();
  await page.waitForSelector('.dialog.detail');
  await shot('');
  const text = await page.locator('.dialog.detail').innerText();
  for (const expected of ['Slovenský jazyk a literatúra', 'Školské predmety', 'Rozvrh hodín', 'Pondelok 12. októbra 2026', '08:00 – 08:45', '45 min', 'Miesto', '105', 'Učiteľ', 'Jana Nováková', 'Skupina', '1.C', 'Potom', 'Matematika']) {
    check(text.includes(expected), `the details say "${expected}"`);
  }
  check((await page.locator('.dialog .btn', { hasText: 'Upraviť' }).count()) === 0, 'a lesson from the feed cannot be edited here');

  // Pin a second colour for the subject: every lesson of it takes it.
  await page.locator('.dialog .btn[aria-label="Druhá farba"]').click();
  await page.locator('.swatch').nth(2).click();
  const picked = await page.locator('.swatch.picked').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.keyboard.press('Escape');
  const stripes = await page.locator('.slot', { hasText: 'Slovenský jazyk a literatúra' }).evaluateAll((els) => els.map((e) => getComputedStyle(e).borderLeftColor));
  check(stripes.length >= 4 && stripes.every((c) => c === picked), `all lessons of the subject carry the pinned colour ${picked}: ${stripes}`);
});

// --- colours: fixed per category, two per lesson ----------------------------------

await scenario('colours', { query: PIXEL }, async ({ page, shot }) => {
  // A calendar of a known kind has the colour of its category; the others keep their own.
  const wanted = {
    Testy: '#e5584f', 'Školské akcie': '#b9e6a2', Výlety: '#f0913a', Prázdniny: '#f2d14e', Rodinné: '#9fd0f5', 'Rozvrh hodín': '#4fae6b',
    Kapela: '#a2cdc4', Šport: '#af52de', Krúžky: '#ffcc00',
  };
  for (const [name, hex] of Object.entries(wanted)) {
    const row = page.locator('.cal', { has: page.locator('.cal-name', { hasText: new RegExp(`^${name}$`) }) });
    check((await row.count()) === 1, `there is a calendar "${name}"`);
    const colour = await row.locator('.cal-toggle').evaluate((el) => getComputedStyle(el).borderLeftColor);
    check(colour === rgb(hex), `${name} is ${hex}, found ${colour}`);
  }

  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.slot');
  const lesson = (title: string) => page.locator('.slot', { hasText: title }).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { fill: s.backgroundColor, stripe: s.borderLeftColor };
  });
  const maths = await lesson('Matematika');
  const physics = await lesson('Fyzika');
  check(maths.fill === rgb('#4fae6b') && physics.fill === rgb('#4fae6b'), 'every lesson is the green of school subjects');
  check(maths.stripe !== maths.fill && physics.stripe !== physics.fill, 'and has a second colour');
  check(maths.stripe !== physics.stripe, 'which differs from subject to subject');
  const test = await lesson('Písomka z matematiky');
  check(test.fill === rgb('#e5584f') && test.stripe === test.fill, 'a test is red and has one colour');

  // The other way round, by the setting.
  await page.locator('.btn[aria-label="Nastavenia"]').click();
  await shot('settings');
  await page.locator('.dual').first().click();
  await page.keyboard.press('Escape');
  const flipped = await lesson('Matematika');
  check(flipped.fill === maths.stripe && flipped.stripe === maths.fill, 'the setting swaps fill and stripe');
  await shot('week-accent-fill');
});

// --- making, changing and removing an event ---------------------------------------

await scenario('edit', { query: PIXEL }, async ({ page, shot }) => {
  await page.keyboard.press('n');
  await page.waitForSelector('.dialog.form');
  await shot('form-empty');
  await page.locator('.btn.primary', { hasText: 'Uložiť' }).click();
  check((await page.locator('.problem').innerText()).includes('názov'), 'an event without a title is not saved');

  await page.locator('.form-title').fill('Zubár');
  await page.locator('.when-row').first().locator('.time-input').fill('1415');
  await page.locator('.when-row').first().locator('.time-input').press('Tab');
  check((await page.locator('.when-row').nth(1).locator('.time-input').inputValue()) === '15:15', 'the end follows the start');
  await page.locator('.field', { hasText: 'Miesto' }).locator('input').fill('Poliklinika');
  await page.locator('.field', { has: page.locator('.field-label', { hasText: /^Kalendár$/ }) }).locator('select').selectOption({ label: 'Rodinné' });
  await shot('form');
  await page.locator('.btn.primary', { hasText: 'Uložiť' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });

  const chip = page.locator('.chip', { hasText: 'Zubár' });
  check((await chip.count()) === 1, 'the new event is in the month');
  check((await chip.innerText()).startsWith('14:15'), 'at its time');
  check((await chip.evaluate((el) => getComputedStyle(el).backgroundColor)) === rgb('#9fd0f5'), 'in the colour of its calendar');

  // It is in the file, and still there after a reload.
  await page.reload();
  await page.waitForSelector('.chip');
  check((await page.locator('.chip', { hasText: 'Zubár' }).count()) === 1, 'it survives a reload');

  await page.locator('.chip', { hasText: 'Zubár' }).click();
  await page.locator('.dialog .btn', { hasText: 'Upraviť' }).click();
  await page.locator('.form-title').fill('Zubár – kontrola');
  await page.locator('label.check', { hasText: 'Celý deň' }).locator('input').check();
  await page.locator('.btn.primary', { hasText: 'Uložiť' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  const edited = page.locator('.chip', { hasText: 'Zubár – kontrola' });
  check((await edited.count()) === 1 && !(await edited.innerText()).includes('14:15'), 'edited, and now a whole-day event');

  await edited.click();
  await page.locator('.dialog .btn', { hasText: 'Vymazať' }).click();
  await shot('delete-ask');
  await page.locator('.dialog .btn.danger', { hasText: 'Vymazať' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  check((await page.locator('.chip', { hasText: 'Zubár' }).count()) === 0, 'deleted');

  // A repeating event: one occurrence can go without the rest.
  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.locator('.slot', { hasText: 'Robotický krúžok' }).click();
  await page.locator('.dialog .btn', { hasText: 'Vymazať' }).click();
  await page.locator('.dialog .btn', { hasText: 'Len túto' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  check((await page.locator('.slot', { hasText: 'Robotický krúžok' }).count()) === 0, 'this week it is gone');
  await page.locator('.toolbar .btn[aria-label="Ďalej"]').click();
  check((await page.locator('.slot', { hasText: 'Robotický krúžok' }).count()) === 1, 'next week it is still there');
});

// --- the pointer: double-click to create, drag to move ----------------------------------

await scenario('pointer', { query: PIXEL }, async ({ page, shot }) => {
  const startOf = (title: string) => page.evaluate((t) => {
    const event = (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((e) => e.title === t)!;
    const d = new Date(event.start);
    return `${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, title);

  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.slot');
  // Saturday is empty at three in the afternoon: a double-click there starts an event at that hour.
  const saturday = page.locator('.tg-col').nth(5);
  const hours = await saturday.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const hour = parseFloat(getComputedStyle(el).getPropertyValue('--hour'));
    return { top, hour };
  });
  const column = await box(saturday);
  await page.mouse.dblclick(column.x + column.width / 2, hours.top + 15 * hours.hour + 4);
  await page.waitForSelector('.dialog.form');
  check((await page.locator('.when-row').first().locator('.date-input input').inputValue()) === '17. 10. 2026', 'the form is on the day that was clicked');
  check((await page.locator('.when-row').first().locator('.time-input').inputValue()) === '15:00', 'at the hour that was clicked');
  check((await page.locator('.when-row').nth(1).locator('.time-input').inputValue()) === '16:00', 'for an hour');
  await page.keyboard.press('Escape');

  // Drag the family lunch (Sunday at noon) to Saturday at ten.
  check((await startOf('Rodinný obed')) === '18. 12:00', 'the lunch starts on Sunday at noon');
  const lunch = page.locator('.slot', { hasText: 'Rodinný obed' });
  // Taken hold of at its top edge, so its start lands where it is dropped.
  await lunch.dragTo(saturday, { sourcePosition: { x: 12, y: 1 }, targetPosition: { x: column.width / 2, y: 10 * hours.hour + 1 } });
  await page.waitForFunction(() => {
    const e = (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((x) => x.title === 'Rodinný obed');
    return !!e && new Date(e.start).getDate() === 17;
  });
  check((await startOf('Rodinný obed')) === '17. 10:00', `dropped on Saturday at ten, found ${await startOf('Rodinný obed')}`);
  await shot('dragged');

  // In the month only the day changes; the hour stays.
  await page.locator('.seg button', { hasText: 'Mesiac' }).click();
  const target = page.locator('.cell', { has: page.locator('.num', { hasText: /^21$/ }) });
  await page.locator('.chip', { hasText: 'Rodinný obed' }).dragTo(target, { targetPosition: { x: 70, y: 8 } });
  await page.waitForFunction(() => {
    const e = (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((x) => x.title === 'Rodinný obed');
    return !!e && new Date(e.start).getDate() === 21;
  });
  check((await startOf('Rodinný obed')) === '21. 10:00', 'moved to the 21st, still at ten');

  // A bar taken hold of by its third day and dropped a day later moves by one day, not by three.
  const span = (title: string) => page.evaluate((t) => {
    const event = (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((x) => x.title === t)!;
    const last = new Date(new Date(event.end).getTime() - 1);
    return `${new Date(event.start).getDate()}–${last.getDate()} ${event.allDay ? 'all day' : 'timed'}`;
  }, title);
  check((await span('Lyžiarsky kurz')) === '19–23 all day', `the course runs Monday to Friday, found ${await span('Lyžiarsky kurz')}`);
  const bar = page.locator('.chip', { hasText: 'Lyžiarsky kurz' });
  const barBox = await box(bar);
  // Dropped on the top of the cell, above the events lying in it.
  await bar.dragTo(page.locator('.cell', { has: page.locator('.num', { hasText: /^22$/ }) }), { sourcePosition: { x: (barBox.width / 5) * 2.5, y: 4 }, targetPosition: { x: 70, y: 8 } });
  await page.waitForFunction(() => new Date((JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((x) => x.title === 'Lyžiarsky kurz')!.start).getDate() === 20);
  check((await span('Lyžiarsky kurz')) === '20–24 all day', `moved a day on as a whole, found ${await span('Lyžiarsky kurz')}`);

  // A whole-day event dropped among the hours changes its day and stays one whole day.
  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.tg-strip .chip:has-text("Otcove narodeniny")');
  const friday = page.locator('.tg-col').nth(4);
  await page.locator('.tg-strip .chip', { hasText: 'Otcove narodeniny' }).dragTo(friday, { targetPosition: { x: 20, y: 9 * hours.hour + 3 } });
  await page.waitForFunction(() => new Date((JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events).find((x) => x.title === 'Otcove narodeniny')!.start).getDate() === 16);
  check((await span('Otcove narodeniny')) === '16–16 all day', `still one whole day, now Friday, found ${await span('Otcove narodeniny')}`);
  await shot('whole-day-moved');

  // What a feed owns cannot be dragged away.
  await page.locator('.seg button', { hasText: 'Mesiac' }).click();
  const lesson = page.locator('.chip.summary').first();
  check((await lesson.getAttribute('draggable')) === null, 'a day of lessons is not draggable');
});

// --- everything drawn is rounded, in the pixel look too ----------------------------------

await scenario('rounded', { query: PIXEL }, async ({ page, shot }) => {
  /** The smallest corner radius among the elements a selector finds, in pixels; -1 when it finds none. */
  const radius = (selector: string) => page.evaluate((sel) => {
    const found = [...document.querySelectorAll(sel)];
    if (!found.length) return -1;
    return Math.min(...found.map((el) => {
      const s = getComputedStyle(el);
      return Math.max(parseFloat(s.borderTopLeftRadius), parseFloat(s.borderTopRightRadius), parseFloat(s.borderBottomRightRadius), parseFloat(s.borderBottomLeftRadius));
    }));
  }, selector);
  const rounded = async (selectors: string[]): Promise<void> => {
    for (const selector of selectors) {
      // A view that was just asked for may not be drawn yet.
      await page.waitForSelector(selector, { state: 'attached' });
      const r = await radius(selector);
      check(r > 0, `"${selector}" is rounded (smallest radius found: ${r}px)`);
    }
  };

  check((await page.evaluate(() => document.documentElement.dataset.look)) === 'pixel', 'this is the pixel look');
  await rounded(['.toolbar .btn', '.seg > button:first-child', '.seg > button:last-child', '.chip', '.num', '.mini-day', '.cal', '.cal-toggle']);

  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.slot');
  await rounded(['.slot', '.tg-strip .chip', '.tg-day']);

  await page.locator('.slot', { hasText: 'Matematika' }).first().click();
  await page.waitForSelector('.dialog.detail');
  await rounded(['.dialog', '.detail-band', '.tag', '.dialog .btn']);
  await shot('detail');
  await page.keyboard.press('Escape');

  await page.keyboard.press('n');
  await page.waitForSelector('.dialog.form');
  await page.locator('.more-options').click();
  await rounded(['.dialog', '.form-title', '.form-when', '.date-input input', '.time-input', 'select', 'textarea', "input[type='checkbox']", '.swatch', '.dialog .btn']);
  await shot('form');
  await page.keyboard.press('Escape');

  // The pencil shows when the pointer is on the row.
  await page.locator('.cal').first().hover();
  await page.locator('.cal').first().locator('.cal-edit').click();
  await page.waitForSelector('.category');
  await rounded(['.cal-preview', '.category', '.dialog']);
  await page.keyboard.press('Escape');

  await page.keyboard.press('d');
  await rounded(['.card', '.agenda .btn']);
  await shot('day');
  await page.keyboard.press('y');
  await rounded(['.year-day']);
  await page.keyboard.press('Control+k');
  await page.locator('.search-input').fill('a');
  await rounded(['.dialog.search', '.search-input', '.search-results']);
  await page.keyboard.press('Escape');

  await page.locator('.btn[aria-label="Nastavenia"]').click();
  await page.locator('.own-category input').fill('Hudba');
  await rounded(['.own-category .swatch', '.own-category input', '.own-category .btn', '.dual', '.dual-sample', '.hex']);
});

// --- categories of one's own: made, used, renamed, recoloured, removed ------------------

await scenario('categories', { query: PIXEL }, async ({ page, shot }) => {
  const stored = (): Promise<Doc> => page.evaluate(() => JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc);
  const band = async (): Promise<Doc['calendars'][number]> => (await stored()).calendars.find((c) => c.name === 'Kapela')!;
  const toggle = page.locator('.cal', { has: page.locator('.cal-name', { hasText: /^Kapela$/ }) }).locator('.cal-toggle');
  const colourOfBand = (): Promise<string> => toggle.evaluate((el) => getComputedStyle(el).borderLeftColor);
  const settings = async (): Promise<void> => {
    await page.locator('.btn[aria-label="Nastavenia"]').click();
    await page.waitForSelector('.own-category');
  };

  await settings();
  check((await page.locator('.own-category').count()) === 1, 'at first there is only the line for a new one');
  const fresh = page.locator('.own-category input[aria-label="Nová kategória"]');
  await fresh.fill('Hudba');
  await page.locator('.own-category .swatches .swatch').nth(1).click();
  await fresh.press('Enter');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).categories?.length === 1);
  check(JSON.stringify((await stored()).categories) === JSON.stringify([{ id: 'hudba', name: 'Hudba', color: '#2f55b0' }]), 'the new category is in the file');
  check((await fresh.inputValue()) === '', 'and the line is ready for the next one');
  await shot('settings');
  await page.keyboard.press('Escape');

  // A calendar takes it, and with it its colour.
  await toggle.hover();
  await page.locator('.cal', { has: page.locator('.cal-name', { hasText: /^Kapela$/ }) }).locator('.cal-edit').click();
  await page.locator('.category', { hasText: /^Hudba$/ }).click();
  await shot('calendar');
  await page.locator('.dialog button[type="submit"]').click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.find((c) => c.name === 'Kapela')!.category === 'hudba');
  check((await colourOfBand()) === rgb('#2f55b0'), `the calendar has the colour of its category, found ${await colourOfBand()}`);
  check((await band()).color === '#2f55b0' && (await band()).customColor === '#2f55b0', 'written for the other readers of the file too');

  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.locator('.slot', { hasText: 'Skúška kapely' }).click();
  await page.waitForSelector('.dialog.detail');
  check((await page.locator('.dialog.detail .tag').first().innerText()) === 'Hudba', 'an event says which category it is');
  await page.keyboard.press('Escape');

  // Renamed and recoloured, everything of that kind follows.
  await settings();
  const name = page.locator('.own-category input[aria-label="Názov"]');
  await name.fill('Muzika');
  await name.press('Tab');
  await page.locator('.own-category button.swatch[aria-label="Farba"]').click();
  await page.locator('.own-category .swatches .swatch').first().click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).categories?.[0]?.color === '#a374e0');
  check(JSON.stringify((await stored()).categories) === JSON.stringify([{ id: 'hudba', name: 'Muzika', color: '#a374e0' }]), 'renamed and recoloured in the file');
  check((await colourOfBand()) === rgb('#a374e0'), 'the calendar follows the new colour');

  // Removed: nothing changes colour, the calendar just has a colour of its own again.
  await page.locator('.own-category .btn[aria-label="Vymazať"]').click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).categories?.length === 0);
  check((await band()).category === '' && (await band()).color === '#a374e0', 'the calendar keeps the colour as its own');
  check((await colourOfBand()) === rgb('#a374e0'), 'and looks the same');
  check((await page.locator('.own-category').count()) === 1, 'the category is gone from the list');
});

// --- search and the keyboard -------------------------------------------------------

await scenario('search', { query: PIXEL }, async ({ page, shot }) => {
  await page.keyboard.press('Control+k');
  await page.locator('.search-input').fill('pisomka');
  await page.waitForSelector('.search-results button');
  await shot('');
  check((await page.locator('.search-results button').first().innerText()).includes('Písomka z matematiky'), 'found without diacritics');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.dialog.detail');
  check((await page.locator('.dialog.detail h2').innerText()) === 'Písomka z matematiky', 'Enter opens the event');
  check((await page.locator('.dialog.detail').innerText()).includes('Testy'), 'with its category');
  await page.keyboard.press('Escape');
  check((await page.locator('.dayview').count()) === 1, 'on its day');

  for (const [key, selector] of [['y', '.year'], ['m', '.month'], ['w', '.tg'], ['d', '.dayview']]) {
    await page.keyboard.press(key);
    check((await page.locator(selector).count()) === 1, `"${key}" switches the view`);
  }
  await page.keyboard.press('y');
  await shot('year');
});

// --- half a screen, as a tiling compositor gives it ---------------------------------

await scenario('narrow', { query: PIXEL, size: { width: 676, height: 728 } }, async ({ page, shot }) => {
  await shot('month');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(await fits(), 'the month fits the width');
  check((await page.locator('.sidebar').count()) === 0, 'the sidebar is out of the way');
  const mondayCell = await box(page.locator('.week .cell').first());
  check(mondayCell.x < 4 && mondayCell.width > 80, 'and the days have the whole width');

  // It opens over the view when asked for, and goes again once a day is picked.
  await page.locator('.btn[aria-label="Bočný panel"]').click();
  check((await page.locator('.sidebar').count()) === 1, 'the sidebar opens on request');
  await shot('sidebar');
  await page.locator('.sidebar .mini-day', { hasText: /^20$/ }).click();
  check((await page.locator('.sidebar').count()) === 0 && (await page.locator('.dayview').count()) === 1, 'picking a day closes it');
  await shot('day');

  for (const [letter, view] of [['T', 'week'], ['R', 'year'], ['M', 'month']]) {
    await page.locator(`.toolbar .seg button[data-short="${letter}"]`).click();
    check(await fits(), `the ${view} fits the width`);
    await shot(view);
  }

  // A third of the screen, every view: the window itself never scrolls and the toolbar stays on top.
  await page.setViewportSize({ width: 449, height: 728 });
  for (const letter of ['D', 'T', 'M', 'R']) {
    await page.locator(`.toolbar .seg button[data-short="${letter}"]`).click();
    const state = await page.evaluate(() => ({
      scrolled: window.scrollY + document.documentElement.scrollTop + document.body.scrollTop,
      tall: document.documentElement.scrollHeight - window.innerHeight,
      toolbar: document.querySelector('.toolbar')!.getBoundingClientRect().top,
      view: document.querySelector('.view')!.getBoundingClientRect().bottom - window.innerHeight,
    }));
    check(state.scrolled === 0 && state.tall <= 0 && state.toolbar === 0 && Math.abs(state.view) < 1, `view "${letter}" stays inside the window: ${JSON.stringify(state)}`);
    check(await fits(), `view "${letter}" fits a third of the screen`);
    await shot(`third-${letter}`);
  }
  await page.setViewportSize({ width: 420, height: 600 });
  await page.locator('.toolbar .seg button[data-short="M"]').click();
  check(await fits(), 'and a narrow column too');
  await shot('column');
});

// --- the file changes under the app -------------------------------------------------

await scenario('external-change', { query: PIXEL }, async ({ page, context }) => {
  // Another program (the timetable sync) rewrites the file while the app is open.
  const other = await context.newPage();
  await other.goto(`${URL_BASE}/index.html?demo=0`);
  await other.evaluate(() => {
    const doc = (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc);
    const day = new Date(2026, 9, 13);
    doc.calendars.find((c) => c.id === 'timetable-school')!.events.push({
      uid: '2026-10-13-9@timetable', title: 'Nová hodina zo syncu', description: '', notes: '', location: '7',
      start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15).toISOString(),
      end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 45).toISOString(),
      allDay: false, rrule: null, exdates: [], alarmMinutes: '',
    });
    localStorage.setItem('kalendarix:calendars', JSON.stringify(doc, null, 2));
  });
  await page.locator('.seg button', { hasText: 'Týždeň' }).click();
  await page.waitForSelector('.slot:has-text("Nová hodina zo syncu")');

  // And a change made here on top of it loses nothing of theirs.
  await page.keyboard.press('n');
  await page.locator('.form-title').fill('Moja udalosť');
  await page.locator('.btn.primary', { hasText: 'Uložiť' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  const titles = await page.evaluate(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).calendars.flatMap((c) => c.events.map((e) => e.title)));
  check(titles.includes('Nová hodina zo syncu') && titles.includes('Moja udalosť'), 'both changes are in the file');
  await other.close();
});

// --- an old file is brought up to date once ------------------------------------------

await scenario('upgrade', { query: PIXEL }, async ({ page }) => {
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc).schema === 2);
  const doc = await page.evaluate(() => (JSON.parse(localStorage.getItem('kalendarix:calendars')!) as Doc));
  const by = Object.fromEntries(doc.calendars.map((c) => [c.name, c]));
  check(by.Rodinné.category === 'family' && by.Rodinné.color === '#9fd0f5' && by.Rodinné.customColor === '#9fd0f5', 'colours are written for the other readers of the file');
  check(by.Kapela.category === undefined && by.Kapela.color === '#a2cdc4', 'an unknown calendar is left alone');
  check(doc.calendars.length === 9 && doc.categories === undefined, 'nothing is added to the file');
  check(by['Rozvrh hodín'].autoAccent === true, 'the timetable has second colours');
});

// --- the small calendar ----------------------------------------------------------------

await scenario('popup', { path: 'popup.html', query: PIXEL, size: { width: 360, height: 620 }, ready: '.popup' }, async ({ page, shot }) => {
  await shot('');
  check((await page.locator('.agenda-head h2').innerText()).startsWith('Pondelok 12. októbra'), 'it opens on today');
  check((await page.locator('.mini-day.today').innerText()).trim() === '12', 'and marks today');
  check((await page.locator('.mini-marks').count()) > 10, 'days with events are marked');
  await page.locator('.mini-day', { hasText: /^14$/ }).click();
  check((await page.locator('.card', { hasText: 'Účelové cvičenie' }).count()) === 1, 'the day of class work is one card');
  await shot('day');
  await page.locator('.card').first().click();
  await page.waitForSelector('.dialog.detail');
  await shot('detail');
  check((await page.locator('.dialog .btn', { hasText: 'Otvoriť v aplikácii' }).count()) === 1, 'details offer the full window');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing sticks out of 360 pixels');
});

// --- the other looks ---------------------------------------------------------------------

// Without a desktop palette the built-in theme follows the system's light or dark; the setting overrides it.
for (const [name, scheme] of [['look-dark', 'dark'], ['look-light', 'light']] as const) {
  await scenario(name, { scheme }, async ({ page, shot }) => {
    const look = () => page.evaluate(() => [document.documentElement.dataset.look, document.documentElement.dataset.theme].join(' '));
    check((await look()) === `smooth ${scheme}`, `the built-in ${scheme} theme, found "${await look()}"`);
    if (name === 'look-light') {
      await page.locator('.btn[aria-label="Nastavenia"]').click();
      await page.locator('.seg button', { hasText: 'Tmavá' }).click();
      check((await look()) === 'smooth dark', 'the setting wins over the system');
      await page.locator('.seg button', { hasText: 'Podľa systému' }).click();
      await page.keyboard.press('Escape');
    }
    await shot('month');
    await page.locator('.seg button', { hasText: 'Týždeň' }).click();
    await page.waitForSelector('.slot');
    await shot('week');
    await page.locator('.slot').first().click();
    await page.waitForSelector('.dialog.detail');
    await shot('detail');
  });
}

await scenario('english', { query: PIXEL }, async ({ page, shot }) => {
  await page.locator('.btn[aria-label="Nastavenia"]').click();
  await page.locator('.seg button', { hasText: 'English' }).click();
  await page.keyboard.press('Escape');
  check((await page.locator('.toolbar-title').innerText()).includes('October 2026'), 'the heading is English');
  check((await page.locator('.btn', { hasText: 'Today' }).count()) === 1, 'so are the buttons');
  await shot('');
});

await browser.close();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} scenario(s) failed; screenshots in ${SHOTS}` : `\nall ${results.length} scenarios passed; screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
