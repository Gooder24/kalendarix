// Export to a feature phone: pick the phone family and what to send.

import { useState } from 'preact/hooks';
import { ALARM_CHOICES, alarmText } from '../core/i18n';
import { PHONE_PROFILES, generatePhoneFile, phoneProfile } from '../core/phone';
import { backend } from '../platform/backend';
import { doc, lang, now, phoneExportOpen, say, setSettings, settings, t } from '../state/store';
import { Button, Dialog, DialogHead, Field } from './common';

export function PhoneExport() {
  const [profileId, setProfileId] = useState(settings.value.lastPhoneProfile);
  const [upcoming, setUpcoming] = useState(true);
  const [alarm, setAlarm] = useState<number | ''>(settings.value.phoneAlarm);
  const [chosen, setChosen] = useState(() => new Set(doc.value.calendars.filter((c) => c.visible !== false).map((c) => c.id)));
  const profile = phoneProfile(profileId);
  const close = (): void => void (phoneExportOpen.value = false);

  const items = doc.value.calendars
    .filter((c) => chosen.has(c.id))
    .flatMap((c) => c.events.map((event) => ({ event, calendarName: c.name })))
    // A repeating event still has occurrences ahead, whenever it began.
    .filter(({ event }) => !upcoming || event.rrule || Date.parse(event.end || event.start) >= now.value)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));

  const save = async (): Promise<void> => {
    setSettings({ lastPhoneProfile: profile.id, phoneAlarm: alarm });
    const text = generatePhoneFile(items, profile, { defaultAlarm: alarm });
    const extension = profile.format === 'iCalendar 2.0' ? 'ics' : 'vcs';
    // The name the scripts in gammu/ look for on the desktop.
    const where = await backend.saveTextFile('kalendarix-export', extension, profile.format, text);
    if (where) {
      say(`${t('saved')}: ${where}`);
      close();
    }
  };

  return (
    <Dialog title={t('exportPhone')} onClose={close} class="form" wide>
      <DialogHead title={t('exportPhone')} onClose={close} />
      <div class="form-body">
        <p class="field-hint">{t('phoneHint')}</p>
        <div class="phone-grid" role="radiogroup" aria-label={t('phone')}>
          {PHONE_PROFILES.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={p.id === profile.id} class={`phone ${p.id === profile.id ? 'picked' : ''}`} onClick={() => setProfileId(p.id)}>
              <strong>{p.name}</strong>
              <small>{p.examples}</small>
              <small>{p.format} · {p.charset}</small>
            </button>
          ))}
        </div>

        <Field label={t('calendars')} icon="calendar">
          <span class="check-list">
            {doc.value.calendars.map((c) => (
              <label class="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={chosen.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.currentTarget.checked) next.add(c.id);
                    else next.delete(c.id);
                    setChosen(next);
                  }}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </span>
        </Field>

        <Field label={t('range')} icon="clock">
          <select value={upcoming ? 'upcoming' : 'all'} onChange={(e) => setUpcoming(e.currentTarget.value === 'upcoming')}>
            <option value="upcoming">{t('rangeUpcoming')}</option>
            <option value="all">{t('rangeAll')}</option>
          </select>
        </Field>

        {profile.alarm && (
          <Field label={t('defaultAlarm')} icon="bell">
            <select value={String(alarm)} onChange={(e) => setAlarm(e.currentTarget.value === '' ? '' : +e.currentTarget.value)}>
              <option value="">{t('noneF')}</option>
              {ALARM_CHOICES.map((m) => (
                <option key={m} value={String(m)}>{alarmText(lang.value, m)}</option>
              ))}
            </select>
          </Field>
        )}

        <footer class="dialog-foot">
          <span class="field-hint">{items.length} × · gammu/{profile.script}.sh</span>
          <span class="spacer" />
          <Button label={t('cancel')} onClick={close} />
          <Button icon="download" label={t('exportPhone')} kind="primary" disabled={!items.length} onClick={() => void save().catch((e) => say(String(e), true))} />
        </footer>
      </div>
    </Dialog>
  );
}
