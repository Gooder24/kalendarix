# calendars.json

Everything Kalendarix knows is in one file, `calendars.json` in its data
directory (`~/.config/kalendarix/` on Linux). It is not private to the app:
other programs can work with the same file, for example

| Program | What it does with the file |
|---|---|
| Kalendarix | reads it, writes it on every change |
| a timetable sync | every so often replaces the events it owns inside its own calendar |
| a calendar in the desktop's panel | reads it and watches it for changes |

So the layout below is a contract. Fields that exist keep their meaning; new
ones are only ever added; and Kalendarix carries through, untouched, any field
it does not know.

## Layout

```jsonc
{
  "schema": 2,                    // layout version; absent in files from before 2.0
  "categories": [                 // optional: the user's own categories (see below)
    { "id": "choir", "name": "Zbor", "color": "#2f55b0" }
  ],
  "calendars": [
    {
      "id": "kx-1781127556238-0-faiei",
      "name": "Zbor",
      "visible": true,
      "category": "choir",        // optional: the id of a category (see below), or "" for none
      "color": "#2f55b0",         // what Kalendarix draws; kept equal to the category's colour
      "customColor": "#2f55b0",   // the same again: other readers and Kalendarix 1.x read this one first
      "colorSlot": 3,             // Kalendarix 1.x only; kept, not used
      "sourceUrl": null,          // an .ics address this calendar is refreshed from
      "autoAccent": false,        // give every distinct title a second colour of its own
      "accents": { "matematika": "#7fb3ff" },   // second colours pinned by hand, by normalised title
      "events": [
        {
          "uid": "kx-1781127556240-3-q0wzk",
          "title": "Slovenský jazyk a literatúra",
          "description": "Učiteľ: Jana Nováková\nSkupina: 1.C",
          "notes": "Učiteľ: Jana Nováková\nSkupina: 1.C",   // same text as description; readers use either
          "location": "105",
          "start": "2026-10-23T06:00:00.000Z",   // Date.toISOString(): UTC with milliseconds
          "end": "2026-10-23T06:45:00.000Z",     // exclusive
          "allDay": false,
          "rrule": null,           // or { "FREQ": "WEEKLY", "INTERVAL": 2, "BYDAY": ["MO","WE"], "COUNT": 9, "UNTIL": "20261020T215959Z" }
          "exdates": [],           // instants; the whole local day of each is skipped
          "alarmMinutes": "",      // minutes before the start, or "" for none
          "remote": false,         // optional: came from sourceUrl, replaced on refresh
          "category": "tests",     // optional: overrides the calendar's category for this event
          "accent": "#ff8fa3"      // optional: this event's second colour
        }
      ]
    }
  ]
}
```

Written as `JSON.stringify(doc, null, 2)`, UTF-8, no trailing newline.

### Whole-day events

`allDay: true` means the event covers whole local days: from the day of `start`
to the day before `end` (or the day of `start`, when `end` is not later). New
events are written midnight to midnight. Files from Kalendarix 1.x also hold
whole-day events with hours in them (`09:00` to `10:00`); they are read by the
days they cover and are not rewritten until edited.

A whole day is stored as instants, so it is a whole day in the time zone it
was written in: read in another zone, the same event touches two days. This is
how the file has always been.

### Repeating events

`rrule` holds the parts of an iCalendar RRULE by name. Kalendarix expands
`FREQ` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `INTERVAL`, `COUNT`, `UNTIL`
(inclusive), `BYDAY` (weekly: `MO`…`SU`; monthly: `2TU`, `-1FR`, or plain
weekdays) and `BYMONTHDAY`. An occurrence keeps the wall-clock time of the
start across clock changes. Kalendarix also expands `BYDAY` on a daily rule
(working days), `BYSETPOS` and `BYMONTH`, which imported calendars use; a
simpler reader of the file may not know these.

Moving a repeating event moves the whole series by days and by the clock:
`exdates` move with it and a weekly rule's `BYDAY` follows the new day.

## Categories and colours

