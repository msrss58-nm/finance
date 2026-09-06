import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/domain/dates/billing_dates.dart';
import 'package:familyfinance_pro/domain/goals/goal_calculations.dart';
import 'package:familyfinance_pro/domain/goals/goal_funding.dart';
import 'package:familyfinance_pro/domain/goals/goal_reminders.dart';
import 'package:familyfinance_pro/domain/models/goal.dart';

// Every expected value below is derived from app.js's own Goals region
// (~lines 2181-2530 + commitConfirmedTransfers ~4395). Non-obvious
// derivations are worked out inline in comments.

const _iso = '2026-01-01T00:00:00.000Z';

Goal _goal({
  String id = 'g1',
  String title = 'יעד',
  String dueDate = '2026-09-01',
  num targetAmount = 0,
  num savedAmount = 0,
  List<GoalComponent> components = const [],
  bool isArchived = false,
  List<ConfirmedTransfer> confirmedTransfers = const [],
  String updatedAt = _iso,
}) {
  return Goal(
    id: id,
    title: title,
    dueDate: dueDate,
    targetAmount: targetAmount,
    savedAmount: savedAmount,
    components: components,
    isArchived: isArchived,
    createdAt: _iso,
    updatedAt: updatedAt,
    confirmedTransfers: confirmedTransfers,
  );
}

GoalComponent _comp(String id, String name, num amount, [String? dueDate]) =>
    GoalComponent(id: id, name: name, amount: amount, dueDate: dueDate);

List<String> _keys(Iterable<DateTime> dates) =>
    dates.map(cashflowDateKey).toList();

List<String> _amountKeys(Iterable<TransferDateAmount> list) =>
    list.map((e) => '${cashflowDateKey(e.date)}=${e.amount}').toList();

