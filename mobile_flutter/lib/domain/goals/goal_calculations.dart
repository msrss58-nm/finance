import 'dart:math' as math;

import '../dates/billing_dates.dart';
import '../models/goal.dart';
import '../normalization/legacy_resolvers.dart';

/// Goals ("יעדים") amount + deadline-schedule primitives, ported from app.js.
///
/// SOURCE OF TRUTH: `app.js` lines ~2181-2310 (goalTargetAmount,
/// goalConfirmedTransfersTotal, goalRemainingAmount, goalProgressPercent,
/// resolveComponentEffectiveDueDate, getLastEligibleTransferDate,
/// getUpcomingEligibleTransferDates, getReminderEligibleTransferDates,
/// buildDeadlineScheduleFromDates, buildDeadlineSchedule,
/// buildReminderDeadlineSchedule).
///
/// CLOCK INJECTION: app.js reads `new Date()` directly inside
/// getUpcomingEligibleTransferDates() / getReminderEligibleTransferDates().
/// Every port here takes `today` as a required parameter instead — domain
/// logic never reads the system clock, so every calculation is
/// deterministic and testable. The JS call sites always passed the current
/// local date, so callers should pass `DateTime.now()`.
///
/// MONTH BASE: JS `Date` months are 0-based, Dart `DateTime` months are
/// 1-based. Both normalize out-of-range months identically
/// (`DateTime(2026, 13, 2)` == 2027-01-02, `DateTime(2026, 0, 2)` ==
/// 2025-12-02), which is exactly what app.js's `new Date(y, m - 1, 2)`
/// rollover relies on.
///
/// DST: no `Duration(days: …)` stepping anywhere — every date is rebuilt
/// field-wise, matching app.js.

/// `goalTargetAmount(goal)` — the single source of truth for the
/// "components sum vs. entered target" rule. A goal WITH components is
/// always the round2()'d sum of its component amounts; only a component-less
/// goal uses its own stored targetAmount.
double goalTargetAmount(Goal goal) {
  if (goal.components.isNotEmpty) {
    num sum = 0;
    for (final c in goal.components) {
      sum += c.amount;
    }
    return round2(sum);
  }
  // JS `goal.targetAmount || 0`: targetAmount is a non-null num in the Dart
  // model (normalizeGoal() already rejected non-numeric values), so the
  // `|| 0` fallback has no reachable effect here.
  return round2(goal.targetAmount);
}

/// `goalConfirmedTransfersTotal(goal)` — sum of every confirmed-transfer
/// amount (legacy 2-field and full Milestone-5 records alike), round2()'d
/// once at the end exactly as app.js does.
double goalConfirmedTransfersTotal(Goal goal) {
  num sum = 0;
  for (final t in goal.confirmedTransfers) {
    sum += t.amount;
  }
  return round2(sum);
}

/// `goalRemainingAmount(goal)` — `max(round2(target - saved - confirmed), 0)`.
/// Floored at 0: an over-funded goal reports 0 remaining, never a negative.
double goalRemainingAmount(Goal goal) {
  final target = goalTargetAmount(goal);
  final saved = round2(goal.savedAmount);
  final confirmed = goalConfirmedTransfersTotal(goal);
  return math.max(round2(target - saved - confirmed), 0.0);
}

/// `goalProgressPercent(goal)` — integer percent, clamped to 0..100.
///
/// Order of operations is preserved exactly: round FIRST, then clamp
/// (`Math.min(100, Math.max(0, Math.round(saved / target * 100)))`). A
/// non-positive target short-circuits to 0 (never a division by zero).
///
/// NOTE: JS `Math.round` rounds a .5 tie toward +Infinity while Dart's
/// `num.round()` rounds a tie away from zero. The two differ only for
/// negative .5 ties, which cannot occur here: the value is clamped at 0 and
/// `saved` is a non-negative amount in every validated dataset.
int goalProgressPercent(Goal goal) {
  final target = goalTargetAmount(goal);
  if (target <= 0) return 0;
  final saved = round2(goal.savedAmount) + goalConfirmedTransfersTotal(goal);
  return math.min(100, math.max(0, (saved / target * 100).round()));
}

