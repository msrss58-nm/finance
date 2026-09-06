// JS→Dart PARITY TEST SUITE for lib/domain/dates/billing_dates.dart.
//
// Every expected value below was produced by RUNNING the verbatim JS source
// (app.js getClampedBillingDate / getBillingRange / parseDatesAndGetLeft /
// isBillingActiveInMonth / cashflowDateOnly / cashflowDateKey /
// parseLocalDateStr / getForecastPeriodBounds / isBimonthlyActiveMonth) under
// node, in the same local timezone (Asia/Jerusalem, UTC+3 at the time of the
// run). The only change made to the JS for the reference run was injecting
// `today` into parseDatesAndGetLeft instead of reading `new Date()`, which is
// exactly the same seam the Dart port uses. Each expectation carries the
// literal node output line it was taken from.
//
// Where a group is marked `JS-PARITY DIVERGENCE`, the expectation states the
// REAL JS behavior and the current Dart port does something else. Those tests
// are meant to fail until the port is corrected. Do NOT relax them.

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/domain/dates/billing_dates.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

/// Compact 'YYYY-MM-DD' rendering, so a failure message shows the calendar
/// date rather than a full DateTime with a time component.
String ymd(DateTime? d) => d == null
    ? 'null'
    : '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';

void expectDate(DateTime? actual, String expected, String because) {
  expect(ymd(actual), expected, reason: because);
}

IncomeItem _income({
  Object? day,
  String? displayCategory,
}) =>
    IncomeItem(
      id: const IntItemId(1),
      isArchived: false,
      title: 't',
      amount: 100,
      day: LegacyNumericField(day),
      displayCategory: displayCategory,
    );

FixedItem _fixed({
  Object? day,
  String? displayCategory,
}) =>
    FixedItem(
      id: const IntItemId(2),
      isArchived: false,
      title: 't',
      amount: 100,
      day: LegacyNumericField(day),
      where: const LegacyStringField('bank'),
      period: FixedPeriod.monthly,
      bimonthly: false,
      displayCategory: displayCategory,
    );

DatedItem _dated({String? displayCategory}) => DatedItem(
      id: const IntItemId(3),
      isArchived: false,
      title: 't',
      amount: 100,
      displayCategory: displayCategory,
    );

/// CashWithdrawalItem deliberately has no displayCategory (the Web app never
/// sets one for this type), so it always resolves through the type lookup.
CashWithdrawalItem _withdrawal() => CashWithdrawalItem(
      id: const IntItemId(4),
      isArchived: false,
      title: 't',
      amount: 100,
    );

