import '../dates/billing_dates.dart';
import '../loans/fixed_item_rules.dart';
import '../models/category_config.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';
import '../normalization/legacy_resolvers.dart';
import 'cashflow_engine.dart';

/// Two small Home-screen aggregates that were not yet ported as their own
/// functions (app.js's `getMonthSnapshot().income` and the "תשלומים החודש"
/// variable-category tile total). Both are pure compositions of
/// ALREADY-VERIFIED public primitives (no new date/rounding/business rule
/// is introduced here) — kept in the domain layer, not inline in a widget,
/// per Milestone 6 section 2's "no financial calculations inside widgets"
/// rule.

/// Sum of every active income item's monthly amount. An income item has no
/// "billing range"/"payments left" concept — it recurs every month
/// indefinitely — so this is a plain filtered sum, not a cash-flow-event
/// computation.
num getMonthlyIncomeTotal(Iterable<FinanceItem> items) {
  num total = 0;
  for (final item in items) {
    if (item is IncomeItem && !item.isArchived) {
      total += item.amount;
    }
  }
  return round2(total);
}

/// Sum of `amount` for every active variable ("תשלומים שונים") item that
/// STILL has payments remaining as of [today] — i.e. this month's actual
/// installment total, as opposed to [getVariableRemainingBalance]'s
/// outstanding-balance total. Uses the exact same
/// [resolveItemEffectiveDay]/[parseDatesAndGetLeft] primitives
/// [getVariableItemRemainingBalance] itself uses to determine "still
/// active" — no new schedule logic.
num getVariableMonthlyPaymentsTotal(
  Iterable<FinanceItem> items, {
  required Map<String, CategoryConfig> categoryConfig,
  required DateTime today,
}) {
  num total = 0;
  for (final item in items) {
    if (item is! VariableItem || item.isArchived) continue;
    final effectiveDay = resolveItemEffectiveDay(item, categoryConfig);
    final dt = parseDatesAndGetLeft(
      item.start,
      item.total.raw,
      effectiveDay,
      today: today,
    );
    if (dt.left > 0) total += item.amount;
  }
  return round2(total);
}

/// Bank-vs-credit split of this month's fixed ("הוצאות קבועות") monthly
/// figures, for the fixed-category tile breakdown — mirrors
/// [getLoanBankVsPayrollSplit]'s shape/role for loans. Each active
/// [FixedItem]'s [getFixedItemMonthlyFigure] (already-verified, handles
/// bimonthly/yearly smoothing) is bucketed by its already-resolved
/// [FixedItem.effectiveWhere] — no new date/rounding rule is introduced.
class FixedBankVsCreditSplit {
  final num bank;
  final num credit;
  const FixedBankVsCreditSplit({required this.bank, required this.credit});
}

FixedBankVsCreditSplit getFixedBankVsCreditSplit(
  Iterable<FinanceItem> items,
  DateTime refDate,
) {
  num bank = 0, credit = 0;
  for (final item in items) {
    if (item is! FixedItem || item.isArchived) continue;
    final figure = getFixedItemMonthlyFigure(item, refDate);
    if (item.effectiveWhere == PaymentWhere.credit) {
      credit += figure;
    } else {
      bank += figure;
    }
  }
  return FixedBankVsCreditSplit(bank: round2(bank), credit: round2(credit));
}

/// The "💳 חיוב כרטיס אשראי" category tile's current-period total — the
/// same 5th-to-4th reporting window and the same unified event stream
/// [getHomeTotalExpensesForCurrentPeriod] uses, narrowed to
/// `ItemType.dated` events only. Mirrors that function's exact
/// window-selection logic rather than introducing a second one.
num getDatedCategoryTotalForCurrentPeriod(
  List<FinanceItem> items, {
  required DateTime refDate,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final bounds = getForecastPeriodBounds(refDate);
  final rangeStartMonth = DateTime(bounds.periodStart.year, bounds.periodStart.month, 1);
  final monthsCount = (bounds.periodEnd.year - rangeStartMonth.year) * 12 +
      (bounds.periodEnd.month - rangeStartMonth.month) +
      1;
  final events = generateCashflowEvents(
    items,
    rangeStartMonth,
    monthsCount: monthsCount,
    categoryConfig: categoryConfig,
  );

  num total = 0;
  for (final ev in events) {
    final evDate = cashflowDateOnly(ev.date);
    if (ev.type == ItemType.dated &&
        ev.amount < 0 &&
        !evDate.isBefore(bounds.periodStart) &&
        !evDate.isAfter(bounds.periodEnd)) {
      total += -ev.amount;
    }
  }
  return round2(total);
}
