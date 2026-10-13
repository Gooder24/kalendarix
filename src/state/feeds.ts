// Calendars subscribed from an .ics address: fetched when the app starts and
// every half hour while it is open, and on request.

import { replaceRemote } from '../core/document';
import { isCalendarText, parseIcs } from '../core/ics';
import { backend } from '../platform/backend';
import { apply, doc } from './store';

const EVERY = 30 * 60_000;

/** Download a subscribed calendar again and put it in place of the last download. */
export async function refreshCalendar(calId: string, url: string): Promise<void> {
  const text = await backend.fetchUrl(url);
  // A login page or a download cut short answers "200 OK" too; only a whole calendar may replace the last one.
  if (!isCalendarText(text)) throw new Error('not an iCalendar file');
  await apply(replaceRemote(calId, parseIcs(text).events));
}

/** Refresh every subscribed calendar; one that cannot be reached keeps what it had. */
export async function refreshAll(): Promise<void> {
  const feeds = doc.value.calendars.filter((c) => typeof c.sourceUrl === 'string' && c.sourceUrl);
  await Promise.allSettled(feeds.map((c) => refreshCalendar(c.id, c.sourceUrl as string)));
}

export function keepFeedsFresh(): void {
  void refreshAll();
  setInterval(() => void refreshAll(), EVERY);
}
