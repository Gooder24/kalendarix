# CLAUDE.md — Kalendarix

Instructions for working in this repository. Respond in Slovak, the
maintainer's language; code, comments and commit messages are English.

## What this is

**Kalendarix** = local-first desktop calendar, an esyst product. Tagline: *"Your
calendar. Your phone. Your rules."* Since 2.0 it is a Tauri app: a Rust shell
(`src-tauri/`) around a TypeScript interface (`src/`, Preact + signals), built
with Vite. Types are checked by **tsc-rs** (`pingdotgg/ts-rust`, the Rust port
of the TypeScript 7 compiler), a deliberate choice; the `typescript` package
is not installed and should not be added back. The Electron version (1.x,
vanilla JS) came before the rewrite.

- **The repository is public. Nothing personal goes into it**, in code, tests,
  sample data, screenshots, docs, commit messages or pull requests: no real
  calendars, events or names, no e-mail addresses, no names or addresses of
  anybody's machines, nothing about anybody's other projects. Sample data is
  made up (`src/platform/demo.ts`, `src/test/fixtures.ts`). What one person's
  calendar needs (their categories, the program that syncs their timetable) is
  data in their `calendars.json`, never a special case in the code.
- Commit and push only when asked.
- It is made for tiling Wayland desktops (Hyprland, Sway) as much as for
  ordinary ones, down to 1366 × 768 and half of that width.

## Read first

- `README.md`: what it does, how to build, where things are.
- `docs/calendars-json.md`: the data file. **It is a contract** with whatever
  else reads and writes it (a timetable sync, a calendar in the desktop's
  panel). Fields are only added; unknown ones are carried through; every save
  is checked against the file's version.
- `docs/hyprland.md`: windows, the small calendar, theme, what was verified.

## Where things live

- `src/core/`: pure logic with tests beside it. `recurrence.ts`, `categories.ts`
  (the categories that come with the app, and the user's own from the file),
  `colors.ts` (two colours per event), `instances.ts` + `layout.ts` (what goes
  where on the grids), `document.ts` (the file, its upgrade, every change to
  it), `ics.ts`, `phone.ts`, `i18n.ts`.
- `src/state/store.ts`: all state as signals, and `apply(change)`, which shows a
  change at once, saves it, and replays it when the file moved on.
  `theme.ts`: palette → CSS variables.
- `src/ui/`: components. `src/styles/app.css` uses theme variables only.
- `src/platform/backend.ts`: interface ↔ shell, plus the browser stand-in.
- `src-tauri/src/`: `storage.rs` (versioned atomic saves), `windows.rs` (main
  window, small calendar, when the app ends), `theme.rs`, `text.rs` (whole-pixel
  text for bitmap fonts), `actual.rs`, `lib.rs` (commands, file watching).

## Working here

```bash
npm run check                    # types, lint, unit tests
npm run dev                      # interface in a browser, stand-in backend
npm run e2e                      # browser checks + screenshots in e2e/shots (needs npm run dev)
KX_BROWSER=webkit npm run e2e    # same on WebKit
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

- After an interface change, run the e2e checks and **look at the screenshots**.
  Chromium is not the engine the app ships on: check WebKit too.
- The Rust shell needs the WebKitGTK 4.1 development files to build.
- `npm run typecheck` is `tsc-rs --noEmit`. tsc-rs is experimental and pinned to
  an exact version; when raising it, also check that it still reports errors (a
  scratch file with a few wrong types) before trusting a clean run.
- Everything is TypeScript, the browser checks too (`e2e/run.ts`, run by Node
  directly). No `.js` files.
- **Everything drawn is rounded**, in the pixel look too: `--radius-s`,
  `--radius`, `--radius-l` from `theme.ts`. A new component gets one of them;
  the `rounded` browser check lists what must be.
- Interface text: Slovak and English through `i18n.ts`. Code and comments: English.
- Never write to a real `calendars.json` while testing: set `KALENDARIX_DATA_DIR`.

## Not carried over from 1.x

The phone-era themes and the theme builder, the era icon sets, the "smart add",
and the tray icon.
