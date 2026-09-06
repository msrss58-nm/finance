import '../dates/billing_dates.dart';
import '../models/category_config.dart';
import '../models/finance_item.dart';

/// Variable ("תשלומים שונים") installment-item remaining-balance rules,
/// ported 1:1 from app.js.
///
/// CRITICAL PARITY RULE: there is NO originalAmount fallback for variable
/// items. app.js reads `originalAmount` on a variable item ONLY for edit-form
/// pre-fill (`item.originalAmount || ''`) — never in any calculation. The
/// `-> 0` fallback verified at app.js:902 is loan-specific and is applied
/// only inside getLoanRemainingBalance(). Nothing in this file reads
/// originalAmount at all, and nothing here may ever default it.
///
/// BILLING-DAY NOTE: unlike the loan paths (which pass `it.day` raw), the
/// variable paths route the day through resolveEffectiveDay() — app.js:849
/// and app.js:728. That is why [categoryConfig] is required here: the
/// resolver falls back to the item's category's `defaultDayOfMonth`, then to
/// 1. This asymmetry with loans is deliberate and reproduced exactly.
///
/// CASH-FLOW SCOPE NOTE: `where` is NOT consulted here. Remaining balance is
/// a tracking figure computed for every non-archived variable item
/// regardless of payment method. Whether a variable item generates a real
/// balance-affecting event (bank yes / credit no / legacy-missing never) is a
/// cash-flow-engine concern, owned elsewhere — a legacy item with a null
/// `where` must never be defaulted to bank there.

/// Per-item result of [getVariableItemRemainingBalance].
class VariableRemainingBalance {
  final double total;
  final int left;

  const VariableRemainingBalance({required this.total, required this.left});

  @override
  String toString() => 'VariableRemainingBalance(total: $total, left: $left)';
}

/// `getVariableItemRemainingBalance(it)` — app.js:848-851.
///
/// `amount x payments left`, using the resolveEffectiveDay() billing-day
/// convention. No rounding, no interest, no amortization — a variable item
/// has no principal/interest split at all, which is precisely why it has no
/// originalAmount-driven calculation and therefore no verified fallback.
VariableRemainingBalance getVariableItemRemainingBalance(
  VariableItem item, {
  required Map<String, CategoryConfig> categoryConfig,
  required DateTime today,
}) {
  final effectiveDay = resolveItemEffectiveDay(item, categoryConfig);
  final dt = parseDatesAndGetLeft(
    item.start,
    item.total.raw,
    effectiveDay,
    today: today,
  );
  return VariableRemainingBalance(
    total: (item.amount * dt.left).toDouble(),
    left: dt.left,
  );
}

/// `getVariableRemainingBalance(items)` — app.js:853-862. Sum of every
/// non-archived variable item's [getVariableItemRemainingBalance] total;
/// every other item type is skipped entirely.
double getVariableRemainingBalance(
  Iterable<FinanceItem> items, {
  required Map<String, CategoryConfig> categoryConfig,
  required DateTime today,
}) {
  var total = 0.0;
  for (final item in items) {
    if (item is! VariableItem || item.isArchived) continue;
    total += getVariableItemRemainingBalance(
      item,
      categoryConfig: categoryConfig,
      today: today,
    ).total;
  }
  return total;
}
