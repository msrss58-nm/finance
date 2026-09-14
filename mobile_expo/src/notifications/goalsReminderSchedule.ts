// WHEN the monthly Goals reminder fires (pure; port of the Flutter oracle's
// goals_reminder_schedule.dart). Whether there is anything to remind about is
// answered only by the domain's getGoalsDueForReminder(), never here.

/** The approved reminder day: the 2nd — the Goals funding schedule's own transfer day. */
export const GOALS_REMINDER_DAY_OF_MONTH = 2;
/** 09:00 local — the oracle's non-intrusive default (no configurable time is approved). */
export const GOALS_REMINDER_HOUR = 9;
export const GOALS_REMINDER_MINUTE = 0;

/** Lock-screen text: generic on purpose — no amount, no goal name, no count. */
export const GOALS_REMINDER_TITLE = 'תזכורת יעדים';
export const GOALS_REMINDER_BODY = 'הגיע הזמן להעביר את הסכום החודשי לחשבון החיסכון. פתחו את האפליקציה לפרטים.';

/**
 * The next reminder instant strictly AFTER `now`, built field-wise so month
 * and year rollover and DST are handled by local-date construction.
 */
export function nextGoalsReminderDateTime(
  now: Date,
  day: number = GOALS_REMINDER_DAY_OF_MONTH,
  hour: number = GOALS_REMINDER_HOUR,
  minute: number = GOALS_REMINDER_MINUTE,
): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day, hour, minute);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, day, hour, minute);
}