/// `resolveComponentEffectiveDueDate(component, goal)` — a component with no
/// own dueDate inherits the parent goal's due date. The ONE place this
/// inheritance rule lives.
///
/// JS uses `component.dueDate || goal.dueDate`, so an EMPTY-STRING component
/// dueDate also falls back to the goal's date; that falsy-empty case is
/// reproduced here explicitly.
String resolveComponentEffectiveDueDate(GoalComponent component, Goal goal) {
  final own = component.dueDate;
  if (own == null || own.isEmpty) return goal.dueDate;
  return own;
}

/// `getLastEligibleTransferDate(dueDateStr)`.
///
/// "If the due date is before the 2nd of its month, the final eligible
/// transfer date is the 2nd of the PREVIOUS month. If the due date is on or
/// after the 2nd, that month's 2nd is eligible." Real calendar arithmetic
/// via month rollover — e.g. 2026-01-01 → 2025-12-02.
///
/// CONTRACT: [dueDateStr] must be a parseable 'YYYY-MM-DD'. Every Goal /
/// GoalComponent due date reaching this function has already been validated
/// by the goal normalizer, so this is unreachable for valid data; an
/// ArgumentError is thrown rather than silently inventing a date (app.js
/// would throw a TypeError at the same point).
DateTime getLastEligibleTransferDate(String dueDateStr) {
  final due = parseLocalDateStr(dueDateStr);
  if (due == null) {
    throw ArgumentError.value(
      dueDateStr,
      'dueDateStr',
      'not a parseable YYYY-MM-DD date',
    );
  }
  final y = due.year;
  var m = due.month;
  final d = due.day;
  if (d < 2) m -= 1;
  // DateTime normalizes month 0 to December of the previous year, matching
  // JS `new Date(y, -1, 2)`.
  return DateTime(y, m, 2);
}

/// `getUpcomingEligibleTransferDates(dueDateStr)` — the Goals-card cadence.
///
/// Every 2nd-of-month from the next upcoming opportunity (today's own 2nd
/// COUNTS when today IS the 2nd — it has not passed yet today) through the
/// last eligible date inclusive. Returns `[]` when the last eligible date is
/// already in the past relative to today (the overdue case) or otherwise
/// before the next upcoming opportunity.
List<DateTime> getUpcomingEligibleTransferDates(
  String dueDateStr, {
  required DateTime today,
}) {
  final last = getLastEligibleTransferDate(dueDateStr);
  final t = cashflowDateOnly(today);
  var firstCandidate = DateTime(t.year, t.month, 2);
  if (firstCandidate.isBefore(t)) {
    firstCandidate = DateTime(t.year, t.month + 1, 2);
  }
  final dates = <DateTime>[];
  var cursor = firstCandidate;
  while (!cursor.isAfter(last)) {
    dates.add(cursor);
    cursor = DateTime(cursor.year, cursor.month + 1, 2);
  }
  return dates;
}

/// `getReminderEligibleTransferDates(dueDateStr)` — the Milestone-5 reminder
/// cadence: TODAY itself is an immediate opportunity.
///
/// - Already overdue (today after the last eligible date) → `[]` (same
///   convention as [getUpcomingEligibleTransferDates]; the overdue amount is
///   handled in full, separately, by buildGoalReminderInfo).
/// - Before the 2nd (day 1 only) → falls back to the exact Goals-card
///   sequence, so nothing looks artificially immediate on day 1.
/// - Otherwise → `[today, next month's 2nd, …, last]`.
List<DateTime> getReminderEligibleTransferDates(
  String dueDateStr, {
  required DateTime today,
}) {
  final last = getLastEligibleTransferDate(dueDateStr);
  final t = cashflowDateOnly(today);
  if (t.isAfter(last)) return const <DateTime>[];
  if (t.day < 2) {
    return getUpcomingEligibleTransferDates(dueDateStr, today: today);
  }
  final dates = <DateTime>[t];
  var cursor = DateTime(t.year, t.month + 1, 2);
  while (!cursor.isAfter(last)) {
    dates.add(cursor);
    cursor = DateTime(cursor.year, cursor.month + 1, 2);
  }
  return dates;
}

/// One `{date, amount}` entry of a schedule's `perDateAmounts` (and of a
/// funding info's `mergedPerDateAmounts`).
class TransferDateAmount {
  final DateTime date;
  final double amount;

  const TransferDateAmount({required this.date, required this.amount});

  @override
  String toString() =>
      'TransferDateAmount(${cashflowDateKey(date)}, $amount)';
}

/// The result of `buildDeadlineScheduleFromDates(remaining, dueDateStr,
/// eligibleDates)` — a single deadline's funding plan.
class DeadlineSchedule {
  /// The remaining amount this schedule was built for (unchanged input).
  final double remaining;
  final String dueDate;

