import 'dart:math' as math;

import '../dates/billing_dates.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';

/// Loan business rules ported 1:1 from app.js.
///
/// PARITY NOTE: every figure below is deliberately UNROUNDED — app.js applies
/// no rounding inside these calculations (rounding happens later, in
/// formatHomeCurrency()/[roundLoanSplitForDisplay], i.e. at display time
/// only). Do not add round2() here; it would silently change stored-value
/// arithmetic that the Web app performs at full double precision.
///
/// DETERMINISM NOTE: app.js reads `new Date()` inside parseDatesAndGetLeft().
/// Every function here takes `today` as an injected parameter instead, so the
/// same call is reproducible in tests. Callers must pass the real clock value
/// to reproduce live behavior.
///
/// BILLING-DAY NOTE: app.js's loan paths pass `it.day` RAW into
/// parseDatesAndGetLeft() (app.js:641, 831, 895) — they do NOT route it
/// through resolveEffectiveDay(), unlike the variable-item paths. That
/// asymmetry is reproduced exactly here (see variable_calculations.dart for
/// the variable side).

/// Per-loan result of [getLoanRemainingBalance].
///
/// [principal] is "קרן בלבד" (outstanding principal), [total] is
/// "קרן + ריבית" (everything still scheduled to be paid = amount x left).
class LoanRemainingBalance {
  final double principal;
  final double total;
  final int left;

  const LoanRemainingBalance({
    required this.principal,
    required this.total,
    required this.left,
  });

  @override
  String toString() =>
      'LoanRemainingBalance(principal: $principal, total: $total, left: $left)';
}

/// `getLoanRemainingBalance(it)` — app.js:894-918.
///
/// `total` is the same `amount x left` accumulation
/// getLoansRemainingSummary().totalRemaining uses. `principal` is the standard
/// fixed-payment amortization recursion
///
///   B_k = P*(1+r)^k - amount*[(1+r)^k - 1] / r
///
/// where P = originalAmount, r = interest/100/12 (annual percent -> monthly
/// rate) and k = elapsed payments (total - left). A loan with no/zero/
/// non-numeric interest (r == 0) falls back to straight-line reduction,
/// P - amount*k.
///
/// VERIFIED (app.js:902):
/// `var originalAmount = (typeof it.originalAmount === 'number' &&
///  !isNaN(it.originalAmount)) ? it.originalAmount : 0;`
/// This is the ONLY place in app.js that resolves originalAmount for a
/// calculation, and it resolves a missing/malformed value to **0** — not to
/// `amount`, and not to anything else. The fallback is applied HERE, at the
/// call site, exactly as app.js does. It is loan-specific and must never leak
/// into variable-item logic, which has no verified fallback at all.
///
/// TYPE CHECK IS EXACT: app.js tests `typeof === 'number'`, which REJECTS a
/// numeric string (`originalAmount: "24000"` resolves to 0, not 24000). This
/// port therefore inspects `raw is num` rather than using
/// [LegacyNumericField.asNum] (which would accept "24000"). Reaching past the
/// abstraction into `raw` is deliberate here: `asNum`'s permissive parse is
/// the right default for fields app.js itself parses permissively, but this
/// one call site is explicitly strict in the live app, and a milestone whose
/// purpose is parity should not soften it.
///
/// Both guards from app.js are reproduced verbatim:
///  - `if (remainingPrincipal < 0) remainingPrincipal = 0;` — a loan whose
///    recorded payments already exceed the original amount floors at 0.
///  - `if (remainingPrincipal > loanTotalRemaining) remainingPrincipal =
///    loanTotalRemaining;` — the safety cap added after review: amount /
///    originalAmount / interest / total are 4 independently hand-entered,
///    cross-unvalidated fields, so the recursion can legitimately produce a
///    "קרן" larger than everything left to pay. Principal can never exceed
///    principal+interest, by definition.
LoanRemainingBalance getLoanRemainingBalance(
  LoanItem item, {
  required DateTime today,
}) {
  // app.js: parseDatesAndGetLeft(it.start, it.total, it.day) — raw day.
  final dt = parseDatesAndGetLeft(
    item.start,
    item.total.raw,
    item.day.raw,
    today: today,
  );
  final loanTotalRemaining = (item.amount * dt.left).toDouble();

  // app.js: `var n = parseInt(it.total, 10); if (!n || n <= 0 || dt.left <= 0)`
  // — JS `!n` is true for NaN and 0 alike; asInt() returns null where parseInt
  // would return NaN.
  final n = item.total.asInt();
  if (n == null || n <= 0 || dt.left <= 0) {
    return LoanRemainingBalance(
      principal: 0,
      total: loanTotalRemaining,
      left: dt.left,
    );
  }

  // Exact port of `(typeof x === 'number' && !isNaN(x)) ? x : 0`.
  final rawOriginal = item.originalAmount.raw;
  final num originalAmount =
      (rawOriginal is num && !rawOriginal.isNaN) ? rawOriginal : 0;

  var elapsed = n - dt.left;
  if (elapsed < 0) elapsed = 0;

  // app.js: `parseFloat(it.interest)`, then
  // `(isFinite(annualRatePct) && annualRatePct > 0) ? pct/100/12 : 0`.
  final annualRatePct = item.interest.asNum();
  final monthlyRate =
      (annualRatePct != null && annualRatePct.isFinite && annualRatePct > 0)
          ? annualRatePct / 100 / 12
          : 0.0;

  double remainingPrincipal;
  if (monthlyRate > 0) {
    final growth = _pow(1 + monthlyRate, elapsed);
    remainingPrincipal =
        originalAmount * growth - item.amount * (growth - 1) / monthlyRate;
  } else {
    remainingPrincipal = (originalAmount - item.amount * elapsed).toDouble();
  }
  if (remainingPrincipal < 0) remainingPrincipal = 0;
  if (remainingPrincipal > loanTotalRemaining) {
    remainingPrincipal = loanTotalRemaining;
  }

  return LoanRemainingBalance(
    principal: remainingPrincipal,
    total: loanTotalRemaining,
    left: dt.left,
  );
}

