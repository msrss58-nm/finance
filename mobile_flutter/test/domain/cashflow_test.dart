import 'package:flutter_test/flutter_test.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/domain/cashflow/cashflow_engine.dart';
import 'package:familyfinance_pro/domain/dates/billing_dates.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

/// Every expected value below is derived by reasoning directly from app.js's
/// generateCashflowEvents()/getBillingRange()/getClampedBillingDate(); the
/// derivation is spelled out in a comment wherever it is not self-evident.
///
/// kDefaultCategoryConfig carries NO defaultDayOfMonth for any category, so
/// every item below states its own `day` explicitly — the category-default
/// fallback path is billing_dates.dart's concern, not this engine's.

final _cfg = kDefaultCategoryConfig;

List<CashflowEvent> _gen(
  List<FinanceItem> items,
  DateTime start, {
  int? months,
}) =>
    generateCashflowEvents(items, start, monthsCount: months, categoryConfig: _cfg);

List<String> _keys(List<CashflowEvent> evs) =>
    evs.map((e) => cashflowDateKey(e.date)).toList();

IncomeItem _income({
  int id = 1,
  num amount = 10000,
  Object? day = 10,
  bool archived = false,
  String title = 'משכורת',
}) =>
    IncomeItem(
      id: IntItemId(id),
      isArchived: archived,
      title: title,
      amount: amount,
      day: LegacyNumericField(day),
    );

FixedItem _fixed({
  int id = 2,
  num amount = 1200,
  Object? day = 5,
  String? where = 'bank',
  FixedPeriod period = FixedPeriod.monthly,
  bool bimonthly = false,
  int? bimonthlyStartMonth,
  bool archived = false,
  String title = 'ארנונה',
}) =>
    FixedItem(
      id: IntItemId(id),
      isArchived: archived,
      title: title,
      amount: amount,
      day: LegacyNumericField(day),
      where: LegacyStringField(where),
      period: period,
      bimonthly: bimonthly,
      bimonthlyStartMonth: bimonthlyStartMonth,
    );

LoanItem _loan({
  int id = 3,
  num amount = 500,
  Object? day = 10,
  Object? total = 3,
  String? start = '2026-01-20',
  String? where = 'bank',
  bool archived = false,
  String title = 'הלוואה',
}) =>
    LoanItem(
      id: IntItemId(id),
      isArchived: archived,
      title: title,
      originalAmount: LegacyNumericField.absent,
      amount: amount,
      where: LegacyStringField(where),
      interest: LegacyNumericField.absent,
      day: LegacyNumericField(day),
      total: LegacyNumericField(total),
      start: start,
    );

VariableItem _variable({
  int id = 4,
  num amount = 250,
  Object? day = 15,
  Object? total = 4,
  String? start = '2026-01-01',
  String? where = 'bank',
  bool archived = false,
  String title = 'מקרר',
}) =>
    VariableItem(
      id: IntItemId(id),
      isArchived: archived,
      title: title,
      originalAmount: LegacyNumericField.absent,
      amount: amount,
      day: LegacyNumericField(day),
      total: LegacyNumericField(total),
      start: start,
      where: LegacyStringField(where),
    );

/// `displayCategory` null (or 'dated', or '') => the BUILT-IN credit-card
/// settlement. Any other key => a custom dated category.
DatedItem _dated({
  int id = 5,
  num amount = 300,
  String? start = '2026-02-14',
  String? displayCategory = 'creditPurchase',
  String? rawWhere,
  bool archived = false,
  String title = 'חיוב',
}) =>
    DatedItem(
      id: IntItemId(id),
      isArchived: archived,
      displayCategory: displayCategory,
      title: title,
      amount: amount,
      start: start,
      // Milestone 2 integration: DatedItem now MODELS `where` (the live app
      // stores it — the edit form writes where/cardLast4 for dated charges),
      // so the raw value goes through the same resolveEffectiveWhere()
      // bank-defaulting resolver ItemNormalizer applies, instead of the
      // earlier extras['where'] workaround.
      where: LegacyStringField(rawWhere),
    );

