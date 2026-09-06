import 'package:flutter_test/flutter_test.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/domain/dates/billing_dates.dart';
import 'package:familyfinance_pro/domain/loans/fixed_item_rules.dart';
import 'package:familyfinance_pro/domain/loans/loan_calculations.dart';
import 'package:familyfinance_pro/domain/loans/variable_calculations.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

/// Every expected value in this file is derived from app.js's own source
/// (getLoanRemainingBalance app.js:894-918, getLoansBalanceSummary :920-931,
/// getLoansRemainingSummary :825-837, getLoanBankVsPayrollSplit :636-648,
/// roundLoanSplitForDisplay :669-683, getVariableItemRemainingBalance
/// :848-862, getFixedItemMonthlyFigure :1310-1316, parseDatesAndGetLeft
/// :1180-1208). Non-obvious figures carry their derivation in a comment.

int _idCounter = 0;
ItemId _nextId() => IntItemId(++_idCounter);

LoanItem loan({
  Object? originalAmount,
  required num amount,
  Object? interest,
  Object? day,
  Object? total,
  String? start,
  String? where = 'bank',
  bool isArchived = false,
}) =>
    LoanItem(
      id: _nextId(),
      isArchived: isArchived,
      title: 'loan',
      originalAmount: LegacyNumericField(originalAmount),
      amount: amount,
      where: LegacyStringField(where),
      interest: LegacyNumericField(interest),
      day: LegacyNumericField(day),
      total: LegacyNumericField(total),
      start: start,
    );

VariableItem variable({
  Object? originalAmount,
  required num amount,
  Object? day,
  Object? total,
  String? start,
  String? where,
  bool isArchived = false,
  String? displayCategory = 'variable',
}) =>
    VariableItem(
      id: _nextId(),
      isArchived: isArchived,
      displayCategory: displayCategory,
      title: 'variable',
      originalAmount: LegacyNumericField(originalAmount),
      amount: amount,
      day: LegacyNumericField(day),
      total: LegacyNumericField(total),
      start: start,
      where: LegacyStringField(where),
    );

FixedItem fixed({
  required num amount,
  FixedPeriod period = FixedPeriod.monthly,
  bool bimonthly = false,
  int? bimonthlyStartMonth,
  String? where = 'bank',
}) =>
    FixedItem(
      id: _nextId(),
      isArchived: false,
      title: 'fixed',
      amount: amount,
      day: const LegacyNumericField(1),
      where: LegacyStringField(where),
      period: period,
      bimonthly: bimonthly,
      bimonthlyStartMonth: bimonthlyStartMonth,
    );

