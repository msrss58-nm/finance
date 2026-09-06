import 'dart:math' as math;

import '../dates/billing_dates.dart';
import '../models/goal.dart';
import '../normalization/legacy_resolvers.dart';
import 'goal_calculations.dart';

/// `buildGoalFundingBuckets(goal, deadlineSchedulerFn)` — app.js ~2339-2415.
///
/// True COMPONENT-SPECIFIC deadline planning. Each component (or the flat
/// goal itself, when it has no components) is its own independent funding
/// "bucket" with its own effective due date and its own deadline schedule.
///
/// The single pooled `savedAmount + confirmedTransfers` total is NOT
/// attributed per component in the data model, so it is attributed here by
/// the approved rule — EARLIEST-DEADLINE-FIRST (FIFO): buckets are sorted by
/// due date and the pool is applied to the earliest bucket first, then the
/// next, etc. A component due sooner is never left looking underfunded just
/// because a later component's money happens to sit in the same
/// undifferentiated pool.
///
/// Every bucket's own perDateAmounts are then merged into one combined
/// per-calendar-date total ([GoalFundingInfo.mergedPerDateAmounts]) — this
/// answers "how much do I need to transfer on the 2nd of next month",
/// accounting for every still-open component at once.

/// One funding bucket: a component (keyed by the component id) or the whole
/// component-less goal (key `'goal'`).
class GoalFundingBucket {
  /// Component id, or the literal `'goal'` for a component-less goal.
  final String key;

  /// Component name, or the goal title for a component-less goal.
  final String label;

  /// The bucket's face amount (component amount, or the goal target).
  final num amount;

  /// How much of the shared pool this bucket received under FIFO.
  final double saved;

  /// `max(round2(amount - saved), 0)`.
  final double remaining;

  /// The bucket's EFFECTIVE due date (component date, or the inherited goal
  /// date).
  final String dueDate;

  final bool isCompleted;
  final bool isOverdue;
  final List<DateTime> eligibleDates;
  final double? suggestedMonthly;
  final List<TransferDateAmount> perDateAmounts;

  const GoalFundingBucket({
    required this.key,
    required this.label,
    required this.amount,
    required this.saved,
    required this.remaining,
    required this.dueDate,
    required this.isCompleted,
    required this.isOverdue,
    required this.eligibleDates,
    required this.suggestedMonthly,
    required this.perDateAmounts,
  });
}

/// The full return shape of `buildGoalFundingBuckets()` /
/// `buildGoalScheduleInfo()` / `buildGoalReminderScheduleInfo()`.
class GoalFundingInfo {
  final double target;

  /// The goal's own `savedAmount` (round2'd) — NOT including confirmed
  /// transfers.
  final double saved;

  /// Total of the confirmed-transfer ledger.
  final double confirmed;

  /// Goal-level remaining (`goalRemainingAmount`), floored at 0.
  final double remaining;

  /// Goal-level: `remaining <= 0`.
  final bool isCompleted;

  /// Goal-level: true when ANY bucket is overdue.
  final bool isOverdue;

  /// The earliest due date among buckets that STILL need money; falls back
  /// to the goal's own due date when every bucket is funded.
  final String effectiveDueDate;

  /// Buckets in earliest-deadline-first order (the same order the FIFO pool
  /// allocation walked).
  final List<GoalFundingBucket> buckets;

  /// Every bucket's perDateAmounts merged per calendar day, ascending by
  /// date key.
  final List<TransferDateAmount> mergedPerDateAmounts;

  const GoalFundingInfo({
    required this.target,
    required this.saved,
    required this.confirmed,
    required this.remaining,
    required this.isCompleted,
    required this.isOverdue,
    required this.effectiveDueDate,
    required this.buckets,
    required this.mergedPerDateAmounts,
  });

  /// The single soonest combined transfer date, or null when nothing is
  /// scheduled (fully funded, or fully overdue).
  DateTime? get nextTransferDate =>
      mergedPerDateAmounts.isNotEmpty ? mergedPerDateAmounts.first.date : null;

  /// The amount due on [nextTransferDate], or null.
  double? get nextTransferAmount =>
      mergedPerDateAmounts.isNotEmpty ? mergedPerDateAmounts.first.amount : null;
}

class _RawBucket {
  final String key;
  final String label;
  final num amount;
  final String dueDate;

  /// Original insertion index — used to keep the due-date sort STABLE.
  /// JS `Array.prototype.sort` has been required to be stable since ES2019
  /// and app.js relies on that for equal due dates; Dart's `List.sort` is
  /// NOT stable, so the index is an explicit tiebreaker.
  final int order;

  const _RawBucket({
    required this.key,
    required this.label,
    required this.amount,
    required this.dueDate,
    required this.order,
  });
}

