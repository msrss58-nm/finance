// Runs once per process: establishes lock state BEFORE anything sensitive can
// render, applies privacy, then runs the non-interactive probes.
import * as Notifications from 'expo-notifications';
import { I18nManager, Platform } from 'react-native';

import { note, record } from './log';
import { applyPrivacy } from './privacy';
import { PIN_RECORD_KEY, readPinRecordPresent } from './secureProbe';
import { readValue, runSqliteProbe } from './sqliteProbe';
import { dispatchLock, pendingRouteStore } from './stores';
import { addCalendarDays, clampedDate, dateKey, round2 } from './synthetic';

function runDeviceSyntheticChecks(): void {
  record('rtl', 'I18nManager.isRTL', I18nManager.isRTL, `isRTL=${I18nManager.isRTL} os=${Platform.OS} v=${String(Platform.Version)}`);
  record('numbers', 'round2', round2(0.1 + 0.2) === 0.3, `0.1+0.2 -> ${round2(0.1 + 0.2)}`);
  const feb = dateKey(clampedDate(2026, 1, 31));
  const leap = dateKey(clampedDate(2024, 1, 31));
  const yearRoll = dateKey(addCalendarDays(new Date(2026, 11, 31), 1));
  const dst = dateKey(addCalendarDays(new Date(2026, 2, 26), 1));
  record('dates', 'local-calendar', feb === '2026-02-28' && leap === '2024-02-29' && yearRoll === '2027-01-01' && dst === '2026-03-27', `${feb} ${leap} ${yearRoll} ${dst} tzOffsetMin=${new Date().getTimezoneOffset()}`);
  try {
    const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(-1234.5);
    record('intl', 'he-IL-currency', money.includes('₪'), money);
  } catch (e) {
    record('intl', 'he-IL-currency', false, String(e));
  }
}

export async function runBootProbes(): Promise<void> {
  note('boot', 'start');
  runDeviceSyntheticChecks();

  // Security state first: nothing sensitive is routable until this resolves.
  try {
    const configured = await readPinRecordPresent();
    record('secure', 'read-at-boot', true, `pinRecordPresent=${configured}`);
    await applyPrivacy(configured);
    dispatchLock({ type: 'configLoaded', configured });
  } catch (e) {
    record('secure', 'read-at-boot', false, String(e));
    dispatchLock({ type: 'configError', reason: 'secure storage unavailable' });
  }

  await runSqliteProbe();
  record('secure', 'pin-record-not-in-sqlite', (await readValue(PIN_RECORD_KEY)) === null, `key=${PIN_RECORD_KEY}`);

  // Cold start from a notification tap: only a routing hint, gated by lock.
  const last = await Notifications.getLastNotificationResponseAsync();
  if (last) {
    const route = last.notification.request.content.data?.route;
    note('notify', `cold-start tap route=${String(route)}`);
    if (typeof route === 'string') pendingRouteStore.set(route);
    await Notifications.clearLastNotificationResponseAsync();
  }
  note('boot', 'done');
}