  /// `remaining <= 0`.
  final bool isCompleted;

  /// Not completed AND no eligible dates left — i.e. the deadline has passed
  /// with money still owed.
  final bool isOverdue;

  final List<DateTime> eligibleDates;

  /// `ceil(remaining / eligibleDates.length)` — null when completed or
  /// overdue.
  final double? suggestedMonthly;

  /// Per-date amounts that sum to EXACTLY [remaining] (the final date
  /// absorbs the remainder). Empty when completed or overdue.
  final List<TransferDateAmount> perDateAmounts;

  const DeadlineSchedule({
    required this.remaining,
    required this.dueDate,
    required this.isCompleted,
    required this.isOverdue,
    required this.eligibleDates,
    required this.suggestedMonthly,
    required this.perDateAmounts,
  });
}

/// `buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates)`.
///
/// Round the monthly suggestion UP to a whole shekel; the final date absorbs
/// whatever remainder is left, so per-date amounts always sum to exactly
/// [remaining]; never negative; an empty [eligibleDates] with remaining > 0
/// means overdue, never a division by zero.
DeadlineSchedule buildDeadlineScheduleFromDates(
  double remaining,
  String dueDateStr,
  List<DateTime> eligibleDates,
) {
  final isCompleted = remaining <= 0;
  final isOverdue = !isCompleted && eligibleDates.isEmpty;

  double? suggestedMonthly;
  final perDateAmounts = <TransferDateAmount>[];
  if (!isCompleted && !isOverdue) {
    suggestedMonthly = (remaining / eligibleDates.length).ceilToDouble();
    var runningRemaining = remaining;
    for (var i = 0; i < eligibleDates.length; i++) {
      final isLast = i == eligibleDates.length - 1;
      var amt = isLast
          ? runningRemaining
          : math.min(suggestedMonthly, runningRemaining);
      amt = math.max(round2(amt), 0.0);
      perDateAmounts.add(TransferDateAmount(date: eligibleDates[i], amount: amt));
      runningRemaining = round2(runningRemaining - amt);
    }
  }

  return DeadlineSchedule(
    remaining: remaining,
    dueDate: dueDateStr,
    isCompleted: isCompleted,
    isOverdue: isOverdue,
    eligibleDates: eligibleDates,
    suggestedMonthly: suggestedMonthly,
    perDateAmounts: perDateAmounts,
  );
}

/// A per-bucket deadline scheduler, i.e. app.js's `deadlineSchedulerFn`
/// parameter of buildGoalFundingBuckets(). The "today" the sequence is
/// measured against is captured by the concrete scheduler (see
/// [goalsCardDeadlineScheduler] / [reminderDeadlineScheduler]).
typedef DeadlineScheduler = DeadlineSchedule Function(
  double remaining,
  String dueDateStr,
);

/// `buildDeadlineSchedule(remaining, dueDateStr)` — the Goals-card
/// scheduler ("next upcoming 2nd" cadence).
DeadlineSchedule buildDeadlineSchedule(
  double remaining,
  String dueDateStr, {
  required DateTime today,
}) {
  final isCompleted = remaining <= 0;
  final eligibleDates = isCompleted
      ? const <DateTime>[]
      : getUpcomingEligibleTransferDates(dueDateStr, today: today);
  return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
}

/// `buildReminderDeadlineSchedule(remaining, dueDateStr)` — the reminder
/// scheduler ("today is immediate" cadence).
DeadlineSchedule buildReminderDeadlineSchedule(
  double remaining,
  String dueDateStr, {
  required DateTime today,
}) {
  final isCompleted = remaining <= 0;
  final eligibleDates = isCompleted
      ? const <DateTime>[]
      : getReminderEligibleTransferDates(dueDateStr, today: today);
  return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
}

/// [DeadlineScheduler] bound to a fixed [today], for the Goals-card view.
DeadlineScheduler goalsCardDeadlineScheduler({required DateTime today}) =>
    (remaining, dueDateStr) =>
        buildDeadlineSchedule(remaining, dueDateStr, today: today);

/// [DeadlineScheduler] bound to a fixed [today], for the reminder view.
DeadlineScheduler reminderDeadlineScheduler({required DateTime today}) =>
    (remaining, dueDateStr) =>
        buildReminderDeadlineSchedule(remaining, dueDateStr, today: today);