A category is a kind of event with one colour. These come with the app
(`src/core/categories.ts`):

| `category` | Slovak name | Colour |
|---|---|---|
| `school` | Školské predmety | `#4fae6b` green |
| `school-events` | Školské akcie | `#b9e6a2` light green |
| `tests` | Testy | `#e5584f` red |
| `trips` | Trips | `#f0913a` orange |
| `holidays` | Prázdniny | `#f2d14e` yellow |
| `family` | Rodinné | `#9fd0f5` light blue |

Everybody's days hold other kinds too, so a file can define its own under
`categories`: an `id` (any text; the app makes one from the name), a `name`
and a `color` (`#rrggbb`). They are made, renamed, recoloured and removed in
the settings. An entry with the `id` of a category that comes with the app
takes its place.

- A **calendar** with a known `category` is drawn in that category's colour,
  whatever its `color` says. With no category (`""` or absent) it uses
  `customColor`, then `color`.
- An **event** with a known `category` is drawn in that category's colour
  instead of its calendar's. This is how one feed can hold lessons, tests and
  school events and have each look like what it is.
- A calendar may name a `category` that is defined nowhere: 2.0 came with more
  categories than later versions do, and a file may have been written by hand.
  The calendar is then that category itself: the category has the calendar's
  name and its colour (`customColor`, then `color`), and other calendars and
  events can use it. It is written under `categories` the first time it is
  changed. An event with an unknown `category` is drawn as its calendar is.
- Removing a category changes no colour: its calendars get `"category": ""`
  and keep the colour as their own; its events lose the field.

### Two colours

An event can have a second colour next to the first. It is taken from, in order:

1. the event's own `accent`;
2. `accents[<normalised title>]` of its calendar: a colour somebody pinned in
   the event's details, applying to every event of that title;
3. when the calendar has `autoAccent: true`, a colour picked for the title from
   a fixed palette, so every title has its own.

A title is normalised by dropping a leading `Zrušené:` ("Cancelled:"), diacritics and case
(`"Zrušené: Matematika"` → `matematika`).

## For a program that syncs events into the file

A sync program keeps its events in a calendar of its own and replaces them on
every run. So that Kalendarix can tell them from events the user added to the
same calendar by hand, the program names itself in two places: the `id` of its
calendar begins with its name and a dash, and the `uid` of every event it owns
ends in `@` and the same name.

```jsonc
{ "id": "timetable-school", "name": "Rozvrh hodín", "events": [
  { "uid": "2026-10-23-0@timetable", "title": "Matematika" }
] }
```

Such events are shown and not edited (the next run would undo the edit); an
event with any other `uid` in that calendar is the user's, and a well-behaved
sync leaves it alone. Events with `"remote": true` are treated the same way.

A timetable calendar is `school` with `autoAccent`, so every subject is green
with a colour of its own. To decide more itself, the sync may add to an event:

- `"accent": "#rrggbb"` to give a subject the colour it has at its source;
- `"category": "tests"` on an exam, `"category": "school-events"` on a school
  event, so they are red and light green among the green lessons.

Calendar-level fields (`category`, `autoAccent`, `accents`, name, visibility)
are the user's: the sync creates the calendar once and afterwards only replaces
its own events, so those survive every run.

## Upgrading an older file

A file without `schema: 2` is brought up to date the first time Kalendarix 2
opens it (`migrate()` in `src/core/document.ts`), after a copy of it has been
kept as `calendars.json.before-v2`:

- a calendar whose name says what it is gets that `category` (and its colour);
  a calendar with any `category` already set, even `""`, is left alone;
- a calendar that becomes `school` (a timetable) gets `autoAccent: true`;
- no event, name or visibility is touched, and nothing is added.

## Writing the file safely

Kalendarix replaces the file in one step (a temporary file beside it, then a
rename) and never writes from a stale copy: every save names the version of the
file it was made from (modification time and size), and when the file has
changed since, the save is refused, the new file is read, and the change is
made again on top of it. Any other writer should do the same from its side.