/// `Math.pow(base, exponent)`.
///
/// `dart:math`'s `pow()` is used rather than a hand-rolled repeated-
/// multiplication loop so the floating-point result matches JS `Math.pow` as
/// closely as the platform allows (both ultimately delegate to the C
/// library's `pow`). Last-bit differences remain possible in principle, which
/// is why the tests assert amortization results with a tolerance rather than
/// exact equality.
double _pow(double base, int exponent) => math.pow(base, exponent).toDouble();

/// Aggregate of [getLoansBalanceSummary] across every active loan.
class LoansBalanceSummary {
  final double principal;
  final double total;

  const LoansBalanceSummary({required this.principal, required this.total});

  @override
  String toString() =>
      'LoansBalanceSummary(principal: $principal, total: $total)';
}

/// `getLoansBalanceSummary(items)` — app.js:920-931. Accumulates
/// [getLoanRemainingBalance] over every non-archived loan; every other item
/// type is skipped entirely.
LoansBalanceSummary getLoansBalanceSummary(
  Iterable<FinanceItem> items, {
  required DateTime today,
}) {
  var principal = 0.0;
  var total = 0.0;
  for (final item in items) {
    if (item is! LoanItem || item.isArchived) continue;
    final b = getLoanRemainingBalance(item, today: today);
    principal += b.principal;
    total += b.total;
  }
  return LoansBalanceSummary(principal: principal, total: total);
}

/// Aggregate of [getLoansRemainingSummary].
class LoansRemainingSummary {
  final double totalRemaining;
  final int loanCount;

  const LoansRemainingSummary({
    required this.totalRemaining,
    required this.loanCount,
  });

  @override
  String toString() =>
      'LoansRemainingSummary(totalRemaining: $totalRemaining, '
      'loanCount: $loanCount)';
}

/// `getLoansRemainingSummary(items)` — app.js:825-837.
///
/// [totalRemaining] accumulates `amount x left` UNCONDITIONALLY (a fully-paid
/// loan simply contributes 0); [loanCount] counts only loans with
/// `left > 0`. Note this is the same figure as
/// [LoansBalanceSummary.total] by construction — app.js says so explicitly
/// (app.js:866) — but both are ported because both are live call sites
/// (buildNarrative / the "יתרת הלוואות" stat tile).
LoansRemainingSummary getLoansRemainingSummary(
  Iterable<FinanceItem> items, {
  required DateTime today,
}) {
  var totalRemaining = 0.0;
  var loanCount = 0;
  for (final item in items) {
    if (item is! LoanItem || item.isArchived) continue;
    final dt = parseDatesAndGetLeft(
      item.start,
      item.total.raw,
      item.day.raw,
      today: today,
    );
    totalRemaining += item.amount * dt.left;
    if (dt.left > 0) loanCount++;
  }
  return LoansRemainingSummary(
    totalRemaining: totalRemaining,
    loanCount: loanCount,
  );
}

/// Real (unrounded) bank/payroll split of this month's loan payments.
class LoanSourceSplit {
  final double bank;
  final double payroll;

  const LoanSourceSplit({required this.bank, required this.payroll});