void main() {
  // ===========================================================================
  // getLoanRemainingBalance — amortization
  // ===========================================================================
  group('getLoanRemainingBalance — interest branch', () {
    test('amortization recursion matches a hand-derived value', () {
      // Loan: originalAmount 10,000, payment 900, interest 5%/yr, total 12,
      // billing day 10, start 2025-06-10.
      //
      // Schedule (getBillingRange): startDay 10 >= bDay 10, so the first
      // billing month is pushed forward one month -> first billing 2025-07-10,
      // last billing 2026-06-10.
      // On today = 2026-01-10: passedMonths = (2026-2025)*12 + (1-7) = 6, and
      // today's day 10 >= bDay 10 adds one more -> 7 passed. left = 12-7 = 5.
      // elapsed = total - left = 12 - 5 = 7.
      //
      // total  = amount x left = 900 x 5 = 4500.
      // r      = 5 / 100 / 12                 = 0.004166666666666667
      // growth = (1+r)^7                      = 1.0295337924043997
      // principal = P*growth - amount*(growth-1)/r
      //           = 10000 * 1.0295337924043997
      //             - 900 * 0.0295337924043997 / 0.004166666666666667
      //           = 10295.337924043997 - 6379.299159350335
      //           = 3916.038764693665
      // 3916.04 < 4500, so neither the 0-floor nor the amount x left cap
      // applies — this is the pure recursion result.
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 10000,
          amount: 900,
          interest: 5,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.left, 5);
      expect(r.total, 4500);
      expect(r.principal, closeTo(3916.038764693665, 1e-9));
    });

    test('before the first billing date: elapsed 0, principal == '
        'originalAmount', () {
      // Same loan, today = 2025-07-09 — one day BEFORE first billing
      // (2025-07-10). parseDatesAndGetLeft returns the full total, so
      // elapsed = 0, growth = (1+r)^0 = 1 and the recursion collapses to
      // P*1 - amount*(1-1)/r = P exactly. total = 900 x 12 = 10800, and
      // 10000 < 10800 so the cap does not bite.
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 10000,
          amount: 900,
          interest: 5,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2025, 7, 9),
      );
      expect(r.left, 12);
      expect(r.total, 10800);
      expect(r.principal, closeTo(10000, 1e-9));
    });
  });

  group('getLoanRemainingBalance — straight-line (r == 0) branch', () {
    // originalAmount 12,000, payment 1,100, total 12, day 10,
    // start 2025-06-10, today 2026-01-10 -> left 5, elapsed 7 (same schedule
    // derivation as above).
    // total = 1100 x 5 = 5500.
    // principal = 12000 - 1100 x 7 = 12000 - 7700 = 4300 (< 5500, uncapped).
    const expectedPrincipal = 4300.0;

    test('interest explicitly 0', () {
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 12000,
          amount: 1100,
          interest: 0,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.left, 5);
      expect(r.total, 5500);
      expect(r.principal, expectedPrincipal);
    });

    test('interest absent', () {
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 12000,
          amount: 1100,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.principal, expectedPrincipal);
    });

    test('interest non-numeric', () {
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 12000,
          amount: 1100,
          interest: 'abc',
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.principal, expectedPrincipal);
    });

    test('negative interest also takes the straight-line branch (app.js '
        'requires annualRatePct > 0)', () {
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 12000,
          amount: 1100,
          interest: -3,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.principal, expectedPrincipal);
    });
  });

  group('getLoanRemainingBalance — guards', () {
    test('principal is capped at amount x left', () {
      // originalAmount 100,000 against a 500 x 12 schedule: the four fields
      // do not amortize (app.js:886 documents exactly this hand-entry case).
      // Same schedule as above -> left 5, elapsed 7.
      // Raw straight-line principal = 100000 - 500 x 7 = 96,500, which is far
      // more than everything left to pay (500 x 5 = 2500) — impossible for a
      // real loan, so app.js clamps it to the total.
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 100000,
          amount: 500,
          interest: 0,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.total, 2500);
      expect(r.principal, 2500);
    });

    test('the interest branch is capped too', () {
      // app.js's own mock car loan (app.js:587): originalAmount 24,000,
      // amount 890, interest 4.5, day 5, total 24, start 2025-08-05.
      // startDay 5 >= bDay 5 -> first billing 2025-09-05.
      // today 2026-09-05: passedMonths = 12, +1 (day 5 >= 5) = 13,
      // left = 24 - 13 = 11, elapsed = 13. total = 890 x 11 = 9790.
      // r = 0.00375, growth = 1.00375^13 = 1.0498620993844916
      // raw principal = 24000*growth - 890*(growth-1)/r
      //               = 25196.690 - 11833.938 = 13362.75 > 9790 -> capped.
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 24000,
          amount: 890,
          interest: 4.5,
          day: 5,
          total: 24,
          start: '2025-08-05',
        ),
        today: DateTime(2026, 9, 5),
      );
      expect(r.left, 11);
      expect(r.total, 9790);
      expect(r.principal, 9790);
    });

    test('principal is floored at 0 when it would go negative', () {
      // originalAmount 1,000 against 1,000 x 12 payments: after 7 elapsed
      // payments the straight-line principal would be 1000 - 7000 = -6000.
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 1000,
          amount: 1000,
          interest: 0,
          day: 10,
          total: 12,
          start: '2025-06-10',
        ),
        today: DateTime(2026, 1, 10),
      );
      expect(r.total, 5000);
      expect(r.principal, 0);
    });

    test('left <= 0 short-circuits to principal 0 (app.js line 899)', () {
      final r = getLoanRemainingBalance(
        loan(
          originalAmount: 6000,
          amount: 500,
          interest: 6,
          day: 10,
          total: 12,
          start: '2020-02-10',
        ),
        today: DateTime(2026, 9, 5),
      );
      expect(r.left, 0);
      expect(r.total, 0);
      expect(r.principal, 0);
    });

    test('missing/zero/non-numeric total short-circuits to principal 0', () {
      for (final badTotal in <Object?>[null, 0, 'abc', -4]) {
        final r = getLoanRemainingBalance(
          loan(
            originalAmount: 6000,
            amount: 500,
            interest: 6,
            day: 10,
            total: badTotal,
            start: '2025-06-10',
          ),
          today: DateTime(2026, 1, 10),
        );
        expect(r.principal, 0, reason: 'total=$badTotal');
      }
    });
  });

  // ===========================================================================
  // The VERIFIED loan-only originalAmount -> 0 fallback (app.js:902)
  // ===========================================================================
  group('originalAmount -> 0 fallback is loan-specific (app.js:902)', () {
    // app.js:902 verbatim:
    //   var originalAmount = (typeof it.originalAmount === 'number' &&
    //     !isNaN(it.originalAmount)) ? it.originalAmount : 0;
    // With originalAmount resolved to 0 the recursion yields
    //   0*growth - amount*(growth-1)/r   (interest branch), or
    //   0 - amount*elapsed               (straight-line branch),
    // both strictly negative for a positive amount+elapsed, so the 0-floor
    // then applies: principal is 0 while `total` stays the real amount x left.
    for (final missing in <Object?>[null, 'not a number', true]) {
      test('loan with originalAmount=$missing is treated as 0 (interest '
          'branch)', () {
        final r = getLoanRemainingBalance(
          loan(
            originalAmount: missing,
            amount: 890,
            interest: 4.5,
            day: 5,
            total: 24,
            start: '2025-08-05',
          ),
          today: DateTime(2026, 9, 5),
        );
        expect(r.left, 11);
        expect(r.total, 9790, reason: 'total must be unaffected');
        expect(r.principal, 0);
      });

      test('loan with originalAmount=$missing is treated as 0 (straight-line '
          'branch)', () {
        final r = getLoanRemainingBalance(
          loan(
            originalAmount: missing,
            amount: 1100,
            interest: 0,
            day: 10,
            total: 12,
            start: '2025-06-10',
          ),
          today: DateTime(2026, 1, 10),
        );
        expect(r.total, 5500);
        expect(r.principal, 0);
      });
    }

    test('the fallback is applied at the call site only — the model keeps the '
        'raw value untouched', () {
      final l = loan(
        amount: 890,
        interest: 4.5,
        day: 5,
        total: 24,
        start: '2025-08-05',
      );
      getLoanRemainingBalance(l, today: DateTime(2026, 9, 5));
      expect(l.originalAmount.raw, isNull);
      expect(l.originalAmount.asNum(), isNull);
    });

    test('a VARIABLE item with a missing originalAmount never receives the '
        '0-fallback (it is never read at all)', () {
      // There is NO verified originalAmount fallback for variable items
      // anywhere in app.js — originalAmount is read only for edit-form
      // pre-fill. The remaining balance is amount x left, computed identically
      // whether originalAmount is present or absent.
      final withOriginal = variable(
        originalAmount: 3500,
        amount: 350,
        day: 5,
        total: 10,
        start: '2025-06-05',
      );
      final withoutOriginal = variable(
        amount: 350,
        day: 5,
        total: 10,
        start: '2025-06-05',
      );
      final a = getVariableItemRemainingBalance(
        withOriginal,
        categoryConfig: kDefaultCategoryConfig,
        today: DateTime(2026, 1, 10),
      );
      final b = getVariableItemRemainingBalance(
        withoutOriginal,
        categoryConfig: kDefaultCategoryConfig,
        today: DateTime(2026, 1, 10),
      );
      expect(a.total, b.total);
      expect(a.left, b.left);
      // The raw field must remain unresolved — no 0, no coercion.
      expect(withoutOriginal.originalAmount.raw, isNull);
      expect(withoutOriginal.originalAmount.asNum(), isNull);
      // And the present one must be untouched too.
      expect(withOriginal.originalAmount.raw, 3500);
    });
  });

  // ===========================================================================
  // Loan aggregates
  // ===========================================================================
  group('getLoansBalanceSummary / getLoansRemainingSummary', () {
    // Loan A: the straight-line case above  -> total 5500, principal 4300,
    //         left 5.
    // Loan B: the floored case above        -> total 5000, principal 0,
    //         left 5.
    // Loan C: fully paid (left 0)           -> total 0, principal 0.
    // Loan D: archived — excluded entirely.
    final loanA = loan(
      originalAmount: 12000,
      amount: 1100,
      interest: 0,
      day: 10,
      total: 12,
      start: '2025-06-10',
    );
    final loanB = loan(
      originalAmount: 1000,
      amount: 1000,
      interest: 0,
      day: 10,
      total: 12,
      start: '2025-06-10',
    );
    final loanC = loan(
      originalAmount: 6000,
      amount: 500,
      interest: 6,
      day: 10,
      total: 12,
      start: '2020-02-10',
    );
    final loanD = loan(
      originalAmount: 50000,
      amount: 2000,
      interest: 0,
      day: 10,
      total: 12,
      start: '2025-06-10',
      isArchived: true,
    );
    final nonLoan = fixed(amount: 999);
    final today = DateTime(2026, 1, 10);
    final items = <FinanceItem>[loanA, loanB, loanC, loanD, nonLoan];

    test('summary aggregates only active loans', () {
      final s = getLoansBalanceSummary(items, today: today);
      expect(s.total, 5500 + 5000 + 0);
      expect(s.principal, 4300 + 0 + 0);
    });

    test('getLoansRemainingSummary.totalRemaining equals '
        'getLoansBalanceSummary.total by construction (app.js:866)', () {
      final r = getLoansRemainingSummary(items, today: today);
      final s = getLoansBalanceSummary(items, today: today);
      expect(r.totalRemaining, s.total);
      // loanCount counts loans with left > 0 only — loanC (left 0) excluded.
      expect(r.loanCount, 2);
    });

    test('empty input yields zeros, not nulls', () {
      final s = getLoansBalanceSummary(const <FinanceItem>[], today: today);
      expect(s.total, 0);
      expect(s.principal, 0);
      final r = getLoansRemainingSummary(const <FinanceItem>[], today: today);
      expect(r.totalRemaining, 0);
      expect(r.loanCount, 0);
    });
  });

  group('getLoanBankVsPayrollSplit', () {
    final today = DateTime(2026, 1, 10);

    test('splits active loans by source and ignores inactive/archived', () {
      final bankLoan = loan(
        amount: 1100,
        total: 12,
        day: 10,
        start: '2025-06-10',
      );
      final payrollLoan = loan(
        amount: 700,
        total: 12,
        day: 10,
        start: '2025-06-10',
        where: 'דרך תלוש השכר',
      );
      final finished = loan(
        amount: 5000,
        total: 12,
        day: 10,
        start: '2020-02-10',
      );
      final archived = loan(
        amount: 4000,
        total: 12,
        day: 10,
        start: '2025-06-10',
        isArchived: true,
      );
      final s = getLoanBankVsPayrollSplit(
        <FinanceItem>[bankLoan, payrollLoan, finished, archived],
        today: today,
      );
      expect(s.bank, 1100);
      expect(s.payroll, 700);
    });

    test('a payroll loan is still SHOWN in the split (it is only excluded '
        'from bank cash flow, elsewhere)', () {
      final payrollLoan = loan(
        amount: 700,
        total: 12,
        day: 10,
        start: '2025-06-10',
        where: 'דרך תלוש השכר',
      );
      final s = getLoanBankVsPayrollSplit(
        <FinanceItem>[payrollLoan],
        today: today,
      );
      expect(s.bank, 0);
      expect(s.payroll, 700);
    });
  });

  // ===========================================================================
  // roundLoanSplitForDisplay
  // ===========================================================================
  group('roundLoanSplitForDisplay', () {
    test('app.js worked example: naive rounding would break the sum', () {
      // app.js:653 states this case explicitly: bank=3990.5, payroll=2791.5
      // -> real total 6782.0 exactly, which rounds to 6782, but naive
      // Math.round(3990.5)=3991 plus Math.round(2791.5)=2792 sums to 6783.
      final d = roundLoanSplitForDisplay(3990.5, 2791.5);
      expect(d.total, 6782);
      expect(d.bank + d.payroll, d.total);
      // Exact tie on the fractional part -> bank (listed first) wins.
      expect(d.bank, 3991);
      expect(d.payroll, 2791);
      // Prove the naive alternative really would have been wrong.
      expect(3990.5.round() + 2791.5.round(), 6783);
    });

    test('naive flooring would under-count: 100.4 + 200.4', () {
      // real total 300.8 -> 301; floors 100 + 200 = 300; remainder 1;
      // fracs tie at 0.4 -> bank gets the shekel.
      final d = roundLoanSplitForDisplay(100.4, 200.4);
      expect(d.total, 301);
      expect(d.bank, 101);
      expect(d.payroll, 200);
      expect(d.bank + d.payroll, d.total);
    });

    test('larger remainder goes to payroll when its fraction is larger', () {
      // 10.2 + 20.9 = 31.1 -> 31; floors 10 + 20 = 30; remainder 1;
      // payroll frac 0.9 > bank frac 0.2 -> payroll gets it.
      final d = roundLoanSplitForDisplay(10.2, 20.9);
      expect(d.total, 31);
      expect(d.bank, 10);
      expect(d.payroll, 21);
    });

    test('and to bank when bank has the larger fraction', () {
      final d = roundLoanSplitForDisplay(10.9, 20.2);
      expect(d.total, 31);
      expect(d.bank, 11);
      expect(d.payroll, 20);
    });

    test('a shortfall of 2 gives both parts a shekel', () {
      // 0.6 + 0.6 = 1.2 -> 1; floors 0 + 0 = 0; remainder 1 -> only ONE
      // shekel is distributed, to bank (tie). Naive rounding gives 1 + 1 = 2.
      final d = roundLoanSplitForDisplay(0.6, 0.6);
      expect(d.total, 1);
      expect(d.bank, 1);
      expect(d.payroll, 0);
      // The genuine "remainder == 2" shape: 0.9 + 0.9 = 1.8 -> 2, floors 0+0.
      final e = roundLoanSplitForDisplay(0.9, 0.9);
      expect(e.total, 2);
      expect(e.bank, 1);
      expect(e.payroll, 1);
    });

    test('already-integer inputs are untouched', () {
      final d = roundLoanSplitForDisplay(1000, 0);
      expect(d.bank, 1000);
      expect(d.payroll, 0);
      expect(d.total, 1000);
      final z = roundLoanSplitForDisplay(0, 0);
      expect(z.bank, 0);
      expect(z.payroll, 0);
      expect(z.total, 0);
    });

    test('the two lines always sum to the displayed total (property check)',
        () {
      const samples = <double>[
        0, 0.1, 0.5, 0.49, 0.51, 1.25, 3990.5, 2791.5, 1234.567, 89.433, 12.999,
      ];
      for (final b in samples) {
        for (final p in samples) {
          final d = roundLoanSplitForDisplay(b, p);
          expect(
            d.bank + d.payroll,
            d.total,
            reason: 'bank=$b payroll=$p',
          );
        }
      }
    });
  });

  // ===========================================================================
  // Variable remaining balance
  // ===========================================================================
  group('getVariableItemRemainingBalance / getVariableRemainingBalance', () {
    final today = DateTime(2026, 1, 10);

    test('amount x payments left', () {
      // day 5, start 2025-06-05: startDay 5 >= bDay 5 -> first billing
      // 2025-07-05, total 10 -> last billing 2026-04-05.
      // today 2026-01-10: passedMonths = (2026-2025)*12 + (1-7) = 6, and
      // day 10 >= 5 -> 7. left = 10 - 7 = 3. total = 350 x 3 = 1050.
      final v = getVariableItemRemainingBalance(
        variable(amount: 350, day: 5, total: 10, start: '2025-06-05'),
        categoryConfig: kDefaultCategoryConfig,
        today: today,
      );
      expect(v.left, 3);
      expect(v.total, 1050);
    });

    test('a missing day falls back through resolveEffectiveDay to the '
        "category default, then 1 (loans do NOT do this)", () {
      final cfgWithDefault = <String, CategoryConfig>{
        ...kDefaultCategoryConfig,
        'variable': const CategoryConfig(
          key: 'variable',
          label: 'v',
          baseType: CategoryBaseType.variable,
          defaultDayOfMonth: 20,
        ),
      };
      final item = variable(amount: 100, total: 6, start: '2025-11-15');
      // With defaultDayOfMonth 20: startDay 15 >= 20 is false -> first billing
      // 2025-11-20, last billing 2026-04-20.
      // today 2026-01-10: passedMonths = 2 (Nov->Jan), day 10 >= 20 false.
      // left = 6 - 2 = 4.
      final withDefault = getVariableItemRemainingBalance(
        item,
        categoryConfig: cfgWithDefault,
        today: today,
      );
      expect(withDefault.left, 4);
      expect(withDefault.total, 400);

      // With no category default the resolver falls back to day 1:
      // startDay 15 >= 1 -> first billing 2025-12-01, last 2026-05-01.
      // today 2026-01-10: passedMonths = 1, day 10 >= 1 -> 2. left = 6-2 = 4.
      final withoutDefault = getVariableItemRemainingBalance(
        item,
        categoryConfig: kDefaultCategoryConfig,
        today: today,
      );
      expect(withoutDefault.left, 4);
    });

    test('payment method never affects the remaining balance', () {
      // Raw stored values now, including an unrecognized legacy string —
      // none of them may change the remaining-balance figure.
      for (final w in <String?>[null, 'bank', 'credit', 'כרטיס אשראי']) {
        final v = getVariableItemRemainingBalance(
          variable(
            amount: 350,
            day: 5,
            total: 10,
            start: '2025-06-05',
            where: w,
          ),
          categoryConfig: kDefaultCategoryConfig,
          today: today,
        );
        expect(v.total, 1050, reason: 'where=$w');
      }
    });

    test('a legacy variable item keeps a null payment method (never bank)',
        () {
      final legacy = variable(
        amount: 350,
        day: 5,
        total: 10,
        start: '2025-06-05',
      );
      getVariableItemRemainingBalance(
        legacy,
        categoryConfig: kDefaultCategoryConfig,
        today: today,
      );
      expect(legacy.paymentMethod, isNull);
    });

    test('aggregate skips archived items and non-variable types', () {
      final active = variable(
        amount: 350,
        day: 5,
        total: 10,
        start: '2025-06-05',
      );
      final archived = variable(
        amount: 1000,
        day: 5,
        total: 10,
        start: '2025-06-05',
        isArchived: true,
      );
      final aLoan = loan(
        amount: 1100,
        total: 12,
        day: 10,
        start: '2025-06-10',
      );
      final total = getVariableRemainingBalance(
        <FinanceItem>[active, archived, aLoan],
        categoryConfig: kDefaultCategoryConfig,
        today: today,
      );
      expect(total, 1050);
    });
  });

  // ===========================================================================
  // getFixedItemMonthlyFigure
  // ===========================================================================
  group('getFixedItemMonthlyFigure', () {
    final anyMonth = DateTime(2026, 4, 15);

    test('monthly period returns the full amount', () {
      expect(getFixedItemMonthlyFigure(fixed(amount: 3000), anyMonth), 3000);
    });

    test('yearly period smooths to amount / 12', () {
      expect(
        getFixedItemMonthlyFigure(
          fixed(amount: 1200, period: FixedPeriod.yearly),
          anyMonth,
        ),
        100,
      );
      // Not rounded — app.js does not round here either.
      expect(
        getFixedItemMonthlyFigure(
          fixed(amount: 1000, period: FixedPeriod.yearly),
          anyMonth,
        ),
        closeTo(83.33333333333333, 1e-9),
      );
    });

    test('bimonthly returns the FULL amount in a parity-matching month and '
        'ZERO otherwise — deliberately NOT smoothed', () {
      // A September (9, odd) start recurs Sep/Nov/Jan/Mar/... — parity match.
      final item = fixed(amount: 500, bimonthly: true, bimonthlyStartMonth: 9);
      for (final activeMonth in [1, 3, 5, 7, 9, 11]) {
        expect(
          getFixedItemMonthlyFigure(item, DateTime(2026, activeMonth, 15)),
          500,
          reason: 'month $activeMonth must be active',
        );
      }
      for (final inactiveMonth in [2, 4, 6, 8, 10, 12]) {
        expect(
          getFixedItemMonthlyFigure(item, DateTime(2026, inactiveMonth, 15)),
          0,
          reason: 'month $inactiveMonth must be inactive',
        );
      }
      // Explicitly NOT the smoothed 250.
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 9, 1)), isNot(250));
    });

    test('bimonthly parity is year-agnostic', () {
      final item = fixed(amount: 500, bimonthly: true, bimonthlyStartMonth: 2);
      for (final year in [2024, 2025, 2026, 2027]) {
        expect(getFixedItemMonthlyFigure(item, DateTime(year, 2, 1)), 500);
        expect(getFixedItemMonthlyFigure(item, DateTime(year, 3, 1)), 0);
      }
    });

    test('bimonthly overrides the yearly period entirely', () {
      final item = fixed(
        amount: 1200,
        period: FixedPeriod.yearly,
        bimonthly: true,
        bimonthlyStartMonth: 3,
      );
      // March (odd) is active -> full 1200, NOT 1200/12.
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 3, 1)), 1200);
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 4, 1)), 0);
    });

    test('bimonthly:false falls back to the period-based behavior even with a '
        'start month present', () {
      final item = fixed(
        amount: 600,
        period: FixedPeriod.yearly,
        bimonthlyStartMonth: 3,
      );
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 4, 1)), 50);
    });

    test('bimonthly:true with a null start month falls back to month 1, '
        'mirroring resolveFixedBimonthlyStartMonth()', () {
      final item = fixed(amount: 700, bimonthly: true);
      // Start month 1 (odd) -> odd months active.
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 1, 1)), 700);
      expect(getFixedItemMonthlyFigure(item, DateTime(2026, 2, 1)), 0);
    });

    test('the payment method does not affect the monthly figure', () {
      expect(
        getFixedItemMonthlyFigure(
          fixed(amount: 200, where: 'credit'),
          anyMonth,
        ),
        200,
      );
    });
  });

  // ===========================================================================
  // parseDatesAndGetLeft-driven "payments left" edges, exercised through the
  // loan/variable rules that consume them.
  // ===========================================================================
  group('payments-left edge cases (via getLoanRemainingBalance)', () {
    // Schedule: start 2026-01-15, total 6, billing day 20.
    // startDay 15 >= bDay 20 is FALSE, so the first billing month is NOT
    // pushed forward -> first billing 2026-01-20, last billing 2026-06-20.
    LoanRemainingBalance at(DateTime today) => getLoanRemainingBalance(
          loan(
            originalAmount: 6000,
            amount: 1000,
            interest: 0,
            day: 20,
            total: 6,
            start: '2026-01-15',
          ),
          today: today,
        );

    test('the day before the first billing date: all payments remain', () {
      expect(at(DateTime(2026, 1, 19)).left, 6);
    });

    test('ON the billing day the current month already counts as taken', () {
      expect(at(DateTime(2026, 1, 20)).left, 5);
    });

    test('on the LAST billing date the schedule is exhausted', () {
      // passedMonths = 5 (Jan->Jun), +1 because day 20 >= 20 -> 6.
      expect(at(DateTime(2026, 6, 20)).left, 0);
    });

    test('after the range ends, left clamps at 0 (never negative)', () {
      expect(at(DateTime(2026, 7, 1)).left, 0);
      expect(at(DateTime(2030, 1, 1)).left, 0);
    });

    test('long before the start, left clamps at total (never above)', () {
      expect(at(DateTime(2020, 1, 1)).left, 6);
    });

    test('a missing start date yields left 0 and a 0 total', () {
      final r = getLoanRemainingBalance(
        loan(originalAmount: 6000, amount: 1000, day: 20, total: 6),
        today: DateTime(2026, 3, 1),
      );
      expect(r.left, 0);
      expect(r.total, 0);
      expect(r.principal, 0);
    });
  });

  group('month-end clamp and leap year (stored day is never mutated)', () {
    LoanItem jan31Loan() => loan(
          originalAmount: 3000,
          amount: 1000,
          interest: 0,
          day: 31,
          total: 3,
          start: '2026-01-31',
        );

    test('a 31st billing day clamps to Feb 28 in a non-leap year — but the '
        'clamped date is NOT the billing-day comparison', () {
      // startDay 31 >= bDay 31 -> first billing month = February.
      // getClampedBillingDate(2026, 2, 31) -> 2026-02-28 (clamped).
      // On today 2026-02-28: todayZero is NOT before first (they are equal),
      // so passedMonths = 0; the "current month already billed" bump compares
      // todayZero.day (28) against range.bDay (31, the STORED day, unclamped)
      // -> 28 >= 31 is false, so nothing is added. left stays 3.
      // This is app.js's own behavior verbatim (app.js:1199 compares against
      // range.bDay, not against the clamped date) and is reproduced, not
      // "fixed".
      expect(at31(jan31Loan(), DateTime(2026, 2, 28)), 3);
      // A day later, still February? There is none — March 31 exists, so the
      // bump fires there: passedMonths = 1, +1 -> 2, left = 1.
      expect(at31(jan31Loan(), DateTime(2026, 3, 31)), 1);
    });

    test('leap year: a 31st billing day clamps to Feb 29 in 2024', () {
      final l = loan(
        originalAmount: 2000,
        amount: 1000,
        interest: 0,
        day: 31,
        total: 2,
        start: '2024-01-31',
      );
      final range = getBillingRange('2024-01-31', 2, 31)!;
      expect(range.first, DateTime(2024, 2, 29));
      expect(range.last, DateTime(2024, 3, 31));
      // Same stored-vs-clamped-day rule as above: on 2024-02-29, 29 >= 31 is
      // false, so left is still the full 2.
      expect(at31(l, DateTime(2024, 2, 29)), 2);
      expect(at31(l, DateTime(2024, 3, 31)), 0);
    });

    test('the stored billing day itself is never mutated by any of this', () {
      final l = jan31Loan();
      getLoanRemainingBalance(l, today: DateTime(2026, 3, 31));
      expect(l.day.raw, 31);
      expect(l.start, '2026-01-31');
      expect(l.total.raw, 3);
    });

    test('a 31st billing day in a 30-day month clamps to the 30th', () {
      // start 2026-03-31, bDay 31 -> first billing month April ->
      // getClampedBillingDate(2026, 4, 31) = 2026-04-30.
      final range = getBillingRange('2026-03-31', 2, 31)!;
      expect(range.first, DateTime(2026, 4, 30));
      expect(range.last, DateTime(2026, 5, 31));
    });
  });
}

/// Small helper: `left` for a loan at a given date.
int at31(LoanItem l, DateTime today) =>
    getLoanRemainingBalance(l, today: today).left;
