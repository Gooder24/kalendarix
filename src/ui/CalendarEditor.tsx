// A calendar's name, what kind it is, and its colours.

import { useState } from 'preact/hooks';
import { categoryById, categoryName, guessCategory } from '../core/categories';
import { CALENDAR_PALETTE, calendarColor, textOn } from '../core/colors';
import { addCalendar, deleteCalendar, nextCalendarColor, uid, updateCalendar } from '../core/document';
import { countEvents } from '../core/i18n';
import { generateIcs } from '../core/ics';
import { backend } from '../platform/backend';
import { refreshCalendar } from '../state/feeds';
import { apply, calendarEditor, categories, doc, lang, say, t } from '../state/store';
import { Button, ColorPick, Dialog, DialogHead, Field } from './common';

export function CalendarEditor({ id }: { id: string }) {
  const existing = id === 'new' ? null : (doc.value.calendars.find((c) => c.id === id) ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  // '' is "no category": the calendar has a colour of its own.
  const [category, setCategory] = useState<string | null>(existing ? (categoryById(categories.value, existing.category)?.id ?? '') : null);
  const [color, setColor] = useState(existing ? calendarColor(existing, categories.value) : nextCalendarColor(doc.value));
  const [autoAccent, setAutoAccent] = useState(existing?.autoAccent === true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = (): void => void (calendarEditor.value = null);

  // Until somebody chooses, a new calendar is whatever its name says it is.
  const chosen = category ?? guessCategory(name, categories.value)?.id ?? '';
  const fixed = categoryById(categories.value, chosen);
  const shown = fixed?.color ?? color;

  const save = (): void => {
    const fields = {
      name: name.trim() || t('newCalendar'),
      category: chosen,
      autoAccent,
      ...(fixed ? {} : { color, customColor: color }),
    };
    void apply(existing ? updateCalendar(existing.id, fields) : addCalendar({ id: uid(), ...fields }));
    close();
  };

  return (
    <Dialog title={existing ? t('editCalendar') : t('newCalendar')} onClose={close} class="form">
      <DialogHead title={existing ? t('editCalendar') : t('newCalendar')} onClose={close} />
      <form
        class="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div class="cal-preview" style={{ background: shown, color: textOn(shown) }}>
          {name.trim() || t('newCalendar')}
          {fixed && <small>{categoryName(fixed, lang.value)}</small>}
        </div>

        <Field label={t('name')}>
          <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} data-focus />
        </Field>

        <Field label={t('category')} icon="tag">
          <div class="category-grid" role="radiogroup" aria-label={t('category')}>
            {[...categories.value.values()].map((c) => (
              <button
                type="button"
                key={c.id}
                role="radio"
                aria-checked={chosen === c.id}
                class={`category ${chosen === c.id ? 'picked' : ''}`}
                style={{ '--fill': c.color, '--ink': textOn(c.color) }}
                onClick={() => setCategory(c.id)}
              >
                {categoryName(c, lang.value)}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={chosen === ''} class={`category own ${chosen === '' ? 'picked' : ''}`} onClick={() => setCategory('')}>
              {t('ownColor')}
            </button>
          </div>
        </Field>

        {!fixed && (
          <Field label={t('color')} icon="palette">
            <ColorPick label={t('color')} colors={CALENDAR_PALETTE} value={color} onPick={setColor} />
          </Field>
        )}

        <label class="check">
          <input type="checkbox" checked={autoAccent} onChange={(e) => setAutoAccent(e.currentTarget.checked)} />
          <span>
            {t('autoAccent')}
            <small>{t('autoAccentHint')}</small>
          </span>
        </label>

        {existing && (
          <div class="cal-tools">
            <span class="field-hint">{countEvents(lang.value, existing.events.length)}</span>
            <Button
              icon="download"
              label={t('exportIcs')}
              onClick={() => void backend.saveTextFile(existing.name || 'kalendar', 'ics', 'iCalendar', generateIcs(existing.name, existing.events)).then((path) => path && say(`${t('saved')}: ${path}`))}
            />
            {existing.sourceUrl && (
              <Button
                icon="repeat"
                label={busy ? t('refreshing') : t('refresh')}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  refreshCalendar(existing.id, existing.sourceUrl!)
                    .then(() => say(t('refreshed')))
                    .catch((e) => say(`${t('failed')}: ${e instanceof Error ? e.message : e}`, true))
                    .finally(() => setBusy(false));
                }}
              />
            )}
          </div>
        )}

        <footer class="dialog-foot">
          {existing && !confirming && <Button icon="trash" label={t('delete')} kind="danger" onClick={() => setConfirming(true)} />}
          {existing && confirming && (
            <>
              <span class="ask">{t('confirmDeleteCalendar')}</span>
              <Button
                label={t('delete')}
                kind="danger"
                onClick={() => {
                  void apply(deleteCalendar(existing.id));
                  close();
                }}
              />
            </>
          )}
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