  @override
  String toString() => 'LoanSourceSplit(bank: $bank, payroll: $payroll)';
}

/// `getLoanBankVsPayrollSplit(items)` — app.js:636-648.
///
/// The SAME "active this month" condition (`left > 0`) and the SAME raw
/// `item.amount` the loan tile's own total uses, just split by
/// resolveLoanSource() — so bank + payroll always sums to exactly that
/// total, by construction, never a second independent calculation.
///
/// [LoanSource.payroll] loans are separated here (not dropped): the Home tile
/// still SHOWS them. It is the bank-cash-flow paths (getMonthSnapshot /
/// generateCashflowEvents, both owned elsewhere) that exclude payroll loans,
/// because the salary already entered is net of payroll deductions.
LoanSourceSplit getLoanBankVsPayrollSplit(
  Iterable<FinanceItem> items, {
  required DateTime today,
}) {
  var bank = 0.0;
  var payroll = 0.0;
  for (final item in items) {
    if (item is! LoanItem || item.isArchived) continue;
    final dt = parseDatesAndGetLeft(
      item.start,
      item.total.raw,
      item.day.raw,
      today: today,
    );
    if (dt.left > 0) {
      if (item.source == LoanSource.payroll) {
        payroll += item.amount;
      } else {
        bank += item.amount;
      }
    }
  }
  return LoanSourceSplit(bank: bank, payroll: payroll);
}

/// DISPLAY-ONLY integers produced by [roundLoanSplitForDisplay].
class LoanSplitDisplay {
  final int bank;
  final int payroll;
  final int total;

  const LoanSplitDisplay({
    required this.bank,
    required this.payroll,
    required this.total,
  });

  @override
  String toString() =>
      'LoanSplitDisplay(bank: $bank, payroll: $payroll, total: $total)';
}

/// `roundLoanSplitForDisplay(bank, payroll)` — app.js:669-683.
///
/// DISPLAY ONLY. Never touches the underlying real numbers, stored data, or
/// either calculation — it only decides which INTEGER to show for each of the
/// two breakdown lines, guaranteeing they always sum to exactly
/// `Math.round(bank + payroll)`. Rounding is not distributive over addition
/// (the app.js worked example: bank=3990.5, payroll=2791.5 -> real total
/// 6782 exactly, but naive rounding of each part gives 3991 + 2792 = 6783).
///
/// Classical largest-remainder (Hamilton) apportionment: floor both parts,
/// then hand the integer shortfall out one shekel at a time to whichever part
/// has the LARGER fractional remainder, bank first on an exact tie.
///
/// TIE-BREAK PARITY: app.js relies on `Array.prototype.sort` being stable
/// (guaranteed since ES2019) with a descending `y.frac - x.frac` comparator,
/// so an exact tie keeps bank (listed first) ahead of payroll. Dart's
/// `List.sort` is NOT stable, so the two-element ordering is written out
/// explicitly here instead of sorting — same outcome, no reliance on sort
/// stability.
LoanSplitDisplay roundLoanSplitForDisplay(num bank, num payroll) {
  final floorBank = bank.floor();
  final floorPayroll = payroll.floor();
  final roundedTotal = _jsMathRound((bank + payroll).toDouble());
  final remainder = roundedTotal - (floorBank + floorPayroll);

  final bankFrac = bank - floorBank;
  final payrollFrac = payroll - floorPayroll;
  // Descending by frac; bank wins an exact tie (stable-sort equivalence).
  final orderedKeys =
      payrollFrac > bankFrac ? const [false, true] : const [true, false];

  var displayBank = floorBank;
  var displayPayroll = floorPayroll;
  for (var i = 0; i < orderedKeys.length && i < remainder; i++) {
    if (orderedKeys[i]) {
      displayBank++;
    } else {
      displayPayroll++;
    }
  }
  return LoanSplitDisplay(
    bank: displayBank,
    payroll: displayPayroll,
    total: roundedTotal,
  );
}

/// JS `Math.round(x)` — rounds a .5 tie towards POSITIVE INFINITY
/// (`Math.round(-2.5) === -2`). Dart's `num.round()` rounds a tie AWAY FROM
/// ZERO (`(-2.5).round() == -3`), so it is NOT a drop-in substitute for a
/// value that can be negative.
///
/// Implemented as the ES spec's `floor(x + 0.5)`, with the spec's own
/// correction for the case where `x + 0.5` rounds UP in binary floating point
/// and would otherwise over-round (the classic
/// `Math.round(0.49999999999999994) === 0`).
int _jsMathRound(double x) {
  final f = (x + 0.5).floorToDouble();
  return (f - x > 0.5) ? (f - 1).toInt() : f.toInt();
}
