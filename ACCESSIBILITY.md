# Accessibility

Kalendarix is a calendar people use every day, so it has to work for everyone who uses it: with the keyboard alone, with a screen reader, in a narrow window, with bigger text, and in Slovak or English. This document says what we aim for, how contributors help, how to report a barrier, and what has and has not been checked so far.

## Priorities

- **Conformance target:** [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) where it is feasible for a desktop app with its own pixel look.
- **Keyboard:** every control can be reached and used with the keyboard alone, with a visible focus and a logical order. The shortcuts are listed in the [README](README.md#keys).
- **Screen readers:** controls have names, headings and buttons are real ones, and dialogs say what they are. Not yet checked with a screen reader (see [Testing](#testing)).
- **Contrast and size:** text is readable in every theme, and targets are big enough to hit.
- **Small windows:** the app stays usable on half of a 1366 × 768 screen, as tiling desktops give it, and in a narrow column.
- **Language:** the interface is in Slovak and English, and the document language follows the setting.

## Contributor expectations

If you change the interface:

- Run `npm run a11y`. It runs an automated check (axe-core) on the main states and a keyboard-only walk through the core flows. It must pass: a new problem fails it. Problems that are already known are counted per state and rule in `.github/a11y-axe-baseline.json`, so a count above the baseline fails, and adding an unrelated element does not.
- Go through what you changed with the keyboard only: Tab, Shift+Tab, Enter, Space, Escape, and arrow keys where a control expects them. Focus must be visible and must not get stuck.
- Use the theme variables for colour, font and size (see [CONTRIBUTING.md](CONTRIBUTING.md)). Never use colour as the only way to show a state.
- Give a new control a name a screen reader can read. If you spot-check it with a screen reader, say so in the pull request.
- Check Markdown changes with `python3 .github/scripts/check-docs.py` (heading order, alternative text, descriptive link text).

CI runs the documentation check and `npm run a11y` on every pull request. A new problem makes it fail: fix it, or say in the pull request why it cannot be fixed yet.

## Reporting an accessibility barrier

Open an issue with the [accessibility form](https://github.com/Gooder24/kalendarix/issues/new?template=accessibility.yml). It asks for:

- what you were trying to do, and what happened instead,
- where in the app it happened (for example the month view, the new event form, the small calendar),
- your system (operating system, browser or desktop, Kalendarix version) and any assistive technology, with versions if you know them,
- how severe it is (see below).

A screenshot or recording helps, if you are comfortable sharing one. Make sure it does not show personal calendar data. You do not need to say anything about a disability.

If the form does not work for you, write the issue in your own words. A maintainer will add the labels.

### Severity

- **Critical:** you cannot complete a core task at all, for example creating or opening an event.
- **Serious:** you can complete it, but only with great difficulty or a workaround.
- **Moderate:** an annoyance, or the experience is inconsistent.
- **Minor:** little effect on how you use the app.

### How we respond

- We acknowledge each report respectfully and treat it as expert input.
- Every accessibility report gets the `accessibility` label and a severity.
- We say whether we can reproduce it and what the next step is.
- Where we can, we suggest a workaround while a fix is in progress.
- When a fix is ready, we ask the reporter to check it, if they are willing.
- We close a report with a note on what changed.

## Owner

Accessibility is owned by the repository owner, **[Gooder24](https://github.com/Gooder24)**. The owner:

- triages accessibility reports and applies the labels,
- keeps the known problems below and in `.github/a11y-axe-baseline.json` up to date,
- keeps this document current,
- raises barriers the project cannot fix yet with the other maintainers.

## Known problems

The barriers tracked in [issues #1–#7](https://github.com/Gooder24/kalendarix/issues?q=is%3Aissue%20label%3Aaccessibility) have regression checks: secondary-text contrast, pointer targets, independent month-day controls, headings, landmarks, named search results, and modal focus containment and restoration. The automated suite requires zero violations of the rules involved, in both schemes, including populated search results and the small calendar.

This is not a complete accessibility assessment. Screen readers, zoom and reflow still need the manual checks listed below.

## Supported environments

What has actually been run:

- **The interface in a browser** (`npm run dev`, with the sample data): Chromium and WebKit, through the end-to-end checks in CI.
- **The desktop app:** Linux with WebKitGTK 4.1. CI builds the shell on Ubuntu 24.04; the app itself has not been checked with assistive technology there. Tiling desktops without a title bar (Hyprland, Sway) are described in [docs/hyprland.md](docs/hyprland.md).
- **Input:** keyboard and mouse. Touch and pen are not tested.
- **Languages:** Slovak and English. The document language follows the setting.

Not tested, so do not assume they work:

- Windows and macOS: the release workflow builds installers for them, but nobody has checked them for accessibility.
- Screen readers: none has been tested yet (NVDA, JAWS, VoiceOver, Orca).
- Zoom and reflow: not measured yet.

## Testing

| Check | What it covers | Status |
|---|---|---|
| Automated (axe-core) | The main states (month, week, day, year, new event, search, settings) and the small calendar, in the light and the dark scheme, default look. WCAG 2.2 A and AA plus best practice. | In CI. Zero violations for the resolved issue rules; other rules use the baseline. The pixel look is not scanned yet. |
| Keyboard only | Tab reaches every toolbar control with a visible focus; the shortcuts; creating, saving, searching, opening and closing; Enter on a day. | In CI. Core flows and Tab/Shift+Tab containment in Settings and search, with Escape returning focus. |
| Documentation | Heading order, alternative text, descriptive link text in the Markdown files. | In CI, `.github/scripts/check-docs.py`. |
| Screen reader spot check | The core flows with NVDA, VoiceOver or Orca. | Not done yet. Needs a person. |
| Manual checks | Zoom to 200 % and reflow to 400 %, colour use beyond what axe finds, plain language in the interface texts. | Not done yet. Needs a person. |

Tools find only what they can see in the page at the states they are asked about. They do not tell whether a screen reader says the right thing.

## Documentation

The Markdown files are checked by `.github/scripts/check-docs.py`. Problems that already exist are in `.github/a11y-baseline.json`; there are none yet. Images in the README have alternative text, and the logo is decorative, so its alternative text is empty.

## Dependencies

- **WebKitGTK 4.1** draws the interface on Linux. How well its accessibility support (AT-SPI) works with the app has not been evaluated.
- **Tauri 2, Preact, Vite** and the other packages in `package.json`: none is known to affect accessibility.
- **`axe-core`** (MPL-2.0) is a development dependency that runs the automated check. It is not part of the app.
- **New dependencies** that draw or change the interface are checked for accessibility before they are added.
- **Known upstream blockers:** none recorded yet.

## Community

- **Ways in:** issues labelled `accessibility` with `good first issue` are small and have a clear scope. Those with `help wanted` need more experience.
- **Ways to take part:** issues and pull requests are enough. Nobody has to use voice, video or one particular chat tool.
- **Accommodations:** if you need something to take part (more time, another format), ask in an issue. You do not have to explain why.
- **Code of conduct:** none yet. The maintainer will decide whether to adopt one.
- **Progress:** each release note will say what accessibility work was done, what remains, and which limitations are known, as in this document.
- **Recognition:** we name people who help with accessibility in the release notes, if they agree.
- **Resources:** `.github/scripts/check-docs.py` and `e2e/a11y.ts` are free to reuse under the project's [MIT license](LICENSE). Their owner is the accessibility owner above.