void main() {
  // ==========================================================================
  group('goalTargetAmount', () {
    test('components present: sum of component amounts wins over stored target',
        () {
      // app.js: `if (goal.components.length > 0) return round2(sum)` — the
      // stored targetAmount is NOT consulted at all in that branch.
      final g = _goal(
        targetAmount: 999,
        components: [_comp('c1', 'א', 1000), _comp('c2', 'ב', 2500.5)],
      );
      expect(goalTargetAmount(g), 3500.5);
    });

    test('no components: uses the stored targetAmount', () {
      expect(goalTargetAmount(_goal(targetAmount: 5000)), 5000.0);
    });

    test('no components and a zero target is a valid 0', () {
      expect(goalTargetAmount(_goal(targetAmount: 0)), 0.0);
    });

    test('component sum is round2()-ed once at the end', () {
      // 0.1 + 0.2 == 0.30000000000000004 in IEEE-754; round2 collapses it.
      final g = _goal(
        components: [_comp('c1', 'א', 0.1), _comp('c2', 'ב', 0.2)],
      );
      expect(goalTargetAmount(g), 0.3);
    });
  });

  // ==========================================================================
  group('goalConfirmedTransfersTotal', () {
    test('empty ledger is 0', () {
      expect(goalConfirmedTransfersTotal(_goal()), 0.0);
    });

    test('legacy and full records are summed alike', () {
      final g = _goal(confirmedTransfers: const [
        LegacyConfirmedTransfer(date: '2026-03-04', amount: 100.5),
        FullConfirmedTransfer(
          date: '2026-04-02',
          amount: 200.25,
          id: 'ct_1',
          confirmedAt: _iso,
          reminderPeriod: '2026-04',
          source: 'goals_reminder',
        ),
      ]);
      expect(goalConfirmedTransfersTotal(g), 300.75);
    });
  });

  // ==========================================================================
  group('goalRemainingAmount', () {
    test('target - saved - confirmed', () {
      final g = _goal(
        targetAmount: 5000,
        savedAmount: 1000,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-03-04', amount: 500),
        ],
      );
      expect(goalRemainingAmount(g), 3500.0);
    });

    test('over-funded is floored at 0, never negative', () {
      final g = _goal(
        targetAmount: 1000,
        savedAmount: 800,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-03-04', amount: 500),
        ],
      );
      expect(goalRemainingAmount(g), 0.0);
    });
  });

  // ==========================================================================
  group('goalProgressPercent', () {
    test('non-positive target short-circuits to 0', () {
      expect(goalProgressPercent(_goal(targetAmount: 0, savedAmount: 50)), 0);
    });

    test('savedAmount + confirmed transfers count toward progress', () {
      final g = _goal(
        targetAmount: 1000,
        savedAmount: 150,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-03-04', amount: 100),
        ],
      );
      expect(goalProgressPercent(g), 25);
    });

    test('clamped to 100 when over-funded', () {
      final g = _goal(
        targetAmount: 1000,
        savedAmount: 800,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-03-04', amount: 500),
        ],
      );
      expect(goalProgressPercent(g), 100);
    });

    test('rounds to a whole percent', () {
      // 1 / 3 * 100 == 33.333… -> Math.round -> 33
      expect(goalProgressPercent(_goal(targetAmount: 3, savedAmount: 1)), 33);
      // 2 / 3 * 100 == 66.666… -> 67
      expect(goalProgressPercent(_goal(targetAmount: 3, savedAmount: 2)), 67);
    });

    test('zero saved is 0', () {
      expect(goalProgressPercent(_goal(targetAmount: 1000)), 0);
    });
  });

  // ==========================================================================
  group('resolveComponentEffectiveDueDate', () {
    final g = _goal(dueDate: '2026-09-01');

    test('own due date wins', () {
      expect(
        resolveComponentEffectiveDueDate(_comp('c', 'א', 10, '2026-03-15'), g),
        '2026-03-15',
      );
    });

    test('missing due date inherits the goal due date', () {
      expect(resolveComponentEffectiveDueDate(_comp('c', 'א', 10), g),
          '2026-09-01');
    });

    test('empty-string due date also inherits (JS falsy `||` fallback)', () {
      expect(resolveComponentEffectiveDueDate(_comp('c', 'א', 10, ''), g),
          '2026-09-01');
    });
  });

  // ==========================================================================
  group('getLastEligibleTransferDate', () {
    test('due date after the 2nd -> that month\'s 2nd', () {
      expect(cashflowDateKey(getLastEligibleTransferDate('2026-06-15')),
          '2026-06-02');
    });

    test('due date exactly on the 2nd -> that same 2nd', () {
      expect(cashflowDateKey(getLastEligibleTransferDate('2026-06-02')),
          '2026-06-02');
    });

    test('due date on the 1st (before the 2nd) -> PREVIOUS month\'s 2nd', () {
      expect(cashflowDateKey(getLastEligibleTransferDate('2026-06-01')),
          '2026-05-02');
    });

    test('January 1st rolls back into the previous YEAR', () {
      expect(cashflowDateKey(getLastEligibleTransferDate('2026-01-01')),
          '2025-12-02');
    });

    test('March 1st rolls back into February', () {
      expect(cashflowDateKey(getLastEligibleTransferDate('2026-03-01')),
          '2026-02-02');
    });

    test('leap-year February', () {
      // 2024 is a leap year; the 2nd exists in every month regardless, but
      // this pins the rollover across a 29-day February.
      expect(cashflowDateKey(getLastEligibleTransferDate('2024-03-01')),
          '2024-02-02');
      expect(cashflowDateKey(getLastEligibleTransferDate('2024-02-29')),
          '2024-02-02');
    });

    test('unparseable date throws rather than inventing a date', () {
      expect(() => getLastEligibleTransferDate('not-a-date'),
          throwsA(isA<ArgumentError>()));
    });
  });

  // ==========================================================================
  group('getUpcomingEligibleTransferDates (Goals-card cadence)', () {
    // due '2026-06-15' -> last eligible = 2026-06-02.
    const due = '2026-06-15';

    test('today IS the 2nd: today counts, it has not passed yet', () {
      final dates =
          getUpcomingEligibleTransferDates(due, today: DateTime(2026, 4, 2));
      expect(_keys(dates), ['2026-04-02', '2026-05-02', '2026-06-02']);
    });

    test('today AFTER the 2nd: rolls to next month\'s 2nd', () {
      final dates =
          getUpcomingEligibleTransferDates(due, today: DateTime(2026, 4, 3));
      expect(_keys(dates), ['2026-05-02', '2026-06-02']);
    });

    test('today BEFORE the 2nd: this month\'s 2nd is still upcoming', () {
      final dates =
          getUpcomingEligibleTransferDates(due, today: DateTime(2026, 4, 1));
      expect(_keys(dates), ['2026-04-02', '2026-05-02', '2026-06-02']);
    });

    test('overdue (last eligible already past) -> empty list', () {
      final dates =
          getUpcomingEligibleTransferDates(due, today: DateTime(2026, 6, 3));
      expect(dates, isEmpty);
    });

    test('today exactly the last eligible date -> that single date', () {
      final dates =
          getUpcomingEligibleTransferDates(due, today: DateTime(2026, 6, 2));
      expect(_keys(dates), ['2026-06-02']);
    });

    test('a time-of-day component is stripped (cashflowDateOnly)', () {
      final dates = getUpcomingEligibleTransferDates(
        due,
        today: DateTime(2026, 4, 2, 23, 59, 59),
      );
      expect(_keys(dates), ['2026-04-02', '2026-05-02', '2026-06-02']);
    });

    test('December -> January rollover', () {
      // due 2027-01-15 -> last = 2027-01-02; today 2026-11-05 is after the
      // 2nd, so the first candidate is 2026-12-02.
      final dates = getUpcomingEligibleTransferDates('2027-01-15',
          today: DateTime(2026, 11, 5));
      expect(_keys(dates), ['2026-12-02', '2027-01-02']);
    });

    test('cursor steps across the year boundary', () {
      final dates = getUpcomingEligibleTransferDates('2027-02-15',
          today: DateTime(2026, 12, 3));
      expect(_keys(dates), ['2027-01-02', '2027-02-02']);
    });

    test('steps across a leap February', () {
      final dates = getUpcomingEligibleTransferDates('2024-03-15',
          today: DateTime(2024, 1, 5));
      expect(_keys(dates), ['2024-02-02', '2024-03-02']);
    });
  });

  // ==========================================================================
  group('getReminderEligibleTransferDates ("today is immediate")', () {
    const due = '2026-06-15'; // last eligible = 2026-06-02

    test('on/after the 2nd: TODAY itself is the first opportunity', () {
      final dates =
          getReminderEligibleTransferDates(due, today: DateTime(2026, 4, 10));
      expect(_keys(dates), ['2026-04-10', '2026-05-02', '2026-06-02']);
    });

    test('day 1 falls back to the Goals-card sequence', () {
      final dates =
          getReminderEligibleTransferDates(due, today: DateTime(2026, 4, 1));
      expect(_keys(dates), ['2026-04-02', '2026-05-02', '2026-06-02']);
    });

    test('already overdue -> empty list (handled separately, in full)', () {
      final dates =
          getReminderEligibleTransferDates(due, today: DateTime(2026, 6, 3));
      expect(dates, isEmpty);
    });

    test('today exactly the last eligible date -> just today', () {
      final dates =
          getReminderEligibleTransferDates(due, today: DateTime(2026, 6, 2));
      expect(_keys(dates), ['2026-06-02']);
    });
  });

  // ==========================================================================
  group('buildDeadlineScheduleFromDates', () {
    test('remaining <= 0 -> completed, no schedule', () {
      final s = buildDeadlineScheduleFromDates(0, '2026-06-15', const []);
      expect(s.isCompleted, isTrue);
      expect(s.isOverdue, isFalse);
      expect(s.suggestedMonthly, isNull);
      expect(s.perDateAmounts, isEmpty);
    });

    test('remaining > 0 with no eligible dates -> overdue, no division', () {
      final s = buildDeadlineScheduleFromDates(1000, '2026-06-15', const []);
      expect(s.isCompleted, isFalse);
      expect(s.isOverdue, isTrue);
      expect(s.suggestedMonthly, isNull);
      expect(s.perDateAmounts, isEmpty);
    });

    test('rounds up to a whole shekel; the LAST date absorbs the remainder',
        () {
      // ceil(1000 / 3) == 334 -> 334, 334, and the last date takes 332.
      final dates = [
        DateTime(2026, 4, 2),
        DateTime(2026, 5, 2),
        DateTime(2026, 6, 2),
      ];
      final s = buildDeadlineScheduleFromDates(1000, '2026-06-15', dates);
      expect(s.suggestedMonthly, 334.0);
      expect(s.perDateAmounts.map((e) => e.amount).toList(),
          [334.0, 334.0, 332.0]);
      // Per-date amounts must sum to EXACTLY `remaining`.
      expect(
        s.perDateAmounts.fold<double>(0, (a, b) => a + b.amount),
        1000.0,
      );
    });

    test('single eligible date takes the whole remaining amount', () {
      final s = buildDeadlineScheduleFromDates(
          1234.56, '2026-06-15', [DateTime(2026, 6, 2)]);
      expect(s.suggestedMonthly, 1235.0); // ceil(1234.56)
      expect(s.perDateAmounts.single.amount, 1234.56);
    });

    test('more dates than shekels: later dates get 0, never a negative', () {
      // remaining 2 over 4 dates -> ceil(0.5) == 1 -> 1, 1, then 0, 0.
      final dates = [
        DateTime(2026, 3, 2),
        DateTime(2026, 4, 2),
        DateTime(2026, 5, 2),
        DateTime(2026, 6, 2),
      ];
      final s = buildDeadlineScheduleFromDates(2, '2026-06-15', dates);
      expect(s.suggestedMonthly, 1.0);
      expect(s.perDateAmounts.map((e) => e.amount).toList(),
          [1.0, 1.0, 0.0, 0.0]);
    });
  });

  // ==========================================================================
  group('buildGoalFundingBuckets — earliest-deadline-first (FIFO)', () {
    // Goal due 2026-09-01, three buckets with three distinct deadlines.
    Goal multiDeadlineGoal({num savedAmount = 0}) => _goal(
          dueDate: '2026-09-01',
          targetAmount: 3500,
          savedAmount: savedAmount,
          components: [
            _comp('c2', 'טיסה', 2000, '2026-07-10'),
            _comp('c1', 'ריהוט', 1000, '2026-05-10'),
            _comp('c3', 'ביטוח', 500), // inherits 2026-09-01
          ],
        );

    test('buckets are ordered by EARLIEST effective due date', () {
      final info = buildGoalScheduleInfo(multiDeadlineGoal(),
          today: DateTime(2026, 4, 5));
      expect(info.buckets.map((b) => b.key).toList(), ['c1', 'c2', 'c3']);
      expect(info.buckets.map((b) => b.dueDate).toList(),
          ['2026-05-10', '2026-07-10', '2026-09-01']);
    });

    test('the pool is consumed earliest-deadline-first', () {
      // pool = savedAmount 1200 + confirmed 0.
      // c1 (05-10) takes min(1000, 1200) = 1000 -> pool 200
      // c2 (07-10) takes min(2000, 200)  = 200  -> pool 0
      // c3 (09-01) takes 0
      final info = buildGoalScheduleInfo(multiDeadlineGoal(savedAmount: 1200),
          today: DateTime(2026, 4, 5));
      expect(info.buckets.map((b) => b.saved).toList(), [1000.0, 200.0, 0.0]);
      expect(info.buckets.map((b) => b.remaining).toList(),
          [0.0, 1800.0, 500.0]);
      expect(info.buckets[0].isCompleted, isTrue);
      // Goal-level remaining must equal the sum of bucket remainders.
      expect(info.remaining, 2300.0);
    });

    test('PARTIAL funding lands entirely on the earliest deadline', () {
      // pool 700 < c1's 1000: c1 gets all 700, everyone later gets nothing.
      final info = buildGoalScheduleInfo(multiDeadlineGoal(savedAmount: 700),
          today: DateTime(2026, 4, 5));
      expect(info.buckets.map((b) => b.saved).toList(), [700.0, 0.0, 0.0]);
      expect(info.buckets.map((b) => b.remaining).toList(),
          [300.0, 2000.0, 500.0]);
      expect(info.remaining, 2800.0);
    });

    test('confirmed transfers feed the SAME pool as savedAmount', () {
      final g = _goal(
        dueDate: '2026-09-01',
        targetAmount: 3500,
        savedAmount: 400,
        components: [
          _comp('c1', 'ריהוט', 1000, '2026-05-10'),
          _comp('c2', 'טיסה', 2000, '2026-07-10'),
          _comp('c3', 'ביטוח', 500),
        ],
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-03-04', amount: 800),
        ],
      );
      // pool = 400 + 800 = 1200 -> same split as the 1200 case above.
      final info = buildGoalScheduleInfo(g, today: DateTime(2026, 4, 5));
      expect(info.saved, 400.0);
      expect(info.confirmed, 800.0);
      expect(info.buckets.map((b) => b.saved).toList(), [1000.0, 200.0, 0.0]);
    });

    test('per-bucket schedules merge into one per-calendar-date total', () {
      final info = buildGoalScheduleInfo(multiDeadlineGoal(savedAmount: 1200),
          today: DateTime(2026, 4, 5));
      // c1: completed, no dates.
      // c2 (due 07-10 -> last 2026-07-02); today 04-05 is after the 2nd so
      //    the sequence is 05-02, 06-02, 07-02 -> ceil(1800/3) = 600 each.
      // c3 (due 09-01, day 1 -> last 2026-08-02); sequence 05-02, 06-02,
      //    07-02, 08-02 -> ceil(500/4) = 125 each (125*4 == 500 exactly).
      expect(_amountKeys(info.mergedPerDateAmounts), [
        '2026-05-02=725.0',
        '2026-06-02=725.0',
        '2026-07-02=725.0',
        '2026-08-02=125.0',
      ]);
      expect(cashflowDateKey(info.nextTransferDate!), '2026-05-02');
      expect(info.nextTransferAmount, 725.0);
      // The merged plan must fund exactly the goal's remaining amount.
      expect(
        info.mergedPerDateAmounts.fold<double>(0, (a, b) => a + b.amount),
        2300.0,
      );
    });

    test('effectiveDueDate is the earliest bucket that still needs money', () {
      final info = buildGoalScheduleInfo(multiDeadlineGoal(savedAmount: 1200),
          today: DateTime(2026, 4, 5));
      // c1 is fully funded, so urgency moves to c2.
      expect(info.effectiveDueDate, '2026-07-10');
    });

    test('effectiveDueDate falls back to the goal date when fully funded', () {
      final info = buildGoalScheduleInfo(multiDeadlineGoal(savedAmount: 3500),
          today: DateTime(2026, 4, 5));
      expect(info.effectiveDueDate, '2026-09-01');
      expect(info.isCompleted, isTrue);
      expect(info.mergedPerDateAmounts, isEmpty);
      expect(info.nextTransferDate, isNull);
      expect(info.nextTransferAmount, isNull);
    });

    test('equal due dates keep the original component order (stable sort)', () {
      // Both components inherit the goal due date, so the comparator ties.
      final g = _goal(
        dueDate: '2026-09-01',
        targetAmount: 3000,
        savedAmount: 1000,
        components: [_comp('first', 'א', 1000), _comp('second', 'ב', 2000)],
      );
      final info = buildGoalScheduleInfo(g, today: DateTime(2026, 4, 5));
      expect(info.buckets.map((b) => b.key).toList(), ['first', 'second']);
      expect(info.buckets.map((b) => b.saved).toList(), [1000.0, 0.0]);
    });

    test('a component-less goal becomes a single "goal" bucket', () {
      final g = _goal(
        title: 'חופשה',
        dueDate: '2026-06-15',
        targetAmount: 1000,
        savedAmount: 400,
      );
      final info = buildGoalScheduleInfo(g, today: DateTime(2026, 4, 5));
      expect(info.buckets.single.key, 'goal');
      expect(info.buckets.single.label, 'חופשה');
      expect(info.buckets.single.amount, 1000.0);
      expect(info.buckets.single.saved, 400.0);
      expect(info.buckets.single.remaining, 600.0);
      // Sequence 05-02, 06-02 -> ceil(600/2) = 300 each.
      expect(_amountKeys(info.mergedPerDateAmounts),
          ['2026-05-02=300.0', '2026-06-02=300.0']);
    });

    test('OVERDUE goal: no schedule, isOverdue set at goal level', () {
      final g = _goal(dueDate: '2026-03-01', targetAmount: 1000);
      // last eligible = 2026-02-02, today 2026-04-05 is past it.
      final info = buildGoalScheduleInfo(g, today: DateTime(2026, 4, 5));
      expect(info.isOverdue, isTrue);
      expect(info.isCompleted, isFalse);
      expect(info.buckets.single.isOverdue, isTrue);
      expect(info.buckets.single.remaining, 1000.0);
      expect(info.mergedPerDateAmounts, isEmpty);
      expect(info.nextTransferDate, isNull);
    });

    test('one overdue component does not make its siblings overdue', () {
      final g = _goal(
        dueDate: '2026-08-01',
        targetAmount: 3000,
        components: [
          _comp('late', 'מקדמה', 1000, '2026-03-01'), // overdue
          _comp('ok', 'יתרה', 2000, '2026-08-01'),
        ],
      );
      final info = buildGoalScheduleInfo(g, today: DateTime(2026, 4, 15));
      expect(info.isOverdue, isTrue);
      expect(info.buckets[0].isOverdue, isTrue);
      expect(info.buckets[1].isOverdue, isFalse);
      expect(info.buckets[1].perDateAmounts, isNotEmpty);
    });
  });

  // ==========================================================================
  group('getCurrentReminderPeriod', () {
    test('local YYYY-MM of today', () {
      expect(getCurrentReminderPeriod(today: DateTime(2026, 4, 5, 23, 59)),
          '2026-04');
      expect(getCurrentReminderPeriod(today: DateTime(2026, 12, 31)), '2026-12');
      expect(getCurrentReminderPeriod(today: DateTime(2027, 1, 1)), '2027-01');
    });
  });

  // ==========================================================================
  group('isGoalHandledForPeriod', () {
    test('empty ledger is never handled', () {
      expect(isGoalHandledForPeriod(_goal(), '2026-04'), isFalse);
    });

    test('a full record matches on its own reminderPeriod', () {
      final g = _goal(confirmedTransfers: const [
        FullConfirmedTransfer(
          // A deliberately DIFFERENT date month: reminderPeriod wins.
          date: '2026-03-30',
          amount: 100,
          id: 'ct_1',
          confirmedAt: _iso,
          reminderPeriod: '2026-04',
          source: 'goals_reminder',
        ),
      ]);
      expect(isGoalHandledForPeriod(g, '2026-04'), isTrue);
      expect(isGoalHandledForPeriod(g, '2026-03'), isFalse);
    });

    test('a legacy record falls back to its date\'s YYYY-MM', () {
      final g = _goal(confirmedTransfers: const [
        LegacyConfirmedTransfer(date: '2026-04-20', amount: 100),
      ]);
      expect(isGoalHandledForPeriod(g, '2026-04'), isTrue);
      expect(isGoalHandledForPeriod(g, '2026-05'), isFalse);
    });

    test('a non-positive record does not count', () {
      final g = _goal(confirmedTransfers: const [
        LegacyConfirmedTransfer(date: '2026-04-20', amount: 0),
      ]);
      expect(isGoalHandledForPeriod(g, '2026-04'), isFalse);
    });

    test('ANY positive amount counts, including a partial one', () {
      final g = _goal(
        targetAmount: 10000,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-04-20', amount: 1),
        ],
      );
      expect(isGoalHandledForPeriod(g, '2026-04'), isTrue);
    });
  });

  // ==========================================================================
  group('buildGoalReminderInfo', () {
    // Goal with one overdue component and one still-on-time component.
    Goal mixedGoal({List<ConfirmedTransfer> ct = const []}) => _goal(
          dueDate: '2026-08-01',
          targetAmount: 3000,
          components: [
            _comp('late', 'מקדמה', 1000, '2026-03-01'),
            _comp('ok', 'יתרה', 2000, '2026-08-01'),
          ],
          confirmedTransfers: ct,
        );

    test('overdue and today\'s contribution are summed SEPARATELY', () {
      final info = buildGoalReminderInfo(mixedGoal(), now: DateTime(2026, 4, 15));
      // 'late': last eligible 2026-02-02 < today -> overdue, full 1000.
      // 'ok'  : due 2026-08-01 (day 1) -> last 2026-07-02. Reminder cadence
      //         on day 15 -> [2026-04-15, 05-02, 06-02, 07-02] = 4 dates,
      //         ceil(2000/4) = 500; the first date IS today.
      expect(info.overdueAmount, 1000.0);
      expect(info.todayContribution, 500.0);
      expect(info.suggestedTotal, 1500.0);
      expect(info.remaining, 3000.0);
      expect(info.remainingAfterSuggested, 1500.0);
    });

    test('before the 2nd nothing is due today (no immediate opportunity)', () {
      final g = _goal(dueDate: '2026-08-01', targetAmount: 2000);
      final info = buildGoalReminderInfo(g, now: DateTime(2026, 4, 1));
      // Day 1 falls back to the card cadence, whose first date is 2026-04-02
      // — not today — so nothing is proposed right now.
      expect(info.overdueAmount, 0.0);
      expect(info.todayContribution, 0.0);
      expect(info.suggestedTotal, 0.0);
    });

    test('a fully funded goal proposes nothing', () {
      final g = _goal(
        dueDate: '2026-08-01',
        targetAmount: 2000,
        savedAmount: 2000,
      );
      final info = buildGoalReminderInfo(g, now: DateTime(2026, 4, 15));
      expect(info.suggestedTotal, 0.0);
      expect(info.remaining, 0.0);
      expect(info.remainingAfterSuggested, 0.0);
    });

    test('the FIFO pool reduces the overdue bucket first', () {
      final info = buildGoalReminderInfo(
        mixedGoal(ct: const [
          LegacyConfirmedTransfer(date: '2026-04-10', amount: 100),
        ]),
        now: DateTime(2026, 4, 15),
      );
      // pool 100 goes to the earliest deadline ('late', 2026-03-01).
      expect(info.confirmed, 100.0);
      expect(info.overdueAmount, 900.0);
      expect(info.todayContribution, 500.0);
      expect(info.suggestedTotal, 1400.0);
      expect(info.remaining, 2900.0);
      expect(info.remainingAfterSuggested, 1500.0);
    });

    test('a purely overdue goal proposes the full remaining amount', () {
      final g = _goal(dueDate: '2026-03-01', targetAmount: 1000);
      final info = buildGoalReminderInfo(g, now: DateTime(2026, 4, 15));
      expect(info.overdueAmount, 1000.0);
      expect(info.todayContribution, 0.0);
      expect(info.suggestedTotal, 1000.0);
      expect(info.remainingAfterSuggested, 0.0);
    });
  });

  // ==========================================================================
  group('isGoalDueForReminderNow', () {
    Goal dueGoal({
      bool isArchived = false,
      List<ConfirmedTransfer> ct = const [],
    }) =>
        _goal(
          dueDate: '2026-08-01',
          targetAmount: 2000,
          isArchived: isArchived,
          confirmedTransfers: ct,
        );

    test('an ordinary un-handled goal with work to do is due', () {
      expect(isGoalDueForReminderNow(dueGoal(), now: DateTime(2026, 4, 15)),
          isTrue);
    });

    test('an ARCHIVED goal is never due', () {
      expect(
        isGoalDueForReminderNow(dueGoal(isArchived: true),
            now: DateTime(2026, 4, 15)),
        isFalse,
      );
    });

    test('suggestedTotal <= 0 is never due (fully funded)', () {
      final g = _goal(
          dueDate: '2026-08-01', targetAmount: 2000, savedAmount: 2000);
      expect(isGoalDueForReminderNow(g, now: DateTime(2026, 4, 15)), isFalse);
    });

    test('suggestedTotal <= 0 is never due (nothing scheduled for today)', () {
      // Day 1: the reminder cadence has no immediate opportunity.
      expect(isGoalDueForReminderNow(dueGoal(), now: DateTime(2026, 4, 1)),
          isFalse);
    });

    test('a goal already handled for the current period is never due', () {
      final g = dueGoal(ct: const [
        FullConfirmedTransfer(
          date: '2026-04-10',
          amount: 50,
          id: 'ct_1',
          confirmedAt: _iso,
          reminderPeriod: '2026-04',
          source: 'goals_reminder',
        ),
      ]);
      expect(isGoalDueForReminderNow(g, now: DateTime(2026, 4, 15)), isFalse);
      // …but the SAME goal is due again next period.
      expect(isGoalDueForReminderNow(g, now: DateTime(2026, 5, 15)), isTrue);
    });

    test('a legacy-record goal is handled for that record\'s month too', () {
      final g = dueGoal(ct: const [
        LegacyConfirmedTransfer(date: '2026-04-03', amount: 50),
      ]);
      expect(isGoalDueForReminderNow(g, now: DateTime(2026, 4, 15)), isFalse);
    });
  });

  // ==========================================================================
  group('getGoalsDueForReminder', () {
    final archived = _goal(
        id: 'archived',
        dueDate: '2026-08-01',
        targetAmount: 1000,
        isArchived: true);
    final handled = _goal(
      id: 'handled',
      dueDate: '2026-08-01',
      targetAmount: 1000,
      confirmedTransfers: const [
        LegacyConfirmedTransfer(date: '2026-04-03', amount: 10),
      ],
    );
    final funded = _goal(
        id: 'funded',
        dueDate: '2026-08-01',
        targetAmount: 1000,
        savedAmount: 1000);
    final dueA =
        _goal(id: 'dueA', dueDate: '2026-08-01', targetAmount: 1000);
    final dueB =
        _goal(id: 'dueB', dueDate: '2026-07-01', targetAmount: 900);

    test('only currently-due goals, in the original array order', () {
      final due = getGoalsDueForReminder(
        [dueB, archived, handled, dueA, funded],
        now: DateTime(2026, 4, 15),
      );
      expect(due.map((i) => i.goal.id).toList(), ['dueB', 'dueA']);
    });

    test('each entry carries its own reminder info', () {
      final due =
          getGoalsDueForReminder([dueA], now: DateTime(2026, 4, 15));
      // due 2026-08-01 (day 1) -> last 2026-07-02; reminder cadence on the
      // 15th -> [04-15, 05-02, 06-02, 07-02] -> ceil(1000/4) = 250.
      expect(due.single.suggestedTotal, 250.0);
      expect(due.single.remainingAfterSuggested, 750.0);
    });

    test('an empty goals list yields an empty due list', () {
      expect(getGoalsDueForReminder(const [], now: DateTime(2026, 4, 15)),
          isEmpty);
    });

    test('an INVALID dataset is never processed', () {
      final result = getGoalsDueForReminderFromState(
        const GoalsInvalid(raw: '{bad json', reason: 'parse'),
        now: DateTime(2026, 4, 15),
      );
      expect(result, isEmpty);
    });

    test('a valid dataset is processed normally', () {
      final result = getGoalsDueForReminderFromState(
        GoalsValid([dueA, archived]),
        now: DateTime(2026, 4, 15),
      );
      expect(result.map((i) => i.goal.id).toList(), ['dueA']);
    });
  });

  // ==========================================================================
  group('applyConfirmedTransfers', () {
    final g1 = _goal(id: 'g1', dueDate: '2026-08-01', targetAmount: 1000);
    final g2 = _goal(id: 'g2', dueDate: '2026-09-01', targetAmount: 2000);
    final state = GoalsValid([g1, g2]);
    final now = DateTime(2026, 4, 15, 10, 30);
    const nowIso = '2026-04-15T07:30:00.000Z';

    String Function() counter() {
      var n = 0;
      return () => 'ct_${++n}';
    }

    test('an invalid dataset is rejected without touching anything', () {
      final r = applyConfirmedTransfers(
        const GoalsInvalid(raw: null, reason: 'parse'),
        const [GoalTransferAllocation(goalId: 'g1', amount: 100)],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      );
      expect(r, isA<ConfirmedTransfersRejected>());
      expect((r as ConfirmedTransfersRejected).message,
          'לא ניתן לעדכן יעדים בעוד הנתונים המקומיים פגומים.');
    });

    test('an empty allocation list is rejected', () {
      final r = applyConfirmedTransfers(state, const [],
          now: now, nowIso: nowIso, generateId: counter());
      expect((r as ConfirmedTransfersRejected).message,
          'לא נמצא סכום חיובי לרישום.');
    });

    test('non-positive / unknown-goal allocations are skipped entirely', () {
      final r = applyConfirmedTransfers(
        state,
        const [
          GoalTransferAllocation(goalId: 'g1', amount: 0),
          GoalTransferAllocation(goalId: 'g1', amount: -5),
          GoalTransferAllocation(goalId: 'nope', amount: 100),
          GoalTransferAllocation(goalId: 'g2', amount: double.nan),
        ],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      );
      expect((r as ConfirmedTransfersRejected).message,
          'לא נמצא סכום חיובי לרישום.');
    });

    test('writes one full ledger record per positive allocation', () {
      final r = applyConfirmedTransfers(
        state,
        const [GoalTransferAllocation(goalId: 'g1', amount: 250.005)],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      ) as ConfirmedTransfersApplied;

      final updated = r.goals.firstWhere((g) => g.id == 'g1');
      final rec = updated.confirmedTransfers.single as FullConfirmedTransfer;
      expect(rec.id, 'ct_1');
      expect(rec.amount, 250.01); // round2(250.005)
      expect(rec.date, '2026-04-15'); // LOCAL business date from `now`
      expect(rec.confirmedAt, nowIso);
      expect(rec.reminderPeriod, '2026-04');
      expect(rec.source, 'goals_reminder');
      expect(updated.updatedAt, nowIso);
    });

    test('untouched goals are returned unchanged (identical instance)', () {
      final r = applyConfirmedTransfers(
        state,
        const [GoalTransferAllocation(goalId: 'g1', amount: 100)],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      ) as ConfirmedTransfersApplied;

      expect(r.goals.length, 2);
      expect(identical(r.goals[1], g2), isTrue);
      // The ORIGINAL goal objects are never mutated.
      expect(g1.confirmedTransfers, isEmpty);
      expect(g1.updatedAt, _iso);
    });

    test('two allocations for the same goal append two records, in order', () {
      final r = applyConfirmedTransfers(
        state,
        const [
          GoalTransferAllocation(goalId: 'g1', amount: 100),
          GoalTransferAllocation(goalId: 'g1', amount: 50),
        ],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      ) as ConfirmedTransfersApplied;

      final updated = r.goals.first;
      expect(updated.confirmedTransfers.map((t) => t.amount).toList(),
          [100.0, 50.0]);
      expect(
        updated.confirmedTransfers
            .map((t) => (t as FullConfirmedTransfer).id)
            .toList(),
        ['ct_1', 'ct_2'],
      );
    });

    test('a new record marks the goal handled for the current period', () {
      final r = applyConfirmedTransfers(
        state,
        const [GoalTransferAllocation(goalId: 'g1', amount: 100)],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      ) as ConfirmedTransfersApplied;

      final updated = r.goals.first;
      expect(isGoalDueForReminderNow(updated, now: now), isFalse);
      expect(isGoalHandledForPeriod(updated, '2026-04'), isTrue);
      // Next month it becomes due again.
      expect(isGoalDueForReminderNow(updated, now: DateTime(2026, 5, 15)),
          isTrue);
    });

    test('existing ledger records are preserved alongside the new one', () {
      final withHistory = _goal(
        id: 'g1',
        dueDate: '2026-08-01',
        targetAmount: 1000,
        confirmedTransfers: const [
          LegacyConfirmedTransfer(date: '2026-02-03', amount: 60),
        ],
      );
      final r = applyConfirmedTransfers(
        GoalsValid([withHistory]),
        const [GoalTransferAllocation(goalId: 'g1', amount: 40)],
        now: now,
        nowIso: nowIso,
        generateId: counter(),
      ) as ConfirmedTransfersApplied;

      expect(r.goals.single.confirmedTransfers.length, 2);
      expect(goalConfirmedTransfersTotal(r.goals.single), 100.0);
    });
  });
}
