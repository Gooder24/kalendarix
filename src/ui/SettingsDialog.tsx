// Language, looks, and getting calendars in and out.

import { useEffect, useState } from 'preact/hooks';
import { categoryId, categoryName, type Category } from '../core/categories';
import { CATEGORY_PALETTE } from '../core/colors';
import { addCategory, deleteCategory, importCalendars, uid, addCalendar, updateCategory } from '../core/document';
import { generateIcs, parseIcs } from '../core/ics';
import { backend, type NamedText } from '../platform/backend';
import { apply, categories, doc, lang, phoneExportOpen, say, setSettings, settings, settingsOpen, t } from '../state/store';
import { Button, ColorPick, Dialog, DialogHead, Field } from './common';
import { refreshCalendar } from '../state/feeds';

/** Add each .ics file as a calendar of its own. */
export async function importFiles(files: NamedText[]): Promise<void> {
  const calendars = files
    .map((file) => {
      const parsed = parseIcs(file.text);
      return { name: parsed.name || file.name, events: parsed.events };
    })
    .filter((c) => c.events.length);
  if (calendars.length) await apply(importCalendars(calendars));
}

function Choice<T extends string>(props: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div class="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map(([value, label]) => (
        <button type="button" key={value} role="radio" aria-checked={props.value === value} class={props.value === value ? 'active' : ''} onClick={() => props.onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** One of the user's own categories: its colour, its name, and the way to be rid of it. */
function OwnCategory({ category }: { category: Category }) {
  const [picking, setPicking] = useState(false);
  return (
    <li class="own-category">
      <span class="accent-pick">
        <button
          type="button"
          class="swatch"
          style={{ background: category.color }}
          title={t('color')}
          aria-label={t('color')}
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        />
        <input
          type="text"
          aria-label={t('name')}
          value={categoryName(category, lang.value)}
          onChange={(e) => {
            const name = e.currentTarget.value.trim();
            if (name) void apply(updateCategory(category.id, { name }));
            else e.currentTarget.value = categoryName(category, lang.value);
          }}
        />
        <Button icon="trash" title={t('delete')} kind="ghost" onClick={() => void apply(deleteCategory(category.id))} />
      </span>
      {picking && <ColorPick label={t('color')} colors={CATEGORY_PALETTE} value={category.color} onPick={(color) => void apply(updateCategory(category.id, { color }))} />}
    </li>
  );
}

/** The user's own categories, and a line to make another. */
function OwnCategories() {
  const all = [...categories.value.values()];
  const free = (): string => CATEGORY_PALETTE.find((c) => !all.some((category) => category.color === c)) ?? CATEGORY_PALETTE[0];
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const color = picked ?? free();
  const add = (): void => {
    const wanted = name.trim();
    if (!wanted) return;
    void apply(addCategory({ id: categoryId(wanted, categories.value), name: wanted, color }));
    setName('');
    setPicked(null);
  };
  return (
    <ul class="own-categories">
      {all.filter((c) => c.own).map((c) => (
        <OwnCategory key={c.id} category={c} />
      ))}
      <li class="own-category">
        <span class="accent-pick">
          <span class="swatch" style={{ background: color }} />
          <input
            type="text"
            placeholder={t('newCategory')}
            aria-label={t('newCategory')}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button icon="plus" label={t('add')} disabled={!name.trim()} onClick={add} />
        </span>
        {name.trim() && <ColorPick label={t('color')} colors={CATEGORY_PALETTE} value={color} onPick={setPicked} />}
      </li>
    </ul>
  );
}

export function SettingsDialog() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState('');
  const s = settings.value;
  const close = (): void => void (settingsOpen.value = false);
  useEffect(() => void backend.dataPath().then(setPath).catch(() => {}), []);

  const subscribe = async (): Promise<void> => {
    const address = url.trim();
    if (!address) return;
    setBusy(true);
    try {
      const parsed = parseIcs(await backend.fetchUrl(address));
      const id = uid();
      await apply(addCalendar({ id, name: parsed.name || new URL(address).hostname, sourceUrl: address, events: [] }));
      await refreshCalendar(id, address);
      setUrl('');
      say(t('refreshed'));
    } catch (e) {
      say(`${t('failed')}: ${e instanceof Error ? e.message : e}`, true);
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async (): Promise<void> => {
    const files = doc.value.calendars.map((c) => ({ name: c.name || c.id, text: generateIcs(c.name, c.events) }));
    const where = await backend.saveFilesInFolder(files, 'ics');
    if (where) say(`${t('saved')}: ${where}`);
  };

  return (
    <Dialog title={t('settings')} onClose={close} class="form">
      <DialogHead title={t('settings')} onClose={close} />
      <div class="form-body">
        <h3>{t('appearance')}</h3>
        <Field label={t('language')}>
          <Choice label={t('language')} value={s.lang} options={[['sk', 'Slovensky'], ['en', 'English']]} onChange={(lang) => setSettings({ lang })} />
        </Field>
        <Field label={t('theme')}>
          <Choice
            label={t('theme')}
            value={s.appearance}
            options={[['system', t('themeSystem')], ['dark', t('themeDark')], ['light', t('themeLight')]]}
            onChange={(appearance) => setSettings({ appearance })}
          />
        </Field>
        <Field label={t('dualFill')}>
          <div class="dual-choice" role="radiogroup" aria-label={t('dualFill')}>
            {(['accent', 'category'] as const).map((mode) => (
              <button type="button" key={mode} role="radio" aria-checked={s.dualFill === mode} class={`dual ${s.dualFill === mode ? 'picked' : ''}`} onClick={() => setSettings({ dualFill: mode })}>
                <span class="dual-sample" style={mode === 'accent' ? { '--fill': '#7fb3ff', '--stripe': '#4fae6b' } : { '--fill': '#4fae6b', '--stripe': '#7fb3ff' }}>
                  Matematika
                </span>
                <small>{t(mode === 'accent' ? 'dualAccent' : 'dualCategory')}</small>
              </button>
            ))}
          </div>
        </Field>

        <h3>{t('categories')}</h3>
        <OwnCategories />

        <h3>{t('data')}</h3>
        <div class="tools">
          <Button icon="upload" label={t('importIcs')} onClick={() => void backend.pickIcsFiles().then(importFiles).catch((e) => say(String(e), true))} />
          <Button icon="download" label={t('exportAll')} onClick={() => void exportAll().catch((e) => say(String(e), true))} />
          <Button
            icon="phone"
            label={t('exportPhone')}
            onClick={() => {
              close();
              phoneExportOpen.value = true;
            }}
          />
        </div>
        <Field label={t('subscribe')} icon="link">
          <span class="accent-pick">
            <input type="url" placeholder="https://…/calendar.ics" aria-label={t('subscribeUrl')} value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
            <Button label={busy ? t('refreshing') : t('add')} disabled={busy || !url.trim()} onClick={() => void subscribe()} />
          </span>
        </Field>

        <h3>{t('about')}</h3>
        <p class="about">
          Kalendarix {__APP_VERSION__}
          <br />
          <span class="field-hint">{t('dataFile')}: {path}</span>
        </p>

        <footer class="dialog-foot">
          <span class="spacer" />
          <Button label={t('done')} kind="primary" onClick={close} />
        </footer>
      </div>
    </Dialog>
  );
}
