// Stage 0 local-notification probe. Opt-in permission, one owned reminder,
// generic privacy-safe text (no amounts, no goal names), tap -> pending route
// that is only consumed after unlock.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { record } from './log';
import { nextMonthlyInstant } from './synthetic';

export const REMINDER_ID = 'goals-reminder';
export const CHANNEL_ID = 'goals_reminder';
export const REMINDER_TITLE = 'תזכורת יעדים';
export const REMINDER_BODY = 'הגיע הזמן להעביר את הסכום החודשי לחשבון החיסכון. פתחו את האפליקציה לפרטים.';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'תזכורת יעדים',
    description: 'תזכורת חודשית להעברת הסכום ליעדי החיסכון',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function permissionStatus(): Promise<string> {
  const p = await Notifications.getPermissionsAsync();
  return p.status;
}

/** Opt-in: the ONLY place permission is requested. */
export async function enableReminders(): Promise<void> {
  try {
    await ensureChannel();
    const before = await Notifications.getPermissionsAsync();
    const after = before.granted ? before : await Notifications.requestPermissionsAsync();
    record('notify', 'permission', after.granted, `before=${before.status} after=${after.status} canAskAgain=${after.canAskAgain}`);
  } catch (e) {
    record('notify', 'permission', false, String(e));
  }
}

async function scheduleAt(when: Date, label: string): Promise<void> {
  try {
    await ensureChannel();
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    const id = await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title: REMINDER_TITLE, body: REMINDER_BODY, data: { route: 'goals' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
    });
    const all = await Notifications.getAllScheduledNotificationsAsync();
    record('notify', `schedule-${label}`, id === REMINDER_ID && all.length === 1, `id=${id} at=${when.toString()} scheduledCount=${all.length}`);
  } catch (e) {
    record('notify', `schedule-${label}`, false, String(e));
  }
}

export function scheduleInSeconds(seconds: number): Promise<void> {
  return scheduleAt(new Date(Date.now() + seconds * 1000), `in-${seconds}s`);
}

export function scheduleNextMonthly(): Promise<void> {
  return scheduleAt(nextMonthlyInstant(new Date()), 'next-2nd-0900');
}

export async function cancelReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    const all = await Notifications.getAllScheduledNotificationsAsync();
    record('notify', 'cancel', all.length === 0, `scheduledCount=${all.length}`);
  } catch (e) {
    record('notify', 'cancel', false, String(e));
  }
}

export async function listScheduled(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  record('notify', 'list', true, `count=${all.length} ids=${all.map((n) => n.identifier).join(',')}`);
}
