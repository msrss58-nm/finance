import 'dart:math' as math;

import '../dates/billing_dates.dart';
import '../models/goal.dart';
import '../normalization/legacy_resolvers.dart';
import 'goal_funding.dart';

/// Milestone-5 consolidated monthly Goals reminder — the pure calculation
/// half of app.js ~2432-2530 plus the pure core of
/// `commitConfirmedTransfers()` (~4395).
///
/// OUT OF SCOPE here, deliberately (matching the task contract and app.js's
/// own architecture): no UI/overlay code, no OS notification, no background
/// timer, and NO reminder postponement ("הזכר לי מאוחר יותר"). In app.js
/// postponement lives entirely in the in-memory `reminderSuppressedTokens`
/// map, is never persisted, and is explicitly session/UI state — so it has
/// no domain representation at all.

/// `getCurrentReminderPeriod()` — "which calendar month is today in", in the
/// same local-date-derived `YYYY-MM` shape a confirmedTransfer's
/// `reminderPeriod` uses. app.js derives it from `todayStr()`, i.e. the
/// LOCAL calendar date; [cashflowDateKey] produces the identical string.
String getCurrentReminderPeriod({required DateTime today}) =>
    cashflowDateKey(cashflowDateOnly(today)).substring(0, 7);

/// `isGoalHandledForPeriod(goal, period)`.
///
/// A POSITIVE confirmed-transfer record already covers a goal for [period]
/// if either its own `reminderPeriod` matches, OR — for an older 2-field
/// `{date, amount}` legacy record that predates that field — its transfer
/// date falls in the same `YYYY-MM`.
///
/// Any positive amount counts, including a partial one: no comparison
/// against the suggested amount is made here (approved product rule).
bool isGoalHandledForPeriod(Goal goal, String period) {
  for (final rec in goal.confirmedTransfers) {
    if (!(rec.amount > 0)) continue;
    final String recPeriod;
    if (rec is FullConfirmedTransfer && rec.reminderPeriod.isNotEmpty) {
      recPeriod = rec.reminderPeriod;
    } else {
      // JS `(rec.date || '').slice(0, 7)` — slice never throws on a short
      // string, so the length guard reproduces that leniency.
      recPeriod =
          rec.date.length >= 7 ? rec.date.substring(0, 7) : rec.date;
    }
    if (recPeriod == period) return true;
  }
  return false;
}

/// `buildGoalReminderInfo(goal)` — the reminder-facing view for one goal.
///
/// The OVERDUE amount is summed SEPARATELY from today's regular
/// contribution: never silently merged into one undifferentiated number, and
/// a later, genuinely-on-time component is never mislabeled overdue.
///
/// [suggestedTotal] is the exact amount this goal's reminder row proposes —
/// always >= 0 by construction (every input is an already round2()'d,
/// max-guarded non-negative number).
class GoalReminderInfo {
  final Goal goal;
  final double target;
  final double saved;
  final double confirmed;
  final double remaining;
  final List<GoalFundingBucket> buckets;

  /// Sum of the full remaining amount of every OVERDUE bucket.
  final double overdueAmount;

  /// Sum of every non-overdue bucket's first scheduled amount that falls on
  /// TODAY.
  final double todayContribution;

  /// `round2(overdueAmount + todayContribution)`.
  final double suggestedTotal;

  /// `max(round2(remaining - suggestedTotal), 0)`.
  final double remainingAfterSuggested;

  const GoalReminderInfo({
    required this.goal,
    required this.target,
    required this.saved,
    required this.confirmed,
    required this.remaining,
    required this.buckets,
    required this.overdueAmount,
    required this.todayContribution,
    required this.suggestedTotal,
    required this.remainingAfterSuggested,
  });
}