CashWithdrawalItem _cash({
  int id = 6,
  num amount = 200,
  String? start = '2026-03-03',
  bool archived = false,
  String title = 'משיכת מזומן',
}) =>
    CashWithdrawalItem(
      id: IntItemId(id),
      isArchived: archived,
      title: title,
      amount: amount,
      start: start,
    );

void main() {
  group('horizon window', () {
    test('default months count is the 6-month horizon constant', () {
      expect(kCashflowHorizonMonths, 6);
      final evs = _gen([_income(day: 10)], DateTime(2026, 1, 1));
      expect(evs.length, 6);
      expect(_keys(evs), [
        '2026-01-10',
        '2026-02-10',
        '2026-03-10',
        '2026-04-10',
        '2026-05-10',
        '2026-06-10',
      ]);
    });

    test('horizonEnd is the last day of the last month in the window', () {
      // JS: new Date(2025, 11 + 3, 0) === new Date(2026, 2, 0) === 28.02.2026.
      // A dated item ON that day is inside; the next day is outside.
      final inside = _dated(id: 11, start: '2026-02-28');
      final outside = _dated(id: 12, start: '2026-03-01');
      final evs = _gen([inside, outside], DateTime(2025, 12, 1), months: 3);
      expect(evs.length, 1);
      expect(cashflowDateKey(evs.single.date), '2026-02-28');
    });

    test('horizonStart is the 1st of rangeStartMonth regardless of its day',
        () {
      // rangeStartMonth mid-month must still open the window on the 1st.
      final onFirst = _dated(id: 13, start: '2026-01-01');
      final evs = _gen([onFirst], DateTime(2026, 1, 17), months: 1);
      expect(evs.length, 1);
      expect(cashflowDateKey(evs.single.date), '2026-01-01');
    });

    test('archived items generate nothing, for every type', () {
      final items = <FinanceItem>[
        _income(archived: true),
        _fixed(archived: true),
        _loan(archived: true),
        _variable(archived: true),
        _dated(archived: true),
        _cash(archived: true),
      ];
      expect(_gen(items, DateTime(2026, 1, 1)), isEmpty);
    });
  });

  group('income', () {
    test('one event per month at the effective day, positive amount', () {
      final evs = _gen([_income(amount: 12345, day: 7)], DateTime(2026, 1, 1),
          months: 3);
      expect(_keys(evs), ['2026-01-07', '2026-02-07', '2026-03-07']);
      for (final e in evs) {
        expect(e.amount, 12345);
        expect(e.type, ItemType.income);
        expect(e.itemId, const IntItemId(1));
        expect(e.title, 'משכורת');
      }
    });

    test('day 31 clamps to 28 in a non-leap February (2026)', () {
      final evs =
          _gen([_income(day: 31)], DateTime(2026, 1, 1), months: 3);
      expect(_keys(evs), ['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    test('day 31 clamps to 29 in a leap February (2028)', () {
      // 2028 is divisible by 4 and not a century year => leap.
      final evs =
          _gen([_income(day: 31)], DateTime(2028, 1, 1), months: 3);
      expect(_keys(evs), ['2028-01-31', '2028-02-29', '2028-03-31']);
    });

    test('days 29 and 30 clamp in February but are untouched elsewhere', () {
      final e29 = _gen([_income(id: 1, day: 29)], DateTime(2026, 1, 1),
          months: 3);
      expect(_keys(e29), ['2026-01-29', '2026-02-28', '2026-03-29']);
      final e30 = _gen([_income(id: 1, day: 30)], DateTime(2026, 1, 1),
          months: 3);
      expect(_keys(e30), ['2026-01-30', '2026-02-28', '2026-03-30']);
    });

    test('window rolls over December into January', () {
      final evs =
          _gen([_income(day: 15)], DateTime(2025, 12, 1), months: 3);
      expect(_keys(evs), ['2025-12-15', '2026-01-15', '2026-02-15']);
    });
  });

  group('fixed', () {
    test('monthly bank item: full negative amount every month', () {
      final evs = _gen([_fixed(amount: 1200, day: 5)], DateTime(2026, 1, 1),
          months: 3);
      expect(_keys(evs), ['2026-01-05', '2026-02-05', '2026-03-05']);
      for (final e in evs) {
        expect(e.amount, -1200);
        expect(e.type, ItemType.fixed);
      }
    });

    test('yearly item smooths to amount/12 every month', () {
      // 1200 / 12 = 100 charged every month (the existing budgeting
      // convention), NOT 1200 once a year.
      final evs = _gen(
        [_fixed(amount: 1200, period: FixedPeriod.yearly)],
        DateTime(2026, 1, 1),
        months: 3,
      );
      expect(evs.length, 3);
      for (final e in evs) {
        expect(e.amount, -100);
      }
    });

    test('bimonthly generates the DISCRETE full amount in parity months only',
        () {
      // Start month 9 (September, odd). Active months are every month with
      // the same odd/even parity => Jan(1), Mar(3), May(5) in a Jan-Jun
      // window. Amount is the FULL amount, never smoothed.
      final evs = _gen(
        [
          _fixed(
            amount: 800,
            day: 20,
            bimonthly: true,
            bimonthlyStartMonth: 9,
          )
        ],
        DateTime(2026, 1, 1),
        months: 6,
      );
      expect(_keys(evs), ['2026-01-20', '2026-03-20', '2026-05-20']);
      for (final e in evs) {
        expect(e.amount, -800);
      }
    });

    test('bimonthly with an even start month hits the even months', () {
      final evs = _gen(
        [
          _fixed(
            amount: 800,
            day: 20,
            bimonthly: true,
            bimonthlyStartMonth: 10,
          )
        ],
        DateTime(2026, 1, 1),
        months: 6,
      );
      expect(_keys(evs), ['2026-02-20', '2026-04-20', '2026-06-20']);
    });

    test('bimonthly:true with an INVALID start month falls back to period', () {
      // resolveFixedIsBimonthly() requires BOTH flags to be valid; malformed
      // recurrence data degrades to the ordinary monthly behaviour.
      final evs = _gen(
        [
          _fixed(
            amount: 800,
            day: 20,
            bimonthly: true,
            bimonthlyStartMonth: null,
          )
        ],
        DateTime(2026, 1, 1),
        months: 3,
      );
      expect(_keys(evs), ['2026-01-20', '2026-02-20', '2026-03-20']);
      expect(evs.first.amount, -800);
    });

    test('bimonthly beats period: a yearly+bimonthly item is NOT smoothed', () {
      // app.js computes mAmount as `isBimonthly ? amount : (yearly ? /12 : amount)`
      // — the bimonthly branch short-circuits the yearly division entirely.
      final evs = _gen(
        [
          _fixed(
            amount: 1200,
            day: 20,
            period: FixedPeriod.yearly,
            bimonthly: true,
            bimonthlyStartMonth: 1,
          )
        ],
        DateTime(2026, 1, 1),
        months: 2,
      );
      expect(_keys(evs), ['2026-01-20']);
      expect(evs.single.amount, -1200);
    });

    test('credit-paid fixed item generates NOTHING', () {
      final evs = _gen([_fixed(where: 'credit')],
          DateTime(2026, 1, 1), months: 6);
      expect(evs, isEmpty);
    });

    test('fixed day 31 clamps in February', () {
      final evs =
          _gen([_fixed(day: 31)], DateTime(2026, 1, 1), months: 3);
      expect(_keys(evs), ['2026-01-31', '2026-02-28', '2026-03-31']);
    });
  });

  group('loan', () {
    test('bank loan generates one event per ACTIVE billing month', () {
      // start 2026-01-20, bDay 10, total 3.
      // startDay(20) >= bDay(10) => first billing month is pushed to Feb.
      // first = 10.02.2026, last = 10.02.2026 + 2 months = 10.04.2026.
      final evs = _gen([_loan()], DateTime(2026, 1, 1), months: 6);
      expect(_keys(evs), ['2026-02-10', '2026-03-10', '2026-04-10']);
      for (final e in evs) {
        expect(e.amount, -500);
        expect(e.type, ItemType.loan);
      }
    });

    test('start day BEFORE the billing day keeps the start month', () {
      // start 2026-01-05, bDay 10 => 5 < 10, so January itself is billed.
      final evs = _gen(
        [_loan(start: '2026-01-05', day: 10, total: 3)],
        DateTime(2026, 1, 1),
        months: 6,
      );
      expect(_keys(evs), ['2026-01-10', '2026-02-10', '2026-03-10']);
    });

    test('payroll-deducted loan generates NOTHING', () {
      final evs = _gen([_loan(where: 'דרך תלוש השכר')],
          DateTime(2026, 1, 1), months: 6);
      expect(evs, isEmpty);
    });

    test('a FUTURE loan generates nothing before its first billing month', () {
      // start 2026-05-20, bDay 10, total 3 => 20 >= 10 so the first billing
      // month is June: first = 10.06.2026, last = 10.08.2026.
      final future = _loan(start: '2026-05-20', day: 10, total: 3);

      // Jan-Mar window: entirely before the range => nothing at all.
      expect(_gen([future], DateTime(2026, 1, 1), months: 3), isEmpty);

      // Jan-Jun window: only June is active.
      final evs = _gen([future], DateTime(2026, 1, 1), months: 6);
      expect(_keys(evs), ['2026-06-10']);
    });

    test('loan with no start / no total produces no range and no events', () {
      expect(_gen([_loan(start: null)], DateTime(2026, 1, 1)), isEmpty);
      expect(_gen([_loan(total: 0)], DateTime(2026, 1, 1)), isEmpty);
      expect(_gen([_loan(total: null)], DateTime(2026, 1, 1)), isEmpty);
    });

    test('loan billing day clamps in February', () {
      // start 2026-01-05, bDay 31, total 3 => 5 < 31 so January is billed:
      // first = 31.01.2026, last = clamp(2026, Mar, 31) = 31.03.2026.
      final evs = _gen(
        [_loan(start: '2026-01-05', day: 31, total: 3)],
        DateTime(2026, 1, 1),
        months: 6,
      );
      expect(_keys(evs), ['2026-01-31', '2026-02-28', '2026-03-31']);
    });
  });

  group('variable ("תשלומים שונים")', () {
    test('where == bank DOES generate events, on the loan schedule', () {
      // start 2026-01-01, bDay 15, total 4 => 1 < 15 so January is billed:
      // first = 15.01.2026, last = 15.04.2026.
      final evs = _gen([_variable()], DateTime(2026, 1, 1), months: 6);
      expect(_keys(evs),
          ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
      for (final e in evs) {
        expect(e.amount, -250);
        expect(e.type, ItemType.variable);
      }
    });

    test('where == credit generates NOTHING (the settlement represents it)',
        () {
      final evs = _gen([_variable(where: 'credit')],
          DateTime(2026, 1, 1), months: 6);
      expect(evs, isEmpty);
    });

    test('LEGACY variable with where == null stays tracking-only', () {
      // Never default a missing method to bank — that would start deducting a
      // legacy item from the balance with no user confirmation.
      final evs =
          _gen([_variable(where: null)], DateTime(2026, 1, 1), months: 6);
      expect(evs, isEmpty);
    });
  });

  group('dated', () {
    test('custom-category dated item paid from the bank generates once', () {
      final evs = _gen([_dated(amount: 300, start: '2026-02-14')],
          DateTime(2026, 1, 1), months: 6);
      expect(evs.length, 1);
      expect(cashflowDateKey(evs.single.date), '2026-02-14');
      expect(evs.single.amount, -300);
      expect(evs.single.type, ItemType.dated);
    });

    test('custom-category dated item paid by CREDIT generates nothing', () {
      final evs = _gen([_dated(rawWhere: 'credit')], DateTime(2026, 1, 1),
          months: 6);
      expect(evs, isEmpty);
    });

    test('an unrecognized raw `where` defaults to bank (fixed convention)', () {
      final evs = _gen([_dated(rawWhere: 'בנק לאומי')], DateTime(2026, 1, 1),
          months: 6);
      expect(evs.length, 1);
    });

    test('BUILT-IN settlement always generates, even marked credit', () {
      // isBuiltinCreditCardSettlement() checks the KEY (displayCategory ||
      // type), never `where` and never the label — so a settlement stored
      // with where:'credit' self-heals with no migration.
      for (final dc in <String?>[null, 'dated', '']) {
        final evs = _gen(
          [
            _dated(
              amount: 4000,
              start: '2026-02-02',
              displayCategory: dc,
              rawWhere: 'credit',
            )
          ],
          DateTime(2026, 1, 1),
          months: 6,
        );
        expect(evs.length, 1, reason: 'displayCategory: $dc');
        expect(evs.single.amount, -4000);
        expect(cashflowDateKey(evs.single.date), '2026-02-02');
      }
    });

    test('isBuiltinCreditCardSettlement checks the key, not the type alone',
        () {
      expect(isBuiltinCreditCardSettlement(_dated(displayCategory: null)), isTrue);
      expect(isBuiltinCreditCardSettlement(_dated(displayCategory: 'dated')),
          isTrue);
      expect(isBuiltinCreditCardSettlement(_dated(displayCategory: '')), isTrue);
      expect(
          isBuiltinCreditCardSettlement(_dated(displayCategory: 'creditPurchase')),
          isFalse);
      // A non-dated item can never be the settlement, whatever its category.
      expect(isBuiltinCreditCardSettlement(_fixed()), isFalse);
    });

    test('a dated item outside the window generates nothing', () {
      expect(
        _gen([_dated(start: '2025-12-31')], DateTime(2026, 1, 1), months: 6),
        isEmpty,
      );
      expect(
        _gen([_dated(start: '2026-07-01')], DateTime(2026, 1, 1), months: 6),
        isEmpty,
      );
    });

    test('a dated item with no start generates nothing', () {
      expect(_gen([_dated(start: null)], DateTime(2026, 1, 1)), isEmpty);
      expect(_gen([_dated(start: '')], DateTime(2026, 1, 1)), isEmpty);
    });
  });

  group('EXACTLY ONCE: credit purchases never double-count the settlement', () {
    test('credit-paid fixed + built-in settlement => ONE bank event', () {
      final creditFixed = _fixed(
        id: 100,
        amount: 900,
        day: 3,
        where: 'credit',
        title: 'ביטוח בכרטיס',
      );
      final settlement = _dated(
        id: 101,
        amount: 4000,
        start: '2026-02-02',
        displayCategory: null,
        rawWhere: 'credit',
        title: 'חיוב כרטיס אשראי',
      );
      final evs = _gen([creditFixed, settlement], DateTime(2026, 2, 1),
          months: 1);
      expect(evs.length, 1);
      expect(evs.single.itemId, const IntItemId(101));
      expect(evs.single.amount, -4000);
    });

    test('credit fixed + credit variable + credit dated + settlement => ONE',
        () {
      final items = <FinanceItem>[
        _fixed(id: 100, where: 'credit'),
        _variable(
          id: 102,
          start: '2026-01-01',
          total: 6,
          day: 15,
          where: 'credit',
        ),
        _dated(
          id: 103,
          start: '2026-02-14',
          displayCategory: 'creditPurchase',
          rawWhere: 'credit',
        ),
        _dated(
          id: 101,
          amount: 4000,
          start: '2026-02-02',
          displayCategory: null,
        ),
      ];
      final evs = _gen(items, DateTime(2026, 2, 1), months: 1);
      expect(evs.length, 1);
      expect(evs.single.itemId, const IntItemId(101));
    });
  });

  group('cashWithdrawal', () {
    test('one-time event on its own date, under its own type', () {
      final evs =
          _gen([_cash(amount: 200, start: '2026-03-03')], DateTime(2026, 1, 1));
      expect(evs.length, 1);
      expect(cashflowDateKey(evs.single.date), '2026-03-03');
      expect(evs.single.amount, -200);
      expect(evs.single.type, ItemType.cashWithdrawal);
    });

    test('respects the window bounds and a missing start date', () {
      expect(_gen([_cash(start: '2025-12-31')], DateTime(2026, 1, 1), months: 6),
          isEmpty);
      expect(_gen([_cash(start: null)], DateTime(2026, 1, 1)), isEmpty);
    });
  });

  group('deterministic ordering', () {
    test('same-day events order income -> fixed -> loan -> variable -> '
        'dated -> cashWithdrawal', () {
      // Every item below is engineered to land on 05.01.2026:
      //  * loan/variable: start 2025-12-06, bDay 5, total 6 => 6 >= 5 so the
      //    first billing month is January 2026 => 05.01.2026.
      final items = <FinanceItem>[
        _cash(id: 60, start: '2026-01-05'),
        _dated(id: 50, start: '2026-01-05'),
        _variable(
          id: 40,
          start: '2025-12-06',
          day: 5,
          total: 6,
          where: 'bank',
        ),
        _loan(id: 30, start: '2025-12-06', day: 5, total: 6),
        _fixed(id: 20, day: 5),
        _income(id: 10, day: 5),
      ];
      final evs = _gen(items, DateTime(2026, 1, 1), months: 1);
      expect(evs.length, 6);
      expect(evs.map((e) => e.type).toList(), [
        ItemType.income,
        ItemType.fixed,
        ItemType.loan,
        ItemType.variable,
        ItemType.dated,
        ItemType.cashWithdrawal,
      ]);
      // Income first means a day that nets positive never *appears* to dip.
      expect(evs.first.amount, greaterThan(0));
    });

    test('same day + same type falls back to ascending numeric itemId', () {
      final evs = _gen(
        [_income(id: 20, day: 5), _income(id: 10, day: 5)],
        DateTime(2026, 1, 1),
        months: 1,
      );
      expect(evs.map((e) => (e.itemId as IntItemId).value).toList(), [10, 20]);
    });

    test('date ordering dominates type ordering', () {
      final evs = _gen(
        [_income(id: 10, day: 20), _fixed(id: 20, day: 3)],
        DateTime(2026, 1, 1),
        months: 1,
      );
      expect(_keys(evs), ['2026-01-03', '2026-01-20']);
    });

    test('string ids sort after int ids and lexicographically among '
        'themselves (documented Dart-only tiebreak)', () {
      // app.js's `(a.itemId||0) - (b.itemId||0)` is NaN for string ids; this
      // port defines a total order instead: ints first, then strings by
      // compareTo.
      final a = CashflowEvent(
        date: DateTime(2026, 1, 5),
        amount: 1,
        itemId: const StringItemId('b'),
        type: ItemType.income,
        title: 'b',
      );
      final b = CashflowEvent(
        date: DateTime(2026, 1, 5),
        amount: 1,
        itemId: const StringItemId('a'),
        type: ItemType.income,
        title: 'a',
      );
      final c = CashflowEvent(
        date: DateTime(2026, 1, 5),
        amount: 1,
        itemId: const IntItemId(99),
        type: ItemType.income,
        title: 'int',
      );
      final list = [a, b, c]..sort(compareCashflowEvents);
      expect(list.map((e) => e.title).toList(), ['int', 'a', 'b']);
      expect(compareCashflowEvents(a, a), 0);
    });
  });

  group('getHomeTotalExpensesForCurrentPeriod', () {
    test('sums only negative events inside the 5th-to-4th period', () {
      // refDate 05.09.2026 => period 05.09.2026 .. 04.10.2026.
      // rangeStartMonth = 01.09.2026, monthsCount = (10-9)+1 = 2 (Sep+Oct).
      final items = <FinanceItem>[
        // Sep 10 (-1000, INSIDE) and Oct 10 (-1000, after periodEnd).
        _fixed(id: 1, amount: 1000, day: 10),
        // Sep 1 / Oct 1 income: positive, and Sep 1 is before periodStart.
        _income(id: 2, amount: 5000, day: 1),
        // Exactly ON periodEnd => inclusive.
        _dated(id: 3, amount: 250.5, start: '2026-10-04'),
        // Day before periodStart => excluded.
        _cash(id: 4, amount: 300, start: '2026-09-04'),
      ];
      final total = getHomeTotalExpensesForCurrentPeriod(
        items,
        refDate: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(total, 1250.5);
    });

    test('boundary: an event exactly on periodStart is included', () {
      final total = getHomeTotalExpensesForCurrentPeriod(
        [_cash(id: 4, amount: 300, start: '2026-09-05')],
        refDate: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(total, 300);
    });

    test('the period is anchored to refDate MONTH, not to "which period '
        'contains today"', () {
      // refDate 02.09.2026 (before the 5th) must still yield 05.09 .. 04.10 —
      // the Version 1.4.7 correction.
      final total = getHomeTotalExpensesForCurrentPeriod(
        [_cash(id: 4, amount: 300, start: '2026-09-20')],
        refDate: DateTime(2026, 9, 2),
        categoryConfig: _cfg,
      );
      expect(total, 300);
    });

    test('the built-in settlement is counted exactly once, and the credit '
        'purchases it settles are not counted at all', () {
      final items = <FinanceItem>[
        _fixed(id: 1, amount: 900, day: 10, where: 'credit'),
        _dated(
          id: 2,
          amount: 4000,
          start: '2026-09-15',
          displayCategory: null,
          rawWhere: 'credit',
        ),
      ];
      final total = getHomeTotalExpensesForCurrentPeriod(
        items,
        refDate: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(total, 4000);
    });

    test('no expenses at all => 0', () {
      expect(
        getHomeTotalExpensesForCurrentPeriod(
          [_income(id: 1, amount: 5000, day: 10)],
          refDate: DateTime(2026, 9, 5),
          categoryConfig: _cfg,
        ),
        0,
      );
    });

    test('spans a year boundary (05.12 .. 04.01)', () {
      // refDate 10.12.2026 => period 05.12.2026 .. 04.01.2027,
      // rangeStartMonth 01.12.2026, monthsCount = (2027-2026)*12 + (1-12) + 1
      //   = 12 - 11 = 2 (Dec + Jan).
      final items = <FinanceItem>[
        _cash(id: 1, amount: 100, start: '2026-12-20'),
        _cash(id: 2, amount: 50, start: '2027-01-03'),
        _cash(id: 3, amount: 999, start: '2027-01-05'), // past periodEnd
      ];
      final total = getHomeTotalExpensesForCurrentPeriod(
        items,
        refDate: DateTime(2026, 12, 10),
        categoryConfig: _cfg,
      );
      expect(total, 150);
    });
  });

  group('getNextCashflowEvent', () {
    test('returns the earliest event STRICTLY after today', () {
      final items = <FinanceItem>[
        _fixed(id: 1, day: 5), // today itself => excluded
        _income(id: 2, amount: 5000, day: 7),
        _fixed(id: 3, day: 10),
      ];
      final next = getNextCashflowEvent(
        items,
        today: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(next, isNotNull);
      expect(cashflowDateKey(next!.date), '2026-09-07');
      expect(next.itemId, const IntItemId(2));
    });

    test('an event ON today is never returned', () {
      final next = getNextCashflowEvent(
        [_cash(id: 1, start: '2026-09-05')],
        today: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(next, isNull);
    });

    test('looks two months ahead so a month boundary is never missed', () {
      // today 28.09.2026 -> window is Sep + Oct; the next event is in Oct.
      final next = getNextCashflowEvent(
        [_cash(id: 1, start: '2026-10-02')],
        today: DateTime(2026, 9, 28),
        categoryConfig: _cfg,
      );
      expect(next, isNotNull);
      expect(cashflowDateKey(next!.date), '2026-10-02');
    });

    test('returns null when nothing is upcoming', () {
      final next = getNextCashflowEvent(
        [_cash(id: 1, start: '2026-09-01')],
        today: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(next, isNull);
    });

    test('the time-of-day of `today` is ignored (date-only comparison)', () {
      final next = getNextCashflowEvent(
        [_cash(id: 1, start: '2026-09-06')],
        today: DateTime(2026, 9, 5, 23, 59, 59),
        categoryConfig: _cfg,
      );
      expect(next, isNotNull);
      expect(cashflowDateKey(next!.date), '2026-09-06');
    });

    test('same-day ties resolve through the shared comparator (income first)',
        () {
      final next = getNextCashflowEvent(
        [_fixed(id: 1, day: 9), _income(id: 2, amount: 5000, day: 9)],
        today: DateTime(2026, 9, 5),
        categoryConfig: _cfg,
      );
      expect(next!.type, ItemType.income);
    });
  });
}
