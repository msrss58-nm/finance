import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/domain/forecast/projected_balance.dart';
import 'package:familyfinance_pro/domain/models/app_settings.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

/// Opening Balance / projected daily balance parity tests (CLAUDE.md §11).
/// Expected values are derived by hand from app.js's
/// buildProjectedBalanceSeries()/buildProjectedBalanceMonthView()/
/// getProjectedBalanceToday(); each non-obvious figure carries its derivation.

final _config = kDefaultCategoryConfig;

IncomeItem _income({
  required int id,
  required num amount,
  required int day,
  bool archived = false,
}) =>
    IncomeItem(
      id: IntItemId(id),
      isArchived: archived,
      title: 'income$id',
      displayCategory: 'income',
      amount: amount,
      day: LegacyNumericField(day),
    );

FixedItem _fixed({
  required int id,
  required num amount,
  required int day,
  String? where = 'bank',
}) =>
    FixedItem(
      id: IntItemId(id),
      isArchived: false,
      title: 'fixed$id',
      displayCategory: 'fixed',
      amount: amount,
      day: LegacyNumericField(day),
      where: LegacyStringField(where),
      period: FixedPeriod.monthly,
      bimonthly: false,
    );

CashWithdrawalItem _withdrawal({
  required int id,
  required num amount,
  required String start,
}) =>
    CashWithdrawalItem(
      id: IntItemId(id),
      isArchived: false,
      title: 'withdrawal$id',
      amount: amount,
      start: start,
    );