/// `buildGoalReminderInfo(goal)` — app.js reads `new Date()` here; [now] is
/// injected instead.
GoalReminderInfo buildGoalReminderInfo(Goal goal, {required DateTime now}) {
  final funding = buildGoalReminderScheduleInfo(goal, today: now);
  final today = cashflowDateOnly(now);
  final todayKey = cashflowDateKey(today);

  var overdueAmount = 0.0;
  var todayContribution = 0.0;
  for (final b in funding.buckets) {
    if (b.isCompleted) continue;
    if (b.isOverdue) {
      overdueAmount = round2(overdueAmount + b.remaining);
    } else if (b.perDateAmounts.isNotEmpty &&
        cashflowDateKey(b.perDateAmounts.first.date) == todayKey) {
      todayContribution =
          round2(todayContribution + b.perDateAmounts.first.amount);
    }
  }
  final suggestedTotal = round2(overdueAmount + todayContribution);

  return GoalReminderInfo(
    goal: goal,
    target: funding.target,
    saved: funding.saved,
    confirmed: funding.confirmed,
    remaining: funding.remaining,
    buckets: funding.buckets,
    overdueAmount: overdueAmount,
    todayContribution: todayContribution,
    suggestedTotal: suggestedTotal,
    remainingAfterSuggested:
        math.max(round2(funding.remaining - suggestedTotal), 0.0),
  );
}

/// `isGoalDueForReminderNow(goal)` — whether [goal] should appear in the
/// consolidated reminder RIGHT NOW.
///
/// Three deterministic gates, in app.js's exact order:
/// 1. an archived goal is NEVER due;
/// 2. `suggestedTotal <= 0` is never due (fully funded, or simply not due
///    yet — e.g. before the 2nd, or a component due further out than today);
/// 3. a goal already handled for the current reminder period is never due.
///
/// A goal's own `createdAt` is deliberately not read: a freshly created goal
/// becomes due exactly when its own schedule says so, with no "is this new"
/// branch.
bool isGoalDueForReminderNow(Goal goal, {required DateTime now}) {
  if (goal.isArchived) return false;
  final info = buildGoalReminderInfo(goal, now: now);
  if (info.suggestedTotal <= 0) return false;
  if (isGoalHandledForPeriod(goal, getCurrentReminderPeriod(today: now))) {
    return false;
  }
  return true;
}

/// `getGoalsDueForReminder()` — the full consolidated due-list.
///
/// Goal-array order is preserved (no reordering invented).
///
/// CONTRACT: [goals] must be an ALREADY-VALIDATED dataset (i.e.
/// `GoalsValid.goals`). app.js guards this with `if (!goalsState.valid)
/// return []` — an invalid dataset must never be processed. Use
/// [getGoalsDueForReminderFromState] when you hold a raw [GoalsLoadResult]
/// and want that guard applied for you.
List<GoalReminderInfo> getGoalsDueForReminder(
  List<Goal> goals, {
  required DateTime now,
}) {
  final period = getCurrentReminderPeriod(today: now);
  final due = <GoalReminderInfo>[];
  for (final g in goals) {
    if (g.isArchived) continue;
    final info = buildGoalReminderInfo(g, now: now);
    if (info.suggestedTotal <= 0) continue;
    if (isGoalHandledForPeriod(g, period)) continue;
    due.add(info);
  }
  return due;
}

/// The invalid-dataset guard of `getGoalsDueForReminder()`: returns an empty
/// list immediately, with NO computation attempted, when the stored Goals
/// dataset is invalid.
List<GoalReminderInfo> getGoalsDueForReminderFromState(
  GoalsLoadResult state, {
  required DateTime now,
}) =>
    switch (state) {
      GoalsValid(goals: final goals) => getGoalsDueForReminder(goals, now: now),
      GoalsInvalid() => const <GoalReminderInfo>[],
    };

/// One `{goalId, amount}` entry handed to [applyConfirmedTransfers].
class GoalTransferAllocation {
  final String goalId;
  final num amount;

  const GoalTransferAllocation({required this.goalId, required this.amount});
}

/// Result of [applyConfirmedTransfers].
sealed class ConfirmedTransfersResult {
  const ConfirmedTransfersResult();
}

