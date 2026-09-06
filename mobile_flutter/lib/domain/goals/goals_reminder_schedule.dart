/// Milestone 9 — WHEN the monthly Goals reminder should fire.
///
/// Pure date arithmetic only: no notification API, no repository, no clock
/// read (the caller injects `now`). The financial question — whether there
/// is anything to remind about — is answered by the pre-existing
/// `getGoalsDueForReminder()`, never here.
library;

/// The approved reminder day: the 2nd of each month.
///
/// This is not a new product decision. The whole Goals funding schedule
/// already treats the 2nd as the transfer day
/// (`getUpcomingEligibleTransferDates()` builds its sequence from
/// `DateTime(y, m, 2)`), and the Web app's reminder becomes actionable from
/// the 2nd onward. The notification simply fires on that same day.
const int kGoalsReminderDayOfMonth = 2;

/// The reminder's local wall-clock time.
///
/// No authoritative clock time existed anywhere before this milestone: the
/// Web reminder is an overlay shown on app load, so it has no time of day at
/// all. 09:00 local is chosen here as a deliberately non-intrusive default —
/// inside ordinary waking hours, not first thing in the morning, and far
/// from any quiet-hours window. It is a constant rather than a setting on
/// purpose: no product decision authorises a user-configurable reminder time
/// yet.
const int kGoalsReminderHour = 9;
const int kGoalsReminderMinute = 0;

/// The next moment the monthly reminder should fire, strictly AFTER [now].
///
/// Built field-wise (`DateTime(year, month + 1, 2, 9, 0)`) rather than by
/// adding a `Duration`, which is what makes every calendar edge correct for
/// free:
///   - month rollover: month 13 normalises to January of the next year;
///   - year rollover: December -> January is the same normalisation;
///   - February: the 2nd exists in every month, so no clamping is ever
///     needed and a short month changes nothing;
///   - DST: a local `DateTime` is resolved to its absolute instant by the
///     platform's own zone rules FOR THAT DATE, so the reminder keeps its
///     09:00 local wall-clock meaning across a transition.
///
/// "Strictly after" matters: a reminder scheduled at an instant that has
/// already passed would be delivered immediately by the OS.
DateTime nextGoalsReminderDateTime({
  required DateTime now,
  int day = kGoalsReminderDayOfMonth,
  int hour = kGoalsReminderHour,
  int minute = kGoalsReminderMinute,
}) {
  final thisMonth = DateTime(now.year, now.month, day, hour, minute);
  if (thisMonth.isAfter(now)) return thisMonth;
  return DateTime(now.year, now.month + 1, day, hour, minute);
}
