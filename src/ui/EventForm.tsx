// Making and changing an event.

import { useRef, useState } from 'preact/hooks';
import { categoryName } from '../core/categories';
import { ACCENT_PALETTE, isHex } from '../core/colors';
import { addDays, atMinute, dayNumber, minuteOfDay, parseDate, parseTime, roundedNow, startOfDay } from '../core/dates';
import { addEvent, updateEvent, type EventDraft } from '../core/document';
import { ALARM_CHOICES, alarmText, numericDate } from '../core/i18n';
import { isSynced } from '../core/instances';
import { parseUntil, simpleRepeat } from '../core/recurrence';
import type { Freq, RRule } from '../core/types';
import { apply, categories, cursor, doc, form, lang, now, t, view, type FormRequest } from '../state/store';
import { Button, Dialog, DialogHead, Field, Swatches } from './common';
import { MiniMonth } from './MiniMonth';

/** A date typed as text, with a small month to pick from. */
function DateInput({ value, onChange, label }: { value: Date; onChange: (day: Date) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.getTime());
  const commit = (): void => {
    if (text === null) return;
    const parsed = parseDate(text, value.getFullYear());
    if (parsed) onChange(parsed);
    setText(null);
  };
  return (
    <span class="date-input">
      <input
        type="text"
        aria-label={label}
        value={text ?? numericDate(lang.value, value)}
        onInput={(e) => setText(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <Button
        icon="calendar"
        title={label}
        kind="ghost"
        active={open}
        onClick={() => {
          setMonth(value.getTime());
          setOpen(!open);
        }}
      />
      {open && (
        <span class="date-pop">
          <MiniMonth
            month={month}
            selected={dayNumber(value)}
            onMonth={(m) => setMonth(m.getTime())}
            onPick={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}

/** A time typed as text: "8", "830", "8:30" all mean half past eight. Arrows step by a quarter. */
function TimeInput({ value, onChange, label }: { value: number; onChange: (minutes: number) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const commit = (): void => {
    if (text === null) return;
    const parsed = parseTime(text);
    if (parsed !== null) onChange(Math.min(parsed, 24 * 60 - 1));
    setText(null);
  };
  return (
    <input
      type="text"
      class="time-input"
      aria-label={label}
      inputMode="numeric"
      value={text ?? shown}
      onInput={(e) => setText(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setText(null);
          onChange((value + (e.key === 'ArrowUp' ? 15 : -15) + 24 * 60) % (24 * 60));
        }
      }}
    />
  );
}

interface State {
  title: string;
  calId: string;
  allDay: boolean;
  /** Days as local midnights; for a whole-day event `endDay` is its last day, inclusive. */
  startDay: Date;
  endDay: Date;
  startMin: number;
  endMin: number;
  location: string;
  notes: string;
  alarm: number | '';
  repeat: 'none' | Freq;
  interval: number;
  ending: 'never' | 'count' | 'until';
  count: number;
  until: Date;
  /** Parts of the rule the form does not edit (BYDAY…), carried through when the frequency stays. */
  keptRule: RRule | null;
  category: string;
  accent: string | null;
}

function initial(request: FormRequest): State {
  const editing = request.editing;
  if (editing) {
    const e = editing.event;
    const start = new Date(e.start);
    const end = new Date(e.end);
    const rule = e.rrule;
    // The local day the rule runs until; UNTIL itself is usually written in UTC.
    const untilAt = rule?.UNTIL ? parseUntil(rule.UNTIL) : null;
    const until = untilAt !== null ? startOfDay(untilAt) : null;
    return {
      title: e.title, calId: editing.calId, allDay: e.allDay,
      startDay: startOfDay(start),
      // A whole-day event is stored up to the next midnight; people think of its last day.
      endDay: startOfDay(e.allDay && end > start ? end.getTime() - 1 : end),
      startMin: minuteOfDay(start), endMin: minuteOfDay(end),
      location: e.location ?? '', notes: e.notes || e.description || '', alarm: e.alarmMinutes,
      repeat: rule?.FREQ ?? 'none', interval: rule?.INTERVAL && rule.INTERVAL > 0 ? rule.INTERVAL : 1,
      ending: rule?.COUNT ? 'count' : rule?.UNTIL ? 'until' : 'never',
      count: rule?.COUNT ?? 10, until: until ?? addDays(start, 90),
      keptRule: rule, category: e.category ?? '', accent: isHex(e.accent) ? e.accent : null,
    };
  }
  // A new event starts where it was asked for; else on the day in view, at the next half hour.
  const fallbackDay = view.value === 'year' || dayNumber(cursor.value) === dayNumber(now.value) ? new Date(now.value) : new Date(cursor.value);
  const base = roundedNow(now.value);
  const start = request.start ?? atMinute(fallbackDay, Math.min(minuteOfDay(base), 23 * 60));
  const end = request.end ?? new Date(start.getTime() + 3_600_000);
  const allDay = request.allDay ?? false;
  return {
    title: '', calId: (doc.value.calendars.find((c) => c.visible !== false && !isSynced(c)) ?? doc.value.calendars[0])?.id ?? '',
    allDay, startDay: startOfDay(start), endDay: startOfDay(allDay && end > start ? end.getTime() - 1 : end),
    startMin: minuteOfDay(start), endMin: minuteOfDay(end), location: '', notes: '', alarm: '',
    repeat: 'none', interval: 1, ending: 'never', count: 10, until: addDays(start, 90), keptRule: null, category: '', accent: null,
  };
}

function ruleOf(s: State): RRule | null {
  if (s.repeat === 'none') return null;
  // Keep the parts this form has no control for, as long as they still belong to the same kind of rule.
  const kept = s.keptRule && s.keptRule.FREQ === s.repeat ? { ...s.keptRule } : {};
  const rule: RRule = { ...kept, FREQ: s.repeat, INTERVAL: Math.max(1, Math.floor(s.interval) || 1) };
  delete rule.COUNT;
  delete rule.UNTIL;
  if (s.ending === 'count') rule.COUNT = Math.max(1, Math.floor(s.count) || 1);
  if (s.ending === 'until') {
    // The whole of that day, in UTC as iCalendar wants it.
    const end = new Date(s.until.getFullYear(), s.until.getMonth(), s.until.getDate(), 23, 59, 59);
    rule.UNTIL = end.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  }
  return rule;
}

export function EventForm({ request }: { request: FormRequest }) {
  const [s, setS] = useState<State>(() => initial(request));
  const [problem, setProblem] = useState<string | null>(null);
  // Category and second colour are for the odd event; they stay folded away until wanted.
  const [more, setMore] = useState(() => !!(request.editing?.event.category || request.editing?.event.accent));
  const titleInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<State>): void => {
    setS((old) => ({ ...old, ...patch }));
    setProblem(null);
  };
  const close = (): void => void (form.value = null);
  const editing = request.editing;

  const save = (): void => {
    if (!s.title.trim()) {
      setProblem(t('titleMissing'));
      titleInput.current?.focus();
      return;
    }
    const start = s.allDay ? s.startDay : atMinute(s.startDay, s.startMin);
    const end = s.allDay ? addDays(s.endDay, 1) : atMinute(s.endDay, s.endMin);
    if (end < start || (s.allDay && s.endDay < s.startDay)) {
      setProblem(t('endBeforeStart'));
      return;
    }
    const draft: EventDraft = {
      title: s.title, start, end, allDay: s.allDay, location: s.location, notes: s.notes,
      rrule: ruleOf(s), alarmMinutes: s.alarm, category: s.category || undefined, accent: s.accent ?? undefined,
    };
    void apply(editing ? updateEvent(editing.calId, editing.uid, draft, s.calId) : addEvent(s.calId, draft));
    close();
  };

  /**
   * Switching between whole days and hours keeps what it can of the other: an
   * event until midnight covers the day before that midnight, and a whole day
   * turned into hours gets an hour in the morning rather than no length at all.
   */
  const toggleAllDay = (allDay: boolean): void => {
    if (allDay) {
      const end = atMinute(s.endDay, s.endMin);
      const start = atMinute(s.startDay, s.startMin);
      return set({ allDay, endDay: startOfDay(end > start ? end.getTime() - 1 : start) });
    }
    const empty = dayNumber(s.endDay) === dayNumber(s.startDay) && s.endMin <= s.startMin;
    set(empty ? { allDay, startMin: 9 * 60, endMin: 10 * 60 } : { allDay });
  };

  /** Moving the start drags the end along, so the length stays what it was. */
  const moveStart = (day: Date, minutes: number): void => {
    const before = atMinute(s.startDay, s.startMin).getTime();
    const length = atMinute(s.endDay, s.endMin).getTime() - before;
    const days = dayNumber(s.endDay) - dayNumber(s.startDay);
    if (s.allDay) return set({ startDay: day, endDay: addDays(day, Math.max(0, days)) });
    const end = new Date(atMinute(day, minutes).getTime() + Math.max(0, length));
    set({ startDay: day, startMin: minutes, endDay: startOfDay(end), endMin: minuteOfDay(end) });
  };

  const unit = s.repeat === 'none' ? '' : t(({ DAILY: 'unitDaily', WEEKLY: 'unitWeekly', MONTHLY: 'unitMonthly', YEARLY: 'unitYearly' } as const)[s.repeat]);
  const customRule = editing && simpleRepeat(editing.event.rrule) === 'custom';

  return (
    <Dialog title={editing ? t('editEvent') : t('newEvent')} onClose={close} class="form">
      <DialogHead title={editing ? t('editEvent') : t('newEvent')} onClose={close} />
      <form
        class="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={titleInput}
          class="form-title"
          type="text"
          placeholder={t('title')}
          aria-label={t('title')}
          value={s.title}
          onInput={(e) => set({ title: e.currentTarget.value })}
          data-focus
        />

        <div class="form-when">
          <label class="check">
            <input type="checkbox" checked={s.allDay} onChange={(e) => toggleAllDay(e.currentTarget.checked)} />
            <span>{t('allDay')}</span>
          </label>
          <div class="when-row">
            <span class="field-label">{t('start')}</span>
            <DateInput label={t('start')} value={s.startDay} onChange={(day) => moveStart(day, s.startMin)} />
            {!s.allDay && <TimeInput label={t('start')} value={s.startMin} onChange={(m) => moveStart(s.startDay, m)} />}
          </div>
          <div class="when-row">
            <span class="field-label">{t('end')}</span>
            <DateInput label={t('end')} value={s.endDay} onChange={(day) => set({ endDay: day })} />
            {!s.allDay && <TimeInput label={t('end')} value={s.endMin} onChange={(m) => set({ endMin: m })} />}
          </div>
        </div>

        <Field label={t('calendar')} icon="calendar">
          <select value={s.calId} onChange={(e) => set({ calId: e.currentTarget.value })}>
            {doc.value.calendars.map((c) => (
              <option key={c.id} value={c.id}>{c.name || t('untitled')}</option>
            ))}
          </select>
        </Field>

        <Field label={t('repeat')} icon="repeat">
          <select value={s.repeat} onChange={(e) => set({ repeat: e.currentTarget.value as State['repeat'] })}>
            <option value="none">{t('never')}</option>
            <option value="DAILY">{t('daily')}</option>
            <option value="WEEKLY">{t('weekly')}</option>
            <option value="MONTHLY">{t('monthly')}</option>
            <option value="YEARLY">{t('yearly')}</option>
          </select>
        </Field>
        {s.repeat !== 'none' && (
          <div class="form-repeat">
            <label>
              <span>{t('every')}</span>
              <input type="number" min={1} max={99} value={s.interval} onInput={(e) => set({ interval: +e.currentTarget.value })} />
              <span>{unit}</span>
            </label>
            <label>
              <span>{t('end')}</span>
              <select value={s.ending} onChange={(e) => set({ ending: e.currentTarget.value as State['ending'] })}>
                <option value="never">{t('forever')}</option>
                <option value="count">{t('times')}</option>
                <option value="until">{t('until')}</option>
              </select>
            </label>
            {s.ending === 'count' && <input type="number" aria-label={t('times')} min={1} max={999} value={s.count} onInput={(e) => set({ count: +e.currentTarget.value })} />}
            {s.ending === 'until' && <DateInput label={t('until')} value={s.until} onChange={(day) => set({ until: day })} />}
            {customRule && s.keptRule?.BYDAY && <span class="field-hint">{s.keptRule.BYDAY.join(', ')}</span>}
          </div>
        )}

        <Field label={t('alarm')} icon="bell">
          <select value={String(s.alarm)} onChange={(e) => set({ alarm: e.currentTarget.value === '' ? '' : +e.currentTarget.value })}>
            <option value="">{t('noneF')}</option>
            {[...new Set([...ALARM_CHOICES, ...(typeof s.alarm === 'number' ? [s.alarm] : [])])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={String(m)}>{alarmText(lang.value, m)}</option>
            ))}
          </select>
        </Field>

        <Field label={t('location')} icon="pin">
          <input type="text" value={s.location} onInput={(e) => set({ location: e.currentTarget.value })} />
        </Field>

        <Field label={t('notes')} icon="edit">
          <textarea rows={3} value={s.notes} onInput={(e) => set({ notes: e.currentTarget.value })} />
        </Field>

        {!more && <Button icon="palette" label={t('moreOptions')} kind="ghost" class="more-options" onClick={() => setMore(true)} />}
        {more && (
          <>
        <Field label={t('category')} icon="tag">
          <select value={s.category} onChange={(e) => set({ category: e.currentTarget.value })}>
            <option value="">{t('fromCalendar')}</option>
            {[...categories.value.values()].map((c) => (
              <option key={c.id} value={c.id}>{categoryName(c, lang.value)}</option>
            ))}
          </select>
        </Field>

        <Field label={t('secondColor')} icon="palette">
          <span class="accent-pick">
            <Button label={t('noneF')} active={!s.accent} onClick={() => set({ accent: null })} />
            <Swatches label={t('secondColor')} colors={ACCENT_PALETTE} value={s.accent} onPick={(accent) => set({ accent })} />
          </span>
        </Field>
          </>
        )}

        {problem && <p class="problem" role="alert">{problem}</p>}

        <footer class="dialog-foot">
          <span class="spacer" />
          <Button label={t('cancel')} onClick={close} />
          <button type="submit" class="btn primary">
            <span>{t('save')}</span>
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