/// The proposed new goals list. NOTHING has been persisted — persistence is
/// the caller's (repository's) job, exactly as app.js performs the single
/// `localStorage.setItem` only after building this complete proposed state.
final class ConfirmedTransfersApplied extends ConfirmedTransfersResult {
  final List<Goal> goals;
  const ConfirmedTransfersApplied(this.goals);
}

/// Nothing was changed; [message] is app.js's own Hebrew user-facing text.
final class ConfirmedTransfersRejected extends ConfirmedTransfersResult {
  final String message;
  const ConfirmedTransfersRejected(this.message);
}

/// The pure core of `commitConfirmedTransfers(allocations, source)` —
/// app.js ~4395.
///
/// Builds a COMPLETE proposed goals list with every affected goal's new
/// ledger record already appended. It never mutates the input goals (the
/// Dart model is immutable), so "preserve the previous in-memory state,
/// create no partial ledger update" holds by construction — the caller
/// swaps in [ConfirmedTransfersApplied.goals] only if its own single write
/// succeeds.
///
/// Skipped exactly as app.js skips: a non-positive / non-finite amount, and
/// an allocation whose goalId matches no goal. If nothing was touched the
/// whole operation is rejected.
///
/// [nowIso] and [generateId] are injected rather than read from the clock /
/// a module-level counter: app.js uses `nowIsoTimestamp()` (a canonical UTC
/// `YYYY-MM-DDTHH:mm:ss.sssZ` string) and `generateGoalsId('ct')`.
/// The transfer's own `date` is the LOCAL business date derived from [now],
/// matching app.js's `todayStr()`.
///
/// PARITY NOTE: app.js declares a `source` parameter but IGNORES it — the
/// record it writes always hardcodes `'goals_reminder'`. The default here
/// reproduces the live behavior; passing anything else diverges from app.js.
ConfirmedTransfersResult applyConfirmedTransfers(
  GoalsLoadResult state,
  List<GoalTransferAllocation> allocations, {
  required DateTime now,
  required String nowIso,
  required String Function() generateId,
  String source = 'goals_reminder',
}) {
  if (state is! GoalsValid) {
    return const ConfirmedTransfersRejected(
      'לא ניתן לעדכן יעדים בעוד הנתונים המקומיים פגומים.',
    );
  }
  if (allocations.isEmpty) {
    return const ConfirmedTransfersRejected('לא נמצא סכום חיובי לרישום.');
  }

  final period = getCurrentReminderPeriod(today: now);
  final todayD = cashflowDateKey(cashflowDateOnly(now));

  // goalId -> records appended so far, in allocation order (a goal named by
  // two allocations gets two records, exactly like app.js's repeated push).
  final appended = <String, List<ConfirmedTransfer>>{};
  var touchedAny = false;

  for (final alloc in allocations) {
    final amount = alloc.amount;
    if (!(amount > 0) || !amount.isFinite) continue;
    final exists = state.goals.any((g) => g.id == alloc.goalId);
    if (!exists) continue;
    (appended[alloc.goalId] ??= <ConfirmedTransfer>[]).add(
      FullConfirmedTransfer(
        id: generateId(),
        amount: round2(amount),
        date: todayD,
        confirmedAt: nowIso,
        reminderPeriod: period,
        source: source,
      ),
    );
    touchedAny = true;
  }

  if (!touchedAny) {
    return const ConfirmedTransfersRejected('לא נמצא סכום חיובי לרישום.');
  }

  final proposed = <Goal>[
    for (final g in state.goals)
      if (!appended.containsKey(g.id))
        g
      else
        Goal(
          id: g.id,
          title: g.title,
          dueDate: g.dueDate,
          targetAmount: g.targetAmount,
          savedAmount: g.savedAmount,
          components: g.components,
          isArchived: g.isArchived,
          createdAt: g.createdAt,
          updatedAt: nowIso,
          confirmedTransfers: <ConfirmedTransfer>[
            ...g.confirmedTransfers,
            ...appended[g.id]!,
          ],
        ),
  ];

  return ConfirmedTransfersApplied(proposed);
}