void main() {
  // ===========================================================================
  // getClampedBillingDate
  // JS is 0-based (`monthIndex`), the Dart port is 1-based. Every case below
  // passes the 1-based equivalent of the node input.
  // ===========================================================================
  group('getClampedBillingDate', () {
    test('day that exists in the month is untouched', () {
      // node: (2026, 0, 31) -> 2026-01-31
      expectDate(getClampedBillingDate(2026, 1, 31), '2026-01-31', 'Jan has 31');
      // node: (2026, 11, 31) -> 2026-12-31
      expectDate(getClampedBillingDate(2026, 12, 31), '2026-12-31', 'Dec has 31');
      // node: (2026, 5, 1) -> 2026-06-01
      expectDate(getClampedBillingDate(2026, 6, 1), '2026-06-01', 'day 1');
    });

    test('29/30/31 clamp to the last real day of a short month', () {
      // node: (2026, 1, 31) -> 2026-02-28
      expectDate(getClampedBillingDate(2026, 2, 31), '2026-02-28', 'Feb 2026');
      // node: (2026, 1, 30) -> 2026-02-28
      expectDate(getClampedBillingDate(2026, 2, 30), '2026-02-28', 'Feb 2026');
      // node: (2026, 1, 29) -> 2026-02-28
      expectDate(getClampedBillingDate(2026, 2, 29), '2026-02-28', 'Feb 2026');
      // node: (2026, 1, 28) -> 2026-02-28
      expectDate(getClampedBillingDate(2026, 2, 28), '2026-02-28', 'exact');
      // node: (2026, 3, 31) -> 2026-04-30
      expectDate(getClampedBillingDate(2026, 4, 31), '2026-04-30', 'Apr = 30');
      // node: (2026, 3, 30) -> 2026-04-30
      expectDate(getClampedBillingDate(2026, 4, 30), '2026-04-30', 'Apr = 30');
    });

    test('leap-year February (2024 leap, 2026 not, 2000 leap, 2100 NOT leap)',
        () {
      // node: (2024, 1, 31) -> 2024-02-29
      expectDate(getClampedBillingDate(2024, 2, 31), '2024-02-29', '2024 leap');
      // node: (2024, 1, 29) -> 2024-02-29
      expectDate(getClampedBillingDate(2024, 2, 29), '2024-02-29', '2024 leap');
      // node: (2026, 1, 29) -> 2026-02-28
      expectDate(getClampedBillingDate(2026, 2, 29), '2026-02-28', 'not leap');
      // node: (2000, 1, 29) -> 2000-02-29
      expectDate(getClampedBillingDate(2000, 2, 29), '2000-02-29', '400-rule');
      // node: (2100, 1, 29) -> 2100-02-28
      expectDate(getClampedBillingDate(2100, 2, 29), '2100-02-28', '100-rule');
    });

    test('out-of-range month normalizes BEFORE the day is clamped', () {
      // node: (2026, 12, 15) -> 2027-01-15   [JS month 12 == 1-based month 13]
      expectDate(getClampedBillingDate(2026, 13, 15), '2027-01-15', 'rolls +1y');
      // node: (2026, 13, 31) -> 2027-02-28   (clamped against Feb 2027, not Dec)
      expectDate(getClampedBillingDate(2026, 14, 31), '2027-02-28',
          'normalize first, then clamp');
      // node: (2026, 24, 10) -> 2028-01-10
      expectDate(getClampedBillingDate(2026, 25, 10), '2028-01-10', 'rolls +2y');
      // node: (2026, -1, 31) -> 2025-12-31
      expectDate(getClampedBillingDate(2026, 0, 31), '2025-12-31', 'rolls -1y');
      // node: (2026, -13, 5) -> 2024-12-05
      expectDate(getClampedBillingDate(2026, -12, 5), '2024-12-05', 'rolls -2y');
    });

    test('day 0 and huge days follow JS Math.min + Date normalization', () {
      // node: (2026, 5, 0) -> 2026-05-31   (day 0 == last day of prev month)
      expectDate(getClampedBillingDate(2026, 6, 0), '2026-05-31', 'day 0');
      // node: (2026, 0, 0) -> 2025-12-31
      expectDate(getClampedBillingDate(2026, 1, 0), '2025-12-31', 'day 0 + Jan');
      // node: (2026, 5, 99) -> 2026-06-30
      expectDate(getClampedBillingDate(2026, 6, 99), '2026-06-30', 'clamped');
    });
  });

  // ===========================================================================
  // getBillingRange
  // ===========================================================================
  group('getBillingRange - core scheduling', () {
    test('startDay > billingDay pushes the first billing month forward', () {
      // node: ("2026-01-15", 12, 10) -> first=2026-02-10 last=2027-01-10
      final r = getBillingRange('2026-01-15', 12, 10)!;
      expectDate(r.first, '2026-02-10', 'purchase after this month billing day');
      expectDate(r.last, '2027-01-10', 'first + 11 months');
      expect(r.bDay, 10);
      expect(r.total, 12);
    });

    test('startDay < billingDay keeps the first billing month', () {
      // node: ("2026-01-05", 12, 10) -> first=2026-01-10 last=2026-12-10
      final r = getBillingRange('2026-01-05', 12, 10)!;
      expectDate(r.first, '2026-01-10', 'charged this month');
      expectDate(r.last, '2026-12-10', 'first + 11 months');
    });

    test('startDay EXACTLY == billingDay still pushes forward (>=, not >)', () {
      // node: ("2026-01-10", 12, 10) -> first=2026-02-10 last=2027-01-10
      final r = getBillingRange('2026-01-10', 12, 10)!;
      expectDate(r.first, '2026-02-10', 'startDay >= bDay pushes');
      expectDate(r.last, '2027-01-10', '');
      // node: ("2026-01-09", 12, 10) -> first=2026-01-10 last=2026-12-10
      final r2 = getBillingRange('2026-01-09', 12, 10)!;
      expectDate(r2.first, '2026-01-10', 'one day earlier does not push');
    });

    test('December start rolls the year over', () {
      // node: ("2026-12-20", 3, 10) -> first=2027-01-10 last=2027-03-10
      final r = getBillingRange('2026-12-20', 3, 10)!;
      expectDate(r.first, '2027-01-10', 'Dec push -> Jan next year');
      expectDate(r.last, '2027-03-10', '');
      // node: ("2026-12-05", 2, 10) -> first=2026-12-10 last=2027-01-10
      final r2 = getBillingRange('2026-12-05', 2, 10)!;
      expectDate(r2.first, '2026-12-10', 'no push');
      expectDate(r2.last, '2027-01-10', 'last crosses into next year');
    });

    test('billingDay 31 clamps per-month, and the STORED day never drifts', () {
      // node: ("2025-11-20", 6, 31) -> first=2025-11-30 last=2026-04-30 bDay=31
      final r = getBillingRange('2025-11-20', 6, 31)!;
      expectDate(r.first, '2025-11-30', 'Nov has 30 days');
      expectDate(r.last, '2026-04-30', 'Apr has 30 days');
      expect(r.bDay, 31, reason: 'stored billing day is preserved verbatim');
      // node: ("2025-12-01", 4, 31) -> first=2025-12-31 last=2026-03-31
      final r2 = getBillingRange('2025-12-01', 4, 31)!;
      expectDate(r2.first, '2025-12-31', '');
      expectDate(r2.last, '2026-03-31', '');
      // node: ("2026-01-15", 24, 31) -> first=2026-01-31 last=2027-12-31
      final r3 = getBillingRange('2026-01-15', 24, 31)!;
      expectDate(r3.first, '2026-01-31', 'startDay 15 < bDay 31, no push');
      expectDate(r3.last, '2027-12-31', '23 months later');
    });

    test('bDay 29 across a leap-year February', () {
      // node: ("2023-12-20", 4, 29) -> first=2023-12-29 last=2024-03-29
      final r = getBillingRange('2023-12-20', 4, 29)!;
      expectDate(r.first, '2023-12-29', '');
      expectDate(r.last, '2024-03-29', '');
    });

    test('bDay 31 with a February start clamps the FIRST month too', () {
      // node: ("2026-01-31", 3, 31) -> first=2026-02-28 last=2026-04-30
      final r = getBillingRange('2026-01-31', 3, 31)!;
      expectDate(r.first, '2026-02-28', 'push to Feb, clamped to 28');
      expectDate(r.last, '2026-04-30', 'last derived from the CLAMPED first');
    });

    test('total == 1: first and last are the same date', () {
      // node: ("2026-01-15", 1, 10) -> first=2026-02-10 last=2026-02-10
      final r = getBillingRange('2026-01-15', 1, 10)!;
      expectDate(r.first, '2026-02-10', '');
      expectDate(r.last, '2026-02-10', 'total-1 == 0 months added');
    });

    test('start string with no day component defaults startDay to 1', () {
      // node: ("2026-01", 12, 10) -> first=2026-01-10 last=2026-12-10
      final r = getBillingRange('2026-01', 12, 10)!;
      expectDate(r.first, '2026-01-10', 'startDay 1 < bDay 10, no push');
      expectDate(r.last, '2026-12-10', '');
    });

    test('non-numeric / zero day component behaves like JS parseInt', () {
      // node: ("2026-01-xx", 12, 1) -> first=2026-01-01 last=2026-12-01
      final r = getBillingRange('2026-01-xx', 12, 1)!;
      expectDate(r.first, '2026-01-01', 'NaN >= 1 is false in JS -> no push');
      // node: ("2026-01-00", 12, 1) -> first=2026-01-01 last=2026-12-01
      final r2 = getBillingRange('2026-01-00', 12, 1)!;
      expectDate(r2.first, '2026-01-01', '0 >= 1 is false -> no push');
    });
  });

  group('getBillingRange - JS falsy / coercion semantics', () {
    test('falsy start string or total returns null', () {
      // node: ("", 12, 10) -> null ; (null, 12, 10) -> null
      expect(getBillingRange('', 12, 10), isNull);
      expect(getBillingRange(null, 12, 10), isNull);
      // node: ("2026-01-15", 0, 10) -> null ; ("2026-01-15", null, 10) -> null
      expect(getBillingRange('2026-01-15', 0, 10), isNull,
          reason: 'JS numeric 0 is falsy');
      expect(getBillingRange('2026-01-15', null, 10), isNull);
    });

    test('numeric-string total/billingDay parse identically to numbers', () {
      // node: ("2026-01-15", "12", "10") -> first=2026-02-10 last=2027-01-10
      final r = getBillingRange('2026-01-15', '12', '10')!;
      expectDate(r.first, '2026-02-10', '');
      expectDate(r.last, '2027-01-10', '');
      expect(r.bDay, 10);
      expect(r.total, 12);
      // node: ("2026-01-15", 12, "31") -> first=2026-01-31 last=2026-12-31
      final r2 = getBillingRange('2026-01-15', 12, '31')!;
      expectDate(r2.first, '2026-01-31', '');
      expectDate(r2.last, '2026-12-31', '');
    });

    test('JS parseInt prefix tolerance on total (string / fractional)', () {
      // node: ("2026-01-15", "12 payments", 10) -> first=2026-02-10 total=12
      final r = getBillingRange('2026-01-15', '12 payments', 10)!;
      expect(r.total, 12, reason: 'parseInt stops at the first non-digit');
      expectDate(r.last, '2027-01-10', '');
      // node: ("2026-01-15", 12.9, 10) -> total=12 (parseInt truncates)
      final r2 = getBillingRange('2026-01-15', 12.9, 10)!;
      expect(r2.total, 12, reason: 'parseInt(12.9) === 12');
    });

    test('falsy billingDay (null / 0 / empty) falls back to 1', () {
      // node: ("2026-01-15", 12, null)      -> first=2026-02-01 bDay=1
      // node: ("2026-01-15", 12, 0)         -> first=2026-02-01 bDay=1
      // node: ("2026-01-15", 12, "")        -> first=2026-02-01 bDay=1
      // node: ("2026-01-15", 12, undefined) -> first=2026-02-01 bDay=1
      for (final bd in <Object?>[null, 0, '']) {
        final r = getBillingRange('2026-01-15', 12, bd)!;
        expect(r.bDay, 1, reason: 'falsy billingDay -> 1 (input: $bd)');
        expectDate(r.first, '2026-02-01', 'input: $bd');
        expectDate(r.last, '2027-01-01', 'input: $bd');
      }
      final rOmitted = getBillingRange('2026-01-15', 12, null)!;
      expect(rOmitted.bDay, 1);
    });

    test('negative billingDay is used verbatim (truthy in JS)', () {
      // node: ("2026-01-15", 12, -5) -> first=2026-01-26 last=2026-11-25 bDay=-5
      final r = getBillingRange('2026-01-15', 12, -5)!;
      expect(r.bDay, -5);
      expectDate(r.first, '2026-01-26', 'Date(2026, 1, -5) == 26 Jan');
      expectDate(r.last, '2026-11-25', '');
    });

    test('negative total produces a last date BEFORE first (no guard in JS)',
        () {
      // node: ("2026-01-15", -3, 10) -> first=2026-02-10 last=2025-10-10 total=-3
      final r = getBillingRange('2026-01-15', -3, 10)!;
      expect(r.total, -3);
      expectDate(r.first, '2026-02-10', '');
      expectDate(r.last, '2025-10-10', 'JS adds (total-1) == -4 months');
    });
  });

  group('getBillingRange - JS-PARITY DIVERGENCE (expected to FAIL)', () {
    test('DIVERGENCE 1: string "0" total is TRUTHY in JS -> range is NOT null',
        () {
      // node: ("2026-01-15", "0", 10)
      //         -> first=2026-02-10 last=2026-01-10 bDay=10 total=0
      // JS `!totalPayments` is false for the STRING '0' (only the number 0,
      // '', null and undefined are falsy), so JS builds a real range whose
      // `last` is one month BEFORE `first` (total-1 == -1).
      final r = getBillingRange('2026-01-15', '0', 10);
      expect(r, isNotNull,
          reason: "JS: '0' is a truthy string, getBillingRange returns a range");
      expect(r!.total, 0);
      expectDate(r.first, '2026-02-10', '');
      expectDate(r.last, '2026-01-10', 'total-1 == -1 month');
    });

    test('DIVERGENCE 2: string "0" billingDay is TRUTHY -> bDay is 0, not 1',
        () {
      // node: ("2026-01-15", 12, "0")
      //         -> first=2026-01-31 last=2026-11-30 bDay=0 total=12
      // JS `billingDay ? parseInt(billingDay,10) : 1` — the string '0' is
      // truthy, so bDay becomes 0 (NOT the 1 fallback). Day 0 then resolves to
      // the last day of the preceding month at every occurrence.
      final r = getBillingRange('2026-01-15', 12, '0')!;
      expect(r.bDay, 0, reason: "JS keeps 0 for the truthy string '0'");
      expectDate(r.first, '2026-01-31', 'startDay 15 >= 0 pushes to Feb, day 0');
      expectDate(r.last, '2026-11-30', '');
    });

    test('DIVERGENCE 3: empty day component => startDay 1 in JS, not 0', () {
      // node: ("2026-01-", 12, 1) -> first=2026-02-01 last=2027-01-01
      // JS: parts[2] === '' is FALSY, so `parts[2] ? parseInt(...) : 1` yields
      // startDay 1, and 1 >= bDay 1 pushes the first billing month forward.
      final r = getBillingRange('2026-01-', 12, 1)!;
      expectDate(r.first, '2026-02-01', 'startDay defaults to 1, 1 >= 1 pushes');
      expectDate(r.last, '2027-01-01', '');
      // node: ("2026-03-", 6, 1) -> first=2026-04-01 last=2026-09-01
      final r2 = getBillingRange('2026-03-', 6, 1)!;
      expectDate(r2.first, '2026-04-01', '');
      expectDate(r2.last, '2026-09-01', '');
      // Sanity: with bDay 10 the two implementations happen to agree.
      // node: ("2026-01-", 12, 10) -> first=2026-01-10 last=2026-12-10
      final r3 = getBillingRange('2026-01-', 12, 10)!;
      expectDate(r3.first, '2026-01-10', '');
    });
  });

  // ===========================================================================
  // isBillingActiveInMonth
  // ===========================================================================
  group('isBillingActiveInMonth', () {
    // node: range("2026-01-15", 12, 10) -> first=2026-02-10 last=2027-01-10
    final range = getBillingRange('2026-01-15', 12, 10)!;

    test('whole-month containment on a year*12+month ordinal', () {
      // node: (2026, 0) -> false ; (2026, 1) -> true ; (2026, 11) -> true
      //       (2027, 0) -> true  ; (2027, 1) -> false ; (2025, 11) -> false
      expect(isBillingActiveInMonth(range, 2026, 1), isFalse, reason: 'Jan 26');
      expect(isBillingActiveInMonth(range, 2026, 2), isTrue, reason: 'Feb 26');
      expect(isBillingActiveInMonth(range, 2026, 12), isTrue, reason: 'Dec 26');
      expect(isBillingActiveInMonth(range, 2027, 1), isTrue, reason: 'Jan 27');
      expect(isBillingActiveInMonth(range, 2027, 2), isFalse, reason: 'Feb 27');
      expect(isBillingActiveInMonth(range, 2025, 12), isFalse, reason: 'Dec 25');
    });

    test('day-of-month never affects the answer (whole-month test)', () {
      // The first billing DATE is the 10th, yet the whole of Feb 2026 is
      // active — the JS ordinal test never looks at getDate().
      expect(isBillingActiveInMonth(range, 2026, 2), isTrue);
      final lateRange = getBillingRange('2026-01-15', 1, 31)!;
      expectDate(lateRange.first, '2026-01-31', '');
      expect(isBillingActiveInMonth(lateRange, 2026, 1), isTrue,
          reason: 'active for the entire month containing the 31st');
    });
  });

  // ===========================================================================
  // parseDatesAndGetLeft
  // ===========================================================================
  group('parseDatesAndGetLeft', () {
    test('before the first billing date: every payment still remains', () {
      // node: ("2026-01-15", 12, 10, today=2026-01-20) -> left=12
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10,
                today: DateTime(2026, 1, 20))
            .left,
        12,
      );
      // node: ("2026-01-15", 12, 10, today=2026-02-09) -> left=12
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2026, 2, 9))
            .left,
        12,
      );
      // node: ("2026-01-15", 12, 10, today=2020-01-10) -> left=12
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2020, 1, 10))
            .left,
        12,
        reason: 'far in the past',
      );
    });

    test('exactly ON the billing day counts the current month as taken', () {
      // node: ("2026-01-15", 12, 10, today=2026-02-10) -> left=11
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2026, 2, 10))
            .left,
        11,
      );
      // node: ("2026-01-15", 12, 10, today=2026-02-11) -> left=11
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2026, 2, 11))
            .left,
        11,
      );
      // node: ("2026-01-05", 12, 10, today=2026-01-10) -> left=11
      expect(
        parseDatesAndGetLeft('2026-01-05', 12, 10, today: DateTime(2026, 1, 10))
            .left,
        11,
        reason: 'first billing month, on the billing day',
      );
      // node: ("2026-01-05", 12, 10, today=2026-01-09) -> left=12
      expect(
        parseDatesAndGetLeft('2026-01-05', 12, 10, today: DateTime(2026, 1, 9))
            .left,
        12,
        reason: 'first billing month, one day before',
      );
    });

    test('the time-of-day on `today` is stripped before comparison', () {
      // Same calendar day as the 09-Feb case above, but at 23:59 local.
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10,
                today: DateTime(2026, 2, 9, 23, 59, 59))
            .left,
        12,
        reason: 'cashflowDateOnly() zeroes the clock like JS todayZero',
      );
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10,
                today: DateTime(2026, 2, 10, 0, 0, 1))
            .left,
        11,
      );
    });

    test('final month and the floor at 0', () {
      // node: ("2026-01-15", 12, 10, today=2027-01-09) -> left=1
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2027, 1, 9))
            .left,
        1,
      );
      // node: ("2026-01-15", 12, 10, today=2027-01-10) -> left=0
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2027, 1, 10))
            .left,
        0,
      );
      // node: ("2026-01-15", 12, 10, today=2030-01-10) -> left=0 (floored)
      expect(
        parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2030, 1, 10))
            .left,
        0,
        reason: 'never negative',
      );
    });

    test('clamped billing day (31) — short-month boundary', () {
      // node: ("2025-11-20", 6, 31, today=2026-02-28) -> left=3
      // Feb 28 >= bDay 31 is FALSE, so February is NOT counted as taken even
      // though the 28th is that month's real (clamped) billing date.
      expect(
        parseDatesAndGetLeft('2025-11-20', 6, 31, today: DateTime(2026, 2, 28))
            .left,
        3,
        reason: 'JS compares against the STORED bDay 31, not the clamped date',
      );
      // node: ("2025-11-20", 6, 31, today=2026-03-31) -> left=1
      expect(
        parseDatesAndGetLeft('2025-11-20', 6, 31, today: DateTime(2026, 3, 31))
            .left,
        1,
      );
    });

    test('endDate mirrors range.last (JS endStr source)', () {
      // node: ("2026-01-15", 12, 10, ...) -> endStr=10.1.2027
      final r =
          parseDatesAndGetLeft('2026-01-15', 12, 10, today: DateTime(2026, 2, 10));
      expectDate(r.endDate, '2027-01-10', 'raw date behind he-IL "10.1.2027"');
      // node: ("2026-01-05", 12, 10, ...) -> endStr=10.12.2026
      final r2 =
          parseDatesAndGetLeft('2026-01-05', 12, 10, today: DateTime(2026, 1, 10));
      expectDate(r2.endDate, '2026-12-10', '');
    });

    test('null range -> left 0 (JS endStr "-")', () {
      // node: (null, 12, 10, today=2026-01-20) -> left=0 endStr=-
      final r = parseDatesAndGetLeft(null, 12, 10, today: DateTime(2026, 1, 20));
      expect(r.left, 0);
      expect(r.endDate, isNull);
    });
  });

  // ===========================================================================
  // parseLocalDateStr
  // ===========================================================================
  group('parseLocalDateStr', () {
    test('well-formed and zero-padded/unpadded stored dates', () {
      // node: "2026-09-05" -> 2026-09-05 ; "2026-9-5" -> 2026-09-05
      expectDate(parseLocalDateStr('2026-09-05'), '2026-09-05', '');
      expectDate(parseLocalDateStr('2026-9-5'), '2026-09-05', 'unpadded');
      // node: "2024-02-29" -> 2024-02-29
      expectDate(parseLocalDateStr('2024-02-29'), '2024-02-29', 'leap day');
    });

    test('LOCAL, not UTC — midnight local, never shifted by the offset', () {
      final d = parseLocalDateStr('2026-09-05')!;
      expect(d.isUtc, isFalse, reason: 'must be a local DateTime');
      expect(d.hour, 0);
      expect(d.minute, 0);
      expect(d.day, 5,
          reason: 'DateTime.parse-style UTC handling would risk day 4 or 6');
    });

    test('missing day component defaults to 1', () {
      // node: "2026-09" -> 2026-09-01
      expectDate(parseLocalDateStr('2026-09'), '2026-09-01', '');
    });

    test('permissive like JS: calendar validity is NOT enforced', () {
      // node: "2026-02-30" -> 2026-03-02
      expectDate(parseLocalDateStr('2026-02-30'), '2026-03-02', 'normalizes');
      // node: "2026-02-29" -> 2026-03-01
      expectDate(parseLocalDateStr('2026-02-29'), '2026-03-01', 'not a leap yr');
      // node: "2026-13-01" -> 2027-01-01
      expectDate(parseLocalDateStr('2026-13-01'), '2027-01-01', 'month 13');
      // node: "2026-00-15" -> 2025-12-15
      expectDate(parseLocalDateStr('2026-00-15'), '2025-12-15', 'month 0');
      // node: "2026-09-00" -> 2026-08-31
      expectDate(parseLocalDateStr('2026-09-00'), '2026-08-31', 'day 0');
      // node: "2026-12-32" -> 2027-01-01
      expectDate(parseLocalDateStr('2026-12-32'), '2027-01-01', 'day 32');
    });

    test('unparseable input returns null, never throws', () {
      // node: "" -> null ; null -> null ; undefined -> null
      expect(parseLocalDateStr(''), isNull);
      expect(parseLocalDateStr(null), isNull);
      // node: "abc" -> null ; "2026-ab-05" -> null
      expect(parseLocalDateStr('abc'), isNull);
      expect(parseLocalDateStr('2026-ab-05'), isNull);
      // Non-string input is not a valid stored date either.
      expect(parseLocalDateStr(20260905), isNull);
    });
  });

  group('parseLocalDateStr - JS-PARITY DIVERGENCE (expected to FAIL)', () {
    test('DIVERGENCE 4: trailing-dash date => day defaults to 1, not null', () {
      // node: "2026-09-" -> 2026-09-01
      // JS: parts[2] === '' is FALSY, so `parts[2] ? parseInt(parts[2],10) : 1`
      // yields 1 and a valid Date is returned.
      expectDate(parseLocalDateStr('2026-09-'), '2026-09-01',
          "JS treats an empty 3rd component exactly like a missing one");
    });

    test('DIVERGENCE 5: parseInt prefix tolerance on the components', () {
      // node: "2026-09-05T12:30:00" -> 2026-09-05
      // JS parseInt('05T12:30:00', 10) === 5.
      expectDate(parseLocalDateStr('2026-09-05T12:30:00'), '2026-09-05',
          'parseInt reads the leading digits and ignores the rest');
      // node: "2026-01-01extra" -> 2026-01-01
      expectDate(parseLocalDateStr('2026-01-01extra'), '2026-01-01',
          'parseInt reads the leading digits and ignores the rest');
    });
  });

  // ===========================================================================
  // cashflowDateOnly / cashflowDateKey / addCalendarDays
  // ===========================================================================
  group('cashflowDateOnly / cashflowDateKey', () {
    test('cashflowDateOnly strips the time, keeps the local calendar day', () {
      final d = cashflowDateOnly(DateTime(2026, 9, 5, 23, 59, 59, 999));
      expectDate(d, '2026-09-05', '');
      expect(d.hour, 0);
      expect(d.minute, 0);
      expect(d.second, 0);
      expect(d.millisecond, 0);
      expect(d.isUtc, isFalse);
      final e = cashflowDateOnly(DateTime(2026, 1, 1, 0, 0, 0));
      expectDate(e, '2026-01-01', 'midnight is unchanged');
    });

    test('cashflowDateKey zero-pads month and day', () {
      // node: 2026-01-05 -> 2026-01-05
      expect(cashflowDateKey(DateTime(2026, 1, 5)), '2026-01-05');
      // node: 2026-12-31 -> 2026-12-31
      expect(cashflowDateKey(DateTime(2026, 12, 31)), '2026-12-31');
      // node: 2026-09-09 -> 2026-09-09
      expect(cashflowDateKey(DateTime(2026, 9, 9)), '2026-09-09');
      expect(cashflowDateKey(DateTime(2026, 10, 10)), '2026-10-10');
      expect(cashflowDateKey(DateTime(2026, 9, 5, 18, 30)), '2026-09-05',
          reason: 'time component is irrelevant to the key');
    });

    test('cashflowDateKey round-trips through parseLocalDateStr', () {
      for (final d in [
        DateTime(2026, 1, 1),
        DateTime(2024, 2, 29),
        DateTime(2026, 12, 31),
        DateTime(2026, 6, 30),
      ]) {
        expect(parseLocalDateStr(cashflowDateKey(d)), d,
            reason: 'key/parse must be exact inverses');
      }
    });
  });

  group('addCalendarDays (DST safety)', () {
    test('plain +1 / -1 day', () {
      expectDate(addCalendarDays(DateTime(2026, 9, 5), 1), '2026-09-06', '');
      expectDate(addCalendarDays(DateTime(2026, 9, 5), -1), '2026-09-04', '');
      expectDate(addCalendarDays(DateTime(2026, 9, 5), 0), '2026-09-05', '');
    });

    test('month and year rollover in both directions', () {
      expectDate(addCalendarDays(DateTime(2026, 1, 31), 1), '2026-02-01', '');
      expectDate(addCalendarDays(DateTime(2026, 12, 31), 1), '2027-01-01', '');
      expectDate(addCalendarDays(DateTime(2026, 1, 1), -1), '2025-12-31', '');
      expectDate(addCalendarDays(DateTime(2026, 3, 1), -1), '2026-02-28', '');
      expectDate(addCalendarDays(DateTime(2024, 3, 1), -1), '2024-02-29',
          'leap year');
      expectDate(addCalendarDays(DateTime(2026, 2, 28), 1), '2026-03-01', '');
      expectDate(addCalendarDays(DateTime(2024, 2, 28), 1), '2024-02-29', '');
    });

    test('steps across the Israel DST boundaries stay calendar-exact', () {
      // Israel DST 2026: starts Fri 27 Mar, ends Sun 25 Oct.
      // node (setDate idiom): 2026-03-26 +1d -> 2026-03-27,
      //                       2026-03-27 +1d -> 2026-03-28,
      //                       2026-10-24 +1d -> 2026-10-25,
      //                       2026-10-25 +1d -> 2026-10-26
      expectDate(addCalendarDays(DateTime(2026, 3, 26), 1), '2026-03-27', '');
      expectDate(addCalendarDays(DateTime(2026, 3, 27), 1), '2026-03-28', '');
      expectDate(addCalendarDays(DateTime(2026, 10, 24), 1), '2026-10-25', '');
      expectDate(addCalendarDays(DateTime(2026, 10, 25), 1), '2026-10-26', '');
      // Every step of a full year must advance the calendar day exactly once.
      var cursor = DateTime(2026, 1, 1);
      var count = 0;
      while (cursor.year == 2026) {
        final next = addCalendarDays(cursor, 1);
        expect(next.isAfter(cursor), isTrue);
        cursor = next;
        count++;
      }
      expect(count, 365, reason: '2026 is not a leap year');
    });

    test('EVIDENCE: Duration-based day math IS unsafe in this timezone', () {
      // Not a parity assertion about the port — a guard proving why
      // addCalendarDays / the `DateTime(y, m+1, 0).day` idiom must be used
      // instead of a millisecond difference. Under Israel DST (clocks forward
      // on 27 Mar 2026) a span of 30 real calendar days measures as only 29
      // whole Durations, which is precisely the off-by-one the app.js
      // getForecastPeriodBounds comment calls out.
      final start = DateTime(2026, 3, 5);
      final end = DateTime(2026, 4, 4);
      var calendarDays = 0;
      var cursor = start;
      while (cursor.isBefore(end)) {
        cursor = addCalendarDays(cursor, 1);
        calendarDays++;
      }
      expect(calendarDays, 30, reason: '5 Mar -> 4 Apr is 30 calendar days');
      // If this ever equals 30, the machine is no longer running a DST-observing
      // local zone and the guard has simply stopped being able to demonstrate
      // the hazard — it does not mean the hazard is gone.
      expect(end.difference(start).inDays, isNot(31),
          reason: 'Duration.inDays must never be used as a calendar day count');
    });
  });

  // ===========================================================================
  // getForecastPeriodBounds (Version 1.4.7 contract)
  // ===========================================================================
  group('getForecastPeriodBounds', () {
    test('anchored to refDate OWN month regardless of refDate day', () {
      // node: ref=2026-09-04 -> start=2026-09-05 end=2026-10-04 totalDays=30
      final b1 = getForecastPeriodBounds(DateTime(2026, 9, 4));
      expectDate(b1.periodStart, '2026-09-05',
          'the 1.4.7 correction: the 4th yields THIS month, not last month');
      expectDate(b1.periodEnd, '2026-10-04', '');
      expect(b1.totalDays, 30);
      // node: ref=2026-09-01 -> start=2026-09-05 end=2026-10-04 totalDays=30
      final b2 = getForecastPeriodBounds(DateTime(2026, 9, 1));
      expectDate(b2.periodStart, '2026-09-05', '');
      expectDate(b2.periodEnd, '2026-10-04', '');
      // node: ref=2026-09-05 / 2026-09-30 -> identical bounds
      for (final day in [2, 3, 5, 6, 15, 30]) {
        final b = getForecastPeriodBounds(DateTime(2026, 9, day));
        expectDate(b.periodStart, '2026-09-05', 'day $day');
        expectDate(b.periodEnd, '2026-10-04', 'day $day');
        expect(b.totalDays, 30, reason: 'day $day');
      }
    });

    test('the time component of refDate is irrelevant', () {
      final b = getForecastPeriodBounds(DateTime(2026, 9, 4, 23, 59, 59));
      expectDate(b.periodStart, '2026-09-05', '');
      expectDate(b.periodEnd, '2026-10-04', '');
    });

    test('December -> January year rollover', () {
      // node: ref=2026-12-01 -> start=2026-12-05 end=2027-01-04 totalDays=31
      // node: ref=2026-12-05 -> start=2026-12-05 end=2027-01-04 totalDays=31
      // node: ref=2026-12-31 -> start=2026-12-05 end=2027-01-04 totalDays=31
      for (final day in [1, 4, 5, 20, 31]) {
        final b = getForecastPeriodBounds(DateTime(2026, 12, day));
        expectDate(b.periodStart, '2026-12-05', 'day $day');
        expectDate(b.periodEnd, '2027-01-04', 'day $day');
        expect(b.totalDays, 31, reason: 'day $day');
      }
    });

    test('January refDate never reaches back into the previous year', () {
      // node: ref=2026-01-02 -> start=2026-01-05 end=2026-02-04 totalDays=31
      final b = getForecastPeriodBounds(DateTime(2026, 1, 2));
      expectDate(b.periodStart, '2026-01-05', 'NOT 2025-12-05');
      expectDate(b.periodEnd, '2026-02-04', '');
      expect(b.totalDays, 31);
      // node: ref=2026-01-31 -> start=2026-01-05 end=2026-02-04 totalDays=31
      final b2 = getForecastPeriodBounds(DateTime(2026, 1, 31));
      expectDate(b2.periodStart, '2026-01-05', '');
      expectDate(b2.periodEnd, '2026-02-04', '');
    });

    test('totalDays == periodStart own month length (Feb, leap Feb, 30/31)',
        () {
      // node: ref=2026-02-03 -> start=2026-02-05 end=2026-03-04 totalDays=28
      final feb = getForecastPeriodBounds(DateTime(2026, 2, 3));
      expectDate(feb.periodStart, '2026-02-05', '');
      expectDate(feb.periodEnd, '2026-03-04', '');
      expect(feb.totalDays, 28, reason: '2026 February');
      // node: ref=2024-02-10 -> start=2024-02-05 end=2024-03-04 totalDays=29
      final leapFeb = getForecastPeriodBounds(DateTime(2024, 2, 10));
      expectDate(leapFeb.periodStart, '2024-02-05', '');
      expectDate(leapFeb.periodEnd, '2024-03-04', '');
      expect(leapFeb.totalDays, 29, reason: '2024 February (leap)');
      // node: ref=2026-04-20 -> start=2026-04-05 end=2026-05-04 totalDays=30
      final apr = getForecastPeriodBounds(DateTime(2026, 4, 20));
      expectDate(apr.periodStart, '2026-04-05', '');
      expectDate(apr.periodEnd, '2026-05-04', '');
      expect(apr.totalDays, 30);
      // node: ref=2027-02-04 -> start=2027-02-05 end=2027-03-04 totalDays=28
      final feb27 = getForecastPeriodBounds(DateTime(2027, 2, 4));
      expectDate(feb27.periodStart, '2027-02-05', '');
      expectDate(feb27.periodEnd, '2027-03-04', '');
      expect(feb27.totalDays, 28);
    });

    test('the period always spans exactly two distinct calendar months', () {
      for (var m = 1; m <= 12; m++) {
        final b = getForecastPeriodBounds(DateTime(2026, m, 17));
        expect(b.periodStart.day, 5, reason: 'month $m');
        expect(b.periodEnd.day, 4, reason: 'month $m');
        expect(b.periodEnd.isAfter(b.periodStart), isTrue, reason: 'month $m');
        final startOrd = b.periodStart.year * 12 + b.periodStart.month;
        final endOrd = b.periodEnd.year * 12 + b.periodEnd.month;
        expect(endOrd - startOrd, 1,
            reason: 'exactly one month apart (month $m)');
        // totalDays must equal periodStart month's own length.
        final ownLength =
            DateTime(b.periodStart.year, b.periodStart.month + 1, 0).day;
        expect(b.totalDays, ownLength, reason: 'month $m');
        // ...and the inclusive day span must equal totalDays. Counted by
        // CALENDAR stepping, never by Duration.inDays — see the DST test
        // below for why a millisecond difference is wrong here.
        var span = 1;
        var cursor = b.periodStart;
        while (cursor.isBefore(b.periodEnd)) {
          cursor = addCalendarDays(cursor, 1);
          span++;
        }
        expect(span, b.totalDays, reason: 'inclusive span (month $m)');
      }
    });
  });

  // ===========================================================================
  // isBimonthlyActiveMonth
  // ===========================================================================
  group('isBimonthlyActiveMonth', () {
    test('parity match makes a month active (year-agnostic)', () {
      // node: (9,9)->true (11,9)->true (1,9)->true (10,9)->false
      expect(isBimonthlyActiveMonth(9, 9), isTrue, reason: 'Sep/Sep');
      expect(isBimonthlyActiveMonth(11, 9), isTrue, reason: 'Nov');
      expect(isBimonthlyActiveMonth(1, 9), isTrue, reason: 'Jan (next year)');
      expect(isBimonthlyActiveMonth(10, 9), isFalse, reason: 'Oct');
      // node: (2,2)->true (12,2)->true (1,2)->false
      expect(isBimonthlyActiveMonth(2, 2), isTrue);
      expect(isBimonthlyActiveMonth(12, 2), isTrue);
      expect(isBimonthlyActiveMonth(1, 2), isFalse);
    });

    test('a Sep-anchored cycle covers exactly the 6 odd months', () {
      final active = [
        for (var m = 1; m <= 12; m++)
          if (isBimonthlyActiveMonth(m, 9)) m
      ];
      expect(active, [1, 3, 5, 7, 9, 11]);
      final activeEven = [
        for (var m = 1; m <= 12; m++)
          if (isBimonthlyActiveMonth(m, 4)) m
      ];
      expect(activeEven, [2, 4, 6, 8, 10, 12]);
    });
  });

  // ===========================================================================
  // resolveItemEffectiveDay
  // JS resolveEffectiveDay(item): own day 1..31 -> it; else
  // categoryConfig[displayCategory || type].defaultDayOfMonth when 1..31;
  // else categoryConfig[type].defaultDayOfMonth when 1..31; else 1.
  // ===========================================================================
  group('resolveItemEffectiveDay', () {
    final cfg = <String, CategoryConfig>{
      'income': const CategoryConfig(
          key: 'income',
          label: 'i',
          baseType: CategoryBaseType.income,
          defaultDayOfMonth: 10),
      'fixed': const CategoryConfig(
          key: 'fixed',
          label: 'f',
          baseType: CategoryBaseType.fixed,
          defaultDayOfMonth: 2),
      'dated': const CategoryConfig(
          key: 'dated',
          label: 'd',
          baseType: CategoryBaseType.dated,
          defaultDayOfMonth: 7),
      'custom_ok': const CategoryConfig(
          key: 'custom_ok',
          label: 'c',
          baseType: CategoryBaseType.fixed,
          defaultDayOfMonth: 22),
      'custom_bad': const CategoryConfig(
          key: 'custom_bad',
          label: 'c',
          baseType: CategoryBaseType.fixed,
          defaultDayOfMonth: 99),
      'custom_none': const CategoryConfig(
          key: 'custom_none', label: 'c', baseType: CategoryBaseType.fixed),
    };

    test('a valid own day 1..31 always wins', () {
      expect(resolveItemEffectiveDay(_income(day: 15), cfg), 15);
      expect(resolveItemEffectiveDay(_income(day: '15'), cfg), 15,
          reason: 'string day, parseInt semantics');
      expect(resolveItemEffectiveDay(_income(day: 1), cfg), 1);
      expect(resolveItemEffectiveDay(_income(day: 31), cfg), 31);
      expect(resolveItemEffectiveDay(_income(day: '15.9'), cfg), 15,
          reason: 'parseInt("15.9") === 15');
    });

    test('own day out of 1..31, absent, or garbage falls back', () {
      // JS parseInt gives 0/32/NaN which all fail the 1..31 gate.
      expect(resolveItemEffectiveDay(_income(day: 0), cfg), 10,
          reason: 'category default');
      expect(resolveItemEffectiveDay(_income(day: 32), cfg), 10);
      expect(resolveItemEffectiveDay(_income(day: -3), cfg), 10);
      expect(resolveItemEffectiveDay(_income(day: 'abc'), cfg), 10);
      expect(resolveItemEffectiveDay(_income(day: null), cfg), 10);
    });

    test('displayCategory wins over type when it resolves', () {
      expect(
        resolveItemEffectiveDay(
            _fixed(day: null, displayCategory: 'custom_ok'), cfg),
        22,
      );
    });

    test('unknown displayCategory falls back to the type config (JS ||-then-'
        'type chain)', () {
      expect(
        resolveItemEffectiveDay(
            _fixed(day: null, displayCategory: 'no_such_key'), cfg),
        2,
        reason: 'categoryConfig[item.type] second lookup',
      );
      expect(
        resolveItemEffectiveDay(_fixed(day: null, displayCategory: ''), cfg),
        2,
        reason: "JS '' is falsy in `displayCategory || type`",
      );
    });

    test('an out-of-range or missing category default degrades to 1', () {
      expect(
        resolveItemEffectiveDay(
            _fixed(day: null, displayCategory: 'custom_bad'), cfg),
        1,
        reason: 'defaultDayOfMonth 99 fails the 1..31 gate; type default is '
            'NOT consulted a second time in JS once a cfg was found',
      );
      expect(
        resolveItemEffectiveDay(
            _fixed(day: null, displayCategory: 'custom_none'), cfg),
        1,
        reason: 'cfg found but carries no defaultDayOfMonth',
      );
      expect(resolveItemEffectiveDay(_fixed(day: null), <String, CategoryConfig>{}),
          1,
          reason: 'empty config map');
    });

    test('day-less item types resolve through the category/1 path', () {
      // JS: parseInt(undefined, 10) is NaN -> falls straight through.
      expect(resolveItemEffectiveDay(_dated(), cfg), 7,
          reason: "categoryConfig['dated'].defaultDayOfMonth");
      expect(resolveItemEffectiveDay(_withdrawal(), cfg), 1,
          reason: "no 'cashWithdrawal' category configured -> 1");
      expect(
        resolveItemEffectiveDay(_dated(displayCategory: 'custom_ok'), cfg),
        22,
      );
    });
  });

  // ===========================================================================
  // Cross-function invariants
  // ===========================================================================
  group('cross-function invariants', () {
    test('every month of a 24-payment schedule is reported active exactly once',
        () {
      final r = getBillingRange('2026-01-15', 24, 31)!;
      var activeCount = 0;
      for (var ord = 2025 * 12; ord < 2029 * 12; ord++) {
        if (isBillingActiveInMonth(r, ord ~/ 12, (ord % 12) + 1)) activeCount++;
      }
      expect(activeCount, 24,
          reason: 'active-month count must equal the payment count');
    });

    test('payments left decreases by exactly 1 per billing month', () {
      final results = <int>[];
      for (var m = 1; m <= 13; m++) {
        results.add(parseDatesAndGetLeft('2026-01-05', 12, 10,
                today: DateTime(2026, m, 10))
            .left);
      }
      // Billing runs Jan..Dec 2026 on the 10th; on each 10th one more is gone.
      expect(results.sublist(0, 12), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
      expect(results[12], 0, reason: 'Jan 2027 (month 13) is past the end');
    });

    test('getClampedBillingDate never produces a day outside the real month',
        () {
      for (var y = 2024; y <= 2028; y++) {
        for (var m = 1; m <= 12; m++) {
          for (final day in [1, 28, 29, 30, 31]) {
            final d = getClampedBillingDate(y, m, day);
            expect(d.year, y, reason: '$y-$m-$day');
            expect(d.month, m, reason: '$y-$m-$day');
            expect(d.day <= day, isTrue, reason: 'never later than the stored '
                'day ($y-$m-$day -> ${ymd(d)})');
            final lastDay = DateTime(y, m + 1, 0).day;
            expect(d.day, day > lastDay ? lastDay : day, reason: '$y-$m-$day');
          }
        }
      }
    });
  });
}