void main() {
  group('buildProjectedBalanceSeries — basics', () {
    test('walks every calendar day inclusive from opening date through target', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 5),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      // 01,02,03,04,05 inclusive = 5 days.
      expect(series.days.length, 5);
      expect(series.days.first.dateKey, '2026-09-01');
      expect(series.days.last.dateKey, '2026-09-05');
      expect(series.days.first.isOpeningDay, isTrue);
      expect(series.days[1].isOpeningDay, isFalse);
    });

    test('with no events the balance carries forward unchanged', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 3),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.map((d) => d.projectedBalance), [1000, 1000, 1000]);
    });

    test('an opening amount of ZERO is valid and distinct from unconfigured', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 0,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 2),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.first.projectedBalance, 0);
    });

    test('a NEGATIVE opening amount (already-overdrawn account) is accepted', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: -250.5,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, -250.5);
      expect(series.days.single.isNegative, isTrue);
    });

    test('throughDate before the opening date yields an empty days list, never a back-calculation', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-10',
        throughDate: DateTime(2026, 9, 1),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days, isEmpty);
      expect(series.openingAmount, 1000);
    });

    test('a structurally invalid opening date returns null', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: 'not-a-date',
        throughDate: DateTime(2026, 9, 5),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      );
      expect(series, isNull);
    });
  });

  group('buildProjectedBalanceSeries — event application', () {
    test('a later-day expense reduces the running balance', () {
      // fixed 300 on the 3rd; opening 1000 on the 1st.
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 4),
        items: [_fixed(id: 1, amount: 300, day: 3)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days[0].projectedBalance, 1000); // 01
      expect(series.days[1].projectedBalance, 1000); // 02
      expect(series.days[2].projectedBalance, 700); // 03: 1000 - 300
      expect(series.days[2].expenses, 300);
      expect(series.days[2].net, -300);
      expect(series.days[3].projectedBalance, 700); // 04 carries forward
    });

    test('income and expenses on the same day net together', () {
      // income 5000 on the 10th, fixed 1200 on the 10th → net +3800.
      final series = buildProjectedBalanceSeries(
        openingAmount: 100,
        openingDateStr: '2026-09-09',
        throughDate: DateTime(2026, 9, 10),
        items: [
          _income(id: 1, amount: 5000, day: 10),
          _fixed(id: 2, amount: 1200, day: 10),
        ],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      final tenth = series.days.last;
      expect(tenth.income, 5000);
      expect(tenth.expenses, 1200);
      expect(tenth.net, 3800);
      expect(tenth.projectedBalance, 3900); // 100 + 3800
    });

    test('an archived item contributes nothing', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 5),
        items: [_income(id: 1, amount: 5000, day: 3, archived: true)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.last.projectedBalance, 1000);
    });

    test('the balance may legitimately go negative (warning state, not blocked)', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 100,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 5),
        items: [_fixed(id: 1, amount: 900, day: 3)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.last.projectedBalance, -800);
      expect(series.days.last.isNegative, isTrue);
    });
  });

  group('OPENING-DAY rule', () {
    test('a non-withdrawal event ON the opening day is already reflected and is NOT applied', () {
      // fixed 300 on the 1st = the opening day itself.
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: [_fixed(id: 1, amount: 300, day: 1)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      final day = series.days.single;
      // Balance is untouched...
      expect(day.projectedBalance, 1000);
      // ...but the event is still REPORTED for the day, flagged as already included.
      expect(day.expenses, 300);
      expect(day.net, -300);
      expect(day.events.single.alreadyIncludedInOpeningSnapshot, isTrue);
    });

    test('income ON the opening day is likewise already reflected', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-05',
        throughDate: DateTime(2026, 9, 5),
        items: [_income(id: 1, amount: 5000, day: 5)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, 1000);
    });

    test('the already-included flag is FALSE on every day after the opening day', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 3),
        items: [_fixed(id: 1, amount: 300, day: 3)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.last.events.single.alreadyIncludedInOpeningSnapshot,
          isFalse);
    });
  });

  group('OPENING-DAY cashWithdrawal exception — null vs [] must never be conflated', () {
    final withdrawal = _withdrawal(id: 77, amount: 400, start: '2026-09-01');

    test('includedWithdrawalIds == null → blanket rule: the withdrawal is treated as already included', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: [withdrawal],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, 1000); // NOT deducted
      expect(series.days.single.events.single.alreadyIncludedInOpeningSnapshot,
          isTrue);
    });

    test('includedWithdrawalIds == [] (captured, none existed) → the withdrawal IS deducted', () {
      // This is the case that proves null and [] are not interchangeable: the
      // snapshot was taken and this id was not in it, so it was entered after
      // the opening amount and must still reduce the balance.
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: [withdrawal],
        includedWithdrawalIds: const [],
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, 600); // 1000 - 400
      expect(series.days.single.events.single.alreadyIncludedInOpeningSnapshot,
          isFalse);
    });

    test('the withdrawal id IS in the captured snapshot → already included, not deducted', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: [withdrawal],
        includedWithdrawalIds: const [77],
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, 1000);
    });

    test('a DIFFERENT id in the snapshot → this withdrawal is still deducted', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 1),
        items: [withdrawal],
        includedWithdrawalIds: const [99],
        categoryConfig: _config,
      )!;
      expect(series.days.single.projectedBalance, 600);
    });

    test('the exception applies ONLY on the opening day — a later withdrawal always deducts', () {
      final later = _withdrawal(id: 78, amount: 400, start: '2026-09-02');
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 2),
        items: [later],
        includedWithdrawalIds: const [78], // present, but irrelevant after day 1
        categoryConfig: _config,
      )!;
      expect(series.days.last.projectedBalance, 600);
    });
  });

  group('month/year boundaries', () {
    test('walks across a month boundary continuously (no monthly reset)', () {
      // fixed 100 on the 5th: Sept 5 and Oct 5 both fall in the walk.
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 10, 6),
        items: [_fixed(id: 1, amount: 100, day: 5)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      // 30 days in September + 6 in October = 36 days.
      expect(series.days.length, 36);
      // Balance carries across the month boundary: 1000 - 100 (Sep 5) - 100 (Oct 5).
      expect(series.days.last.projectedBalance, 800);
    });

    test('walks across a YEAR boundary (December → January)', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 500,
        openingDateStr: '2026-12-30',
        throughDate: DateTime(2027, 1, 2),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.map((d) => d.dateKey),
          ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    });

    test('leap-year February is walked day by day (29 days in 2028)', () {
      final series = buildProjectedBalanceSeries(
        openingAmount: 0,
        openingDateStr: '2028-02-01',
        throughDate: DateTime(2028, 2, 29),
        items: const [],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      expect(series.days.length, 29);
      expect(series.days.last.dateKey, '2028-02-29');
    });

    test('a day-31 fixed item clamps to the last day of a short month', () {
      // September has 30 days → the 31st clamps to Sept 30.
      final series = buildProjectedBalanceSeries(
        openingAmount: 1000,
        openingDateStr: '2026-09-01',
        throughDate: DateTime(2026, 9, 30),
        items: [_fixed(id: 1, amount: 100, day: 31)],
        includedWithdrawalIds: null,
        categoryConfig: _config,
      )!;
      final last = series.days.last;
      expect(last.dateKey, '2026-09-30');
      expect(last.expenses, 100);
      expect(last.projectedBalance, 900);
    });
  });

  group('getProjectedBalanceToday', () {
    test('no opening balance configured → unconfigured (never a fabricated zero)', () {
      final result = getProjectedBalanceToday(
        today: DateTime(2026, 9, 5),
        opening: null,
        items: const [],
        categoryConfig: _config,
      );
      expect(result, isA<ProjectedBalanceUnconfigured>());
    });

    test('today BEFORE the opening date → future state (opening date is user-entered, not forced to today)', () {
      final result = getProjectedBalanceToday(
        today: DateTime(2026, 9, 1),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-09-10',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      expect(result, isA<ProjectedBalanceFuture>());
      expect((result as ProjectedBalanceFuture).openingDateStr, '2026-09-10');
    });

    test('today ON the opening date → available and flagged as the opening day', () {
      final result = getProjectedBalanceToday(
        today: DateTime(2026, 9, 10),
        opening: const OpeningBalanceConfig(
          amount: 1234.5,
          dateStr: '2026-09-10',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      ) as ProjectedBalanceAvailable;
      expect(result.projectedBalance, 1234.5);
      expect(result.isOpeningDay, isTrue);
    });

    test('today AFTER the opening date → the walked balance, not the opening amount', () {
      final result = getProjectedBalanceToday(
        today: DateTime(2026, 9, 15),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-09-01',
          includedWithdrawalIds: null,
        ),
        items: [_fixed(id: 1, amount: 250, day: 10)],
        categoryConfig: _config,
      ) as ProjectedBalanceAvailable;
      expect(result.projectedBalance, 750);
      expect(result.isOpeningDay, isFalse);
    });
  });

  group('buildProjectedBalanceMonthView', () {
    test('unconfigured opening balance → configured:false with no days', () {
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 20),
        opening: null,
        items: const [],
        categoryConfig: _config,
      );
      expect(view.configured, isFalse);
      expect(view.days, isEmpty);
      // Period bounds are still reported.
      expect(view.periodStart, DateTime(2026, 9, 5));
      expect(view.periodEnd, DateTime(2026, 10, 4));
    });

    test('covers the whole 5th-to-4th period, one entry per day', () {
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 20),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-09-05',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      // 05.09 through 04.10 inclusive = 30 days (September's own length).
      expect(view.days.length, 30);
      expect(view.totalDays, 30);
      expect(view.days.first.dateKey, '2026-09-05');
      expect(view.days.last.dateKey, '2026-10-04');
      expect(view.days.first.periodDayIndex, 1);
      expect(view.days.last.periodDayIndex, 30);
    });

    test('days BEFORE the opening date are unavailable — never back-calculated', () {
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 20),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-09-08',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      // 05,06,07 precede the opening date.
      for (final d in view.days.take(3)) {
        expect(d.availability, DayAvailability.unavailable);
        expect(d.projectedBalance, isNull);
        expect(d.income, isNull);
        expect(d.events, isEmpty);
      }
      final openingDay = view.days[3];
      expect(openingDay.dateKey, '2026-09-08');
      expect(openingDay.availability, DayAvailability.opening);
      expect(openingDay.projectedBalance, 1000);
      expect(view.days[4].availability, DayAvailability.available);
    });

    test('an opening date AFTER the period end leaves every day unavailable', () {
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 20),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-12-01',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      expect(view.configured, isTrue);
      expect(
        view.days.every((d) => d.availability == DayAvailability.unavailable),
        isTrue,
      );
    });

    test('the opening balance is NOT reseeded on the 5th — an earlier opening carries forward into the period', () {
      // Opening 1000 on Aug 20, an expense of 400 on Aug 25 (before the period
      // starts) must already be reflected in the balance shown on Sept 5.
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 20),
        opening: const OpeningBalanceConfig(
          amount: 1000,
          dateStr: '2026-08-20',
          includedWithdrawalIds: null,
        ),
        items: [_fixed(id: 1, amount: 400, day: 25)],
        categoryConfig: _config,
      );
      final sept5 = view.days.first;
      expect(sept5.dateKey, '2026-09-05');
      expect(sept5.availability, DayAvailability.available);
      // 1000 - 400 (Aug 25) = 600; the Sept 25 charge has not happened yet by Sept 5.
      expect(sept5.projectedBalance, 600);
    });

    test('period is anchored to refDate\'s OWN month even when refDate is before the 5th', () {
      // Version 1.4.7 correction: a refDate of Sept 2 still yields 05.09-04.10,
      // NOT 05.08-04.09.
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 9, 2),
        opening: const OpeningBalanceConfig(
          amount: 500,
          dateStr: '2026-09-01',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      expect(view.periodStart, DateTime(2026, 9, 5));
      expect(view.periodEnd, DateTime(2026, 10, 4));
    });

    test('period crossing a year boundary (December → January)', () {
      final view = buildProjectedBalanceMonthView(
        refDate: DateTime(2026, 12, 10),
        opening: const OpeningBalanceConfig(
          amount: 100,
          dateStr: '2026-12-05',
          includedWithdrawalIds: null,
        ),
        items: const [],
        categoryConfig: _config,
      );
      expect(view.periodStart, DateTime(2026, 12, 5));
      expect(view.periodEnd, DateTime(2027, 1, 4));
      expect(view.days.length, 31); // December's own length
      expect(view.days.last.dateKey, '2027-01-04');
    });
  });
}