/// `buildGoalFundingBuckets(goal, deadlineSchedulerFn)`.
///
/// [scheduler] supplies the DATE SEQUENCE each deadline is scheduled against
/// — the only thing that legitimately differs between the Goals-card view
/// and the reminder view. Use [buildGoalScheduleInfo] /
/// [buildGoalReminderScheduleInfo] rather than calling this directly.
GoalFundingInfo buildGoalFundingBuckets(Goal goal, DeadlineScheduler scheduler) {
  final target = goalTargetAmount(goal);
  final saved = round2(goal.savedAmount);
  final confirmed = goalConfirmedTransfersTotal(goal);
  final remaining = goalRemainingAmount(goal);
  final pool = round2(saved + confirmed);

  final rawBuckets = <_RawBucket>[];
  if (goal.components.isNotEmpty) {
    for (var i = 0; i < goal.components.length; i++) {
      final c = goal.components[i];
      rawBuckets.add(_RawBucket(
        key: c.id,
        label: c.name,
        amount: c.amount,
        dueDate: resolveComponentEffectiveDueDate(c, goal),
        order: i,
      ));
    }
  } else {
    rawBuckets.add(_RawBucket(
      key: 'goal',
      label: goal.title,
      amount: target,
      dueDate: goal.dueDate,
      order: 0,
    ));
  }

  // Earliest deadline first. app.js compares the raw 'YYYY-MM-DD' STRINGS
  // (`a.dueDate < b.dueDate`), which is a correct chronological ordering for
  // that fixed-width format; String.compareTo is the same lexicographic
  // comparison.
  rawBuckets.sort((a, b) {
    final byDate = a.dueDate.compareTo(b.dueDate);
    if (byDate != 0) return byDate;
    return a.order.compareTo(b.order);
  });

  var poolRemaining = pool;
  final buckets = <GoalFundingBucket>[];
  for (final rb in rawBuckets) {
    final faceAmount = rb.amount.toDouble();
    final allocated = round2(math.max(0.0, math.min(faceAmount, poolRemaining)));
    poolRemaining = round2(poolRemaining - allocated);
    final bucketRemaining = math.max(round2(faceAmount - allocated), 0.0);
    final sched = scheduler(bucketRemaining, rb.dueDate);
    buckets.add(GoalFundingBucket(
      key: rb.key,
      label: rb.label,
      amount: rb.amount,
      saved: allocated,
      remaining: sched.remaining,
      dueDate: rb.dueDate,
      isCompleted: sched.isCompleted,
      isOverdue: sched.isOverdue,
      eligibleDates: sched.eligibleDates,
      suggestedMonthly: sched.suggestedMonthly,
      perDateAmounts: sched.perDateAmounts,
    ));
  }

  final isCompleted = remaining <= 0;
  var isOverdue = false;
  for (final b in buckets) {
    if (b.isOverdue) {
      isOverdue = true;
      break;
    }
  }

  // Merge every bucket's per-date amounts into one combined per-day total.
  final mergedMap = <String, double>{};
  final mergedDates = <String, DateTime>{};
  for (final b in buckets) {
    for (final pd in b.perDateAmounts) {
      final dk = cashflowDateKey(pd.date);
      if (!mergedMap.containsKey(dk)) {
        mergedMap[dk] = 0.0;
        mergedDates[dk] = pd.date;
      }
      mergedMap[dk] = round2(mergedMap[dk]! + pd.amount);
    }
  }
  final mergedKeys = mergedMap.keys.toList()..sort();
  final mergedPerDateAmounts = <TransferDateAmount>[
    for (final k in mergedKeys)
      TransferDateAmount(date: mergedDates[k]!, amount: mergedMap[k]!),
  ];

  // The earliest due date among buckets that STILL need money — an
  // already-funded early component no longer drives urgency.
  var effectiveDueDate = goal.dueDate;
  for (final b in buckets) {
    if (b.remaining > 0) {
      effectiveDueDate = b.dueDate;
      break;
    }
  }

  return GoalFundingInfo(
    target: target,
    saved: saved,
    confirmed: confirmed,
    remaining: remaining,
    isCompleted: isCompleted,
    isOverdue: isOverdue,
    effectiveDueDate: effectiveDueDate,
    buckets: buckets,
    mergedPerDateAmounts: mergedPerDateAmounts,
  );
}

/// `buildGoalScheduleInfo(goal)` — the Goals-card view ("next upcoming 2nd"
/// cadence).
GoalFundingInfo buildGoalScheduleInfo(Goal goal, {required DateTime today}) =>
    buildGoalFundingBuckets(goal, goalsCardDeadlineScheduler(today: today));

/// `buildGoalReminderScheduleInfo(goal)` — the reminder view ("today is
/// immediate" cadence).
GoalFundingInfo buildGoalReminderScheduleInfo(
  Goal goal, {
  required DateTime today,
}) =>
    buildGoalFundingBuckets(goal, reminderDeadlineScheduler(today: today));
