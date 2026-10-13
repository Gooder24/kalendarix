# Kalendarix on Hyprland (and other tiling compositors)

## Windows

| Window | Wayland `app_id` / class | Title |
|---|---|---|
| the calendar | `kalendarix` | `Kalendarix` |
| the small calendar | `kalendarix` | `Kalendarix Popup` |

Neither title ever changes, so a rule can rely on it.

- **The calendar** is an ordinary window and tiles like one. Under Hyprland,
  Sway, niri, river and i3 it has no title bar (the compositor draws the
  border); elsewhere it has one. `KALENDARIX_DECORATIONS=0` or `=1` overrides
  the guess. It works down to a narrow column: below 900 px the sidebar opens
  over the view instead of beside it, below 640 px the heading takes its own
  line and the day view stacks its list above its hours.
- **The small calendar** is shown and hidden by `kalendarix --bar-popup`. It is
  360 px wide and as tall as its content (160 to 680 px). A Wayland client
  cannot place itself, so a rule floats it where it belongs. It hides when
  Escape is pressed or something else takes the focus.

### Rules

In Hyprland the rule is three things, matched on the initial title
`Kalendarix Popup`: float, a size of 360 × 380, and a position under the bar
(centred: `(monitor_w-window_w)/2` from the left, 48 from the top); plus a key
bound to `kalendarix --bar-popup`. (The rule syntax has changed between
Hyprland versions, so it is not spelled out here.)

Sway:

```
for_window [title="^Kalendarix Popup$"] floating enable, move position 503 48
bindsym $mod+Shift+c exec kalendarix --bar-popup
```

## One instance, nothing left running

A second `kalendarix` only talks to the first: it brings the calendar forward,
`--bar-popup` toggles the small calendar, `--date 2026-10-23` jumps to a day.

There is no tray icon and no background mode. Closing the calendar ends the
app. A hidden small calendar is kept for a minute so the next key press opens
it at once; after that its page is released, and if nothing else is open the
process ends. `KALENDARIX_LINGER_SECS` changes the minute.

## Theme

With `appearance` set to "follow the system" (the default), Kalendarix wears the
first palette it finds:

1. the file named by `KALENDARIX_THEME`
2. `~/.config/kalendarix/theme.toml`
3. `~/.local/state/omarchy/current/theme/colors.toml`, `~/.config/omarchy/current/theme/colors.toml`
4. `/usr/share/kalendarix/colors.toml`

and follows it when it changes. The file is flat `key = "value"` lines:

```toml
mode = "dark"                    # or "light"; guessed from the colours when absent
background = "#000a07"           # required
foreground = "#f0f0eb"           # required
accent = "#628790"               # required
dark_background = "#0a1512"      # panels
lighter_background = "#1a2320"   # buttons
selection = "#585f5d"            # borders
green = "#a2cdc4"                # the accent as a text colour
yellow = "#e2c08d"               # warnings
red = "#e5786d"                  # errors
font = "Departure Mono Pixel"
font_size = 11
icons = "pixel-2000"
```

A palette whose `icons` or `font` says "pixel" turns on the **pixel look**:
one size of text and its multiples (11, 22, 44), two-pixel borders, pixel
icons, solid colours, nothing that fades or moves.
Without a palette the built-in dark or light theme is used.

Corners are rounded in every look: 6 px on small things (events, tags,
swatches), 10 px on controls, 14 px on dialogs.

### Bitmap fonts

A bitmap font is sharp only when every glyph sits on whole pixels. The web view
places text on fractions of a pixel, which smears a bitmap into something like
a faked bold. While the pixel look is on, Kalendarix therefore sets GTK's text
settings for its own process to full hinting and no antialiasing
(`src-tauri/src/text.rs`); the web view then snaps glyphs to whole pixels.
Nothing outside the app is changed.

## What was checked, and how

Checked on a headless Sway (wlroots, like Hyprland a tiling Wayland compositor)
with WebKitGTK 2.54 and the Departure Mono Pixel bitmap files: both windows and
their `app_id` and titles; the floating rule; tiling at full, half and a third
of 1366 × 768; one instance; `--bar-popup` from cold and while running;
`--date`; the linger and the exit; picking up a file rewritten by another
program; saving on top of it; crisp bitmap text. The interface itself is
exercised by `npm run e2e` in Chromium and in WebKit.

Hyprland itself is not part of these runs.
