# Contributing to Kalendarix

Thanks for helping out. A few ground rules keep the codebase small and clear.

## How the code is laid out

- `src/core/` is the calendar with no window attached: pure functions with unit
  tests beside them. Anything that can be decided without a screen belongs here.
- `src/ui/` draws what the core computed. Components read the signals in
  `src/state/store.ts`; whatever changes state is a function in that file.
- `src/platform/backend.ts` is the only place the interface talks to the shell.
  Everything in it also exists in the browser stand-in, so the interface runs in
  a plain tab.
- `src-tauri/` does what a page cannot: files, windows, the desktop.

## Rules

- **`calendars.json` is a contract** with other programs
  ([docs/calendars-json.md](docs/calendars-json.md)). Never rename or drop a
  field; carry through what you do not know; write the doc when you add one.
- **A change to the calendars is a pure function** `(doc) => doc` in
  `src/core/document.ts`, applied through `apply()`. It may run twice, on a
  newer file, when another program wrote in between.
- **The stylesheet uses the theme's variables only**: no colour, font or size of
  its own. Nothing fades or moves, and colours are solid; the pixel look depends
  on it.
- Interface text goes through `src/core/i18n.ts`, in Slovak and English.
  Identifiers and comments are English.
- Match the surrounding code's naming, comment density and idioms.

## Before a pull request

```bash
npm run check
npm run dev & npm run e2e
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Look at the screenshots `npm run e2e` leaves in `e2e/shots/`. Keep changes
scoped: one concern per pull request.

## What is not accepted

- Code that loads or executes remote or untrusted JavaScript.
- Anything using the Kalendarix name or brand for a fork (see [BRANDING.md](BRANDING.md)).

## License of contributions

By contributing code you agree it is licensed under the project's [MIT License](LICENSE).
