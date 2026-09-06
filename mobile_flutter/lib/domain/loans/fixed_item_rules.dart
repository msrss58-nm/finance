import '../dates/billing_dates.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';

/// Fixed-item ("הוצאות קבועות") monthly-figure rule, ported 1:1 from app.js.

/// `getFixedItemMonthlyFigure(item, refDate)` — app.js:1310-1316.
///
/// The single shared "what does this fixed item contribute to THIS month"
/// figure, reused by every monthly aggregate (Home snapshot, category tiles,
/// the Insights credit-card / commitments cards) so they can never disagree
/// with each other.
///
/// The three branches, in app.js's own order of precedence:
///  1. BIMONTHLY (checked first, and it overrides `period` entirely): the
///     FULL amount in an active month, and ZERO in every other month.
///     app.js's comment states the intent explicitly — bimonthly is
///     "deliberately NOT smoothed", because it matches the item's own
///     discrete every-2-months occurrence and the cash-flow engine's own
///     event dates, "rather than inventing a new averaging rule nothing asked
///     for". Do not "improve" this into amount/2.
///  2. YEARLY (`period === 'שנתי'`): smoothed to `amount / 12` EVERY month —
///     the existing budgeting convention, explicitly left unchanged.
///  3. MONTHLY (and every unrecognized/legacy period value): the full amount.
///
/// "Active month" is pure odd/even month parity against the stored start
/// month ([isBimonthlyActiveMonth]) — year-agnostic by construction, which is
/// why only a month, never a year, is stored.
///
/// [refDate] is required rather than defaulting to the clock (app.js uses
/// `refDate || new Date()`), so callers stay deterministic. Only its MONTH is
/// read, and only on the bimonthly branch.
///
/// MODEL NOTE: [FixedItem.bimonthly] already carries app.js's
/// `resolveFixedIsBimonthly()` result — it is true only when the raw
/// `bimonthly === true` AND the raw start month is a valid 1-12 (malformed
/// recurrence data safely falls back to the period-based behavior). The
/// `?? 1` on [FixedItem.bimonthlyStartMonth] mirrors
/// `resolveFixedBimonthlyStartMonth()`'s own fallback for a hand-constructed
/// item; items produced by the normalizer always carry a non-null start month
/// whenever `bimonthly` is true.
double getFixedItemMonthlyFigure(FixedItem item, DateTime refDate) {
  if (item.bimonthly) {
    final refMonth1to12 = refDate.month;
    return isBimonthlyActiveMonth(refMonth1to12, item.bimonthlyStartMonth ?? 1)
        ? item.amount.toDouble()
        : 0.0;
  }
  return item.period == FixedPeriod.yearly
      ? item.amount / 12
      : item.amount.toDouble();
}
