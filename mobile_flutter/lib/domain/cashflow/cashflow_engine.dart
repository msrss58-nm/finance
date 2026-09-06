import '../../core/types/item_id.dart';
import '../dates/billing_dates.dart';
import '../models/category_config.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';
import '../normalization/legacy_resolvers.dart';

/// Unified cash-flow engine — a faithful Dart port of app.js's
/// `generateCashflowEvents()` and the two pure consumers that sit directly on
/// top of it (`getHomeTotalExpensesForCurrentPeriod()`,
/// `getNextCashflowEvent()`).
///
/// This is the SINGLE source of truth for forward cash-flow events. Nothing
/// here invents new date arithmetic: every date is produced by the already
/// ported helpers in `../dates/billing_dates.dart`
/// (getClampedBillingDate/getBillingRange/isBillingActiveInMonth/
/// parseLocalDateStr), exactly as app.js reuses its own.
///
/// TRANSLATION NOTE: JS `Date` months are 0-based, Dart `DateTime` months are
/// 1-based. Every arithmetic idiom below is stated with its JS equivalent so
/// the offset is auditable line by line.
///
/// CLOCK NOTE: app.js reads `new Date()` inside
/// getHomeTotalExpensesForCurrentPeriod()/getNextCashflowEvent(). This port
/// takes the reference date as a REQUIRED parameter instead — domain logic
/// must not read the system clock, and the tests depend on it.

/// EVENT CONTRACT (unchanged from app.js):
/// positive [amount] = money IN (income); negative = money OUT
/// (fixed/loan/variable/dated/cashWithdrawal).
class CashflowEvent {
  /// Always a local calendar midnight (produced by getClampedBillingDate or
  /// parseLocalDateStr, both of which build `DateTime(y, m, d)`).
  final DateTime date;
  final num amount;
  final ItemId itemId;
  final ItemType type;
  final String title;

  const CashflowEvent({
    required this.date,
    required this.amount,
    required this.itemId,
    required this.type,
    required this.title,
  });

  @override
  String toString() =>
      'CashflowEvent(${cashflowDateKey(date)}, $amount, ${type.name}, '
      '${itemId.toJson()}, "$title")';
}

/// `CASHFLOW_HORIZON_MONTHS = 6`.
const int kCashflowHorizonMonths = 6;

/// `CASHFLOW_TYPE_ORDER` — income is listed before expenses on a shared day
/// so a day that nets positive never *appears* to dip first; expense types
/// then follow a fixed (arbitrary but stable) order.
///
/// app.js falls back to 99 for a type not present in the map. Every member of
/// [ItemType] is mapped here, so that fallback is unreachable in Dart — the
/// enum makes an unrecognized type impossible.
const Map<ItemType, int> kCashflowTypeOrder = {
  ItemType.income: 0,
  ItemType.fixed: 1,
  ItemType.loan: 2,
  ItemType.variable: 3,
  ItemType.dated: 4,
  ItemType.cashWithdrawal: 5,
};

/// ITEM-ID TIEBREAK — deliberate divergence, documented.
///
/// app.js's final tiebreak is `(a.itemId || 0) - (b.itemId || 0)`, which
/// assumes NUMERIC ids (every item type that reaches this engine is created
/// with a `Date.now()`-based numeric id). Dart's [ItemId] is a sealed
/// Int/String pair, so a total ordering must also cover string ids, which in
/// JS would make that subtraction NaN (undefined comparator behaviour).
///
/// Chosen ordering:
///   * IntItemId vs IntItemId -> numeric ascending. IDENTICAL to app.js for
///     the only case the live app actually produces. (`x || 0` differs from
///     `x` only for id 0, and `0 || 0 == 0`, so plain subtraction matches.)
///   * IntItemId before StringItemId -> arbitrary but fixed, mirroring "a
///     numeric id sorts as its number, a non-numeric one as 0-ish/unordered";
///     never throws.
///   * StringItemId vs StringItemId -> `String.compareTo` (code-unit
///     lexicographic), ascending. Deterministic and total.
///
/// SCOPE OF THE DIVERGENCE (measured, not assumed): an independent
/// differential run against app.js over 338 scenarios found this to be the
/// ONLY behavioural difference, and it changed no money figure and no date —
/// per-day income/expenses/net and every balance were identical. It is NOT
/// purely cosmetic though: because [getNextCashflowEvent] returns the FIRST
/// element of this ordering, a same-day tie between string-id items can
/// surface a different "next event" than app.js would. Unreachable from the
/// live app (ids are always `Date.now()` numbers — app.js:6189/6211); only a
/// hand-edited backup could produce it.
int _compareItemIds(ItemId a, ItemId b) {
  if (a is IntItemId && b is IntItemId) {
    return a.value.compareTo(b.value);
  }
  if (a is IntItemId) return -1;
  if (b is IntItemId) return 1;
  return (a as StringItemId).value.compareTo((b as StringItemId).value);
}

/// `compareCashflowEvents(a, b)` — deterministic same-day ordering for
/// TIMELINE/DISPLAY purposes only. Every balance figure downstream is a
/// per-CALENDAR-DAY sum, never a running total after each individual event,
/// so this order can never change a balance number.
int compareCashflowEvents(CashflowEvent a, CashflowEvent b) {
  final dCompare = a.date.compareTo(b.date);
  if (dCompare != 0) return dCompare;
  final ta = kCashflowTypeOrder[a.type] ?? 99;
  final tb = kCashflowTypeOrder[b.type] ?? 99;
  if (ta != tb) return ta - tb;
  return _compareItemIds(a.itemId, b.itemId);
}

/// V8's `Array.prototype.sort` is STABLE; Dart's `List.sort` is not. Sorting
/// through an insertion-index decoration reproduces JS's tie behaviour
/// exactly (equal-comparing events keep the order generateCashflowEvents
/// pushed them in) AND guarantees a total, deterministic order even if two
/// events ever shared date+type+itemId.
void _stableSortEvents(List<CashflowEvent> events) {
  final indexed = <MapEntry<int, CashflowEvent>>[
    for (var i = 0; i < events.length; i++) MapEntry(i, events[i]),
  ];
  indexed.sort((a, b) {
    final c = compareCashflowEvents(a.value, b.value);
    if (c != 0) return c;
    return a.key.compareTo(b.key);
  });
  for (var i = 0; i < indexed.length; i++) {
    events[i] = indexed[i].value;
  }
}

/// `isBuiltinCreditCardSettlement(item)` — the built-in credit-card
/// SETTLEMENT category (key 'dated', the default "💳 חיוב כרטיס אשראי") IS
/// the real monthly bank outflow, so it is EXEMPT from the credit exclusion
/// applied to every other dated item.
///
/// Identified by the STABLE KEY (`displayCategory || type`), never by the
/// category's displayed label (a user can rename that freely) and never by
/// `where` — so a settlement item that happens to have `where: 'credit'`
/// stored self-heals with no migration.
///
/// JS `item.displayCategory || item.type` is a FALSY test: an empty-string
/// displayCategory falls back to the type. Dart's `??` would keep `''`, so
/// the emptiness check below is required for parity.
bool isBuiltinCreditCardSettlement(FinanceItem item) {
  if (item.type != ItemType.dated) return false;
  return _categoryKeyOf(item) == 'dated';
}

/// `item.displayCategory || item.type` with JS falsy semantics.
String _categoryKeyOf(FinanceItem item) {
  final dc = item.displayCategory;
  return (dc == null || dc.isEmpty) ? item.type.name : dc;
}

/// `generateCashflowEvents(items, rangeStartMonth, monthsCount)`.
///
/// Generates every cash-flow event across [monthsCount] consecutive calendar
/// months starting at [rangeStartMonth] — UNFILTERED by any "today" boundary
/// (that filtering belongs to the caller). This function is unaware of
/// "today"/the opening balance at all; it just fills the requested window.
///
/// Per-type rules, ported verbatim:
///   * archived items generate nothing.
///   * income: one event per month of the window, at the clamped effective
///     day.
///   * fixed: skipped entirely when paid by CREDIT (the card's own
///     settlement is the real bank outflow). Bimonthly -> a DISCRETE full
///     amount only in parity-matching months. Yearly -> smoothed to
///     amount/12 every month. Monthly -> the full amount.
///   * loan: skipped entirely when the source is PAYROLL (the salary already
///     entered into the app is net). Otherwise one event per ACTIVE BILLING
///     MONTH, so a future loan produces nothing before its range starts.
///   * variable: ONLY `where == bank` generates events (identical schedule
///     logic to loan). `credit` and LEGACY-null generate NOTHING — a missing
///     method must never be defaulted to bank.
///   * dated: one event, only when it is the built-in settlement OR is not
///     credit-paid, and only if its own date falls inside the window.
///   * cashWithdrawal: always its own one-time event inside the window,
///     under its own event type.
List<CashflowEvent> generateCashflowEvents(
  List<FinanceItem> items,
  DateTime rangeStartMonth, {
  int? monthsCount,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final months = monthsCount ?? kCashflowHorizonMonths;

  // JS: new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  final horizonStart = DateTime(rangeStartMonth.year, rangeStartMonth.month, 1);
  // JS: new Date(rangeStart.getFullYear(), rangeStart.getMonth() + months, 0)
  // = day 0 of the month AFTER the last month in the window = that last
  // month's final day. With 1-based Dart months the same expression
  // `DateTime(y, month + months, 0)` lands on exactly the same date.
  final horizonEnd =
      DateTime(rangeStartMonth.year, rangeStartMonth.month + months, 0);

  final events = <CashflowEvent>[];

  for (final item in items) {
    if (item.isArchived) continue;

    switch (item) {
      case IncomeItem():
        final day = resolveItemEffectiveDay(item, categoryConfig);
        for (var mi = 0; mi < months; mi++) {
          final di = getClampedBillingDate(
            horizonStart.year,
            horizonStart.month + mi,
            day,
          );
          events.add(CashflowEvent(
            date: di,
            amount: item.amount,
            itemId: item.id,
            type: ItemType.income,
            title: item.title,
          ));
        }

      case FixedItem():
        // A fixed expense paid by credit card does not itself leave the bank
        // on its own billing day — the card's monthly settlement does.
        if (item.effectiveWhere == PaymentWhere.credit) break;
        final isBimonthlyFixed =
            resolveFixedIsBimonthly(item.bimonthly, item.bimonthlyStartMonth);
        final bimonthlyStart = isBimonthlyFixed
            ? resolveFixedBimonthlyStartMonth(item.bimonthlyStartMonth)
            : null;
        // Bimonthly is deliberately NOT smoothed: full amount in an active
        // month, nothing at all in every other month.
        final num mAmount = isBimonthlyFixed
            ? item.amount
            : (item.period == FixedPeriod.yearly
                ? item.amount / 12
                : item.amount);
        final day = resolveItemEffectiveDay(item, categoryConfig);
        for (var mf = 0; mf < months; mf++) {
          final probeMonth =
              DateTime(horizonStart.year, horizonStart.month + mf, 1);
          if (isBimonthlyFixed &&
              !isBimonthlyActiveMonth(probeMonth.month, bimonthlyStart!)) {
            continue;
          }
          final df = getClampedBillingDate(
            probeMonth.year,
            probeMonth.month,
            day,
          );
          events.add(CashflowEvent(
            date: df,
            amount: -mAmount,
            itemId: item.id,
            type: ItemType.fixed,
            title: item.title,
          ));
        }

      case LoanItem():
        // A payroll-deducted loan never leaves the bank on its own.
        if (item.source == LoanSource.payroll) break;
        final range = getBillingRange(
          item.start,
          item.total.raw,
          resolveItemEffectiveDay(item, categoryConfig),
        );
        if (range == null) break;
        for (var ml = 0; ml < months; ml++) {
          final probe = DateTime(horizonStart.year, horizonStart.month + ml, 1);
          if (!isBillingActiveInMonth(range, probe.year, probe.month)) continue;
          final dl = getClampedBillingDate(probe.year, probe.month, range.bDay);
          events.add(CashflowEvent(
            date: dl,
            amount: -item.amount,
            itemId: item.id,
            type: ItemType.loan,
            title: item.title,
          ));
        }

      case VariableItem():
        // ONLY an explicit 'bank' method generates real events. 'credit' is
        // represented by the card settlement instead; a LEGACY item with no
        // stored method stays tracking-only and must NEVER be assumed bank.
        if (item.paymentMethod != VariablePaymentMethod.bank) break;
        final rangeVar = getBillingRange(
          item.start,
          item.total.raw,
          resolveItemEffectiveDay(item, categoryConfig),
        );
        if (rangeVar == null) break;
        for (var mv = 0; mv < months; mv++) {
          final probeVar =
              DateTime(horizonStart.year, horizonStart.month + mv, 1);
          if (!isBillingActiveInMonth(rangeVar, probeVar.year, probeVar.month)) {
            continue;
          }
          final dv = getClampedBillingDate(
            probeVar.year,
            probeVar.month,
            rangeVar.bDay,
          );
          events.add(CashflowEvent(
            date: dv,
            amount: -item.amount,
            itemId: item.id,
            type: ItemType.variable,
            title: item.title,
          ));
        }

      case DatedItem():
        final datedEffectiveWhere = item.effectiveWhere;
        // A one-time dated charge paid by credit card is deferred to the
        // card's own settlement. The built-in settlement itself is EXEMPT —
        // it always counts, regardless of its own `where`.
        if (!isBuiltinCreditCardSettlement(item) &&
            datedEffectiveWhere == PaymentWhere.credit) {
          break;
        }
        // JS `item.start ? ... : null` — an empty string is falsy.
        final start = item.start;
        final dd =
            (start == null || start.isEmpty) ? null : parseLocalDateStr(start);
        if (dd == null) break;
        if (dd.isBefore(horizonStart) || dd.isAfter(horizonEnd)) break;
        events.add(CashflowEvent(
          date: dd,
          amount: -item.amount,
          itemId: item.id,
          type: ItemType.dated,
          title: item.title,
        ));

      case CashWithdrawalItem():
        // A bank-balance movement under its OWN event type, so it is
        // structurally excluded from every dated/credit-card aggregation.
        final start = item.start;
        final dw =
            (start == null || start.isEmpty) ? null : parseLocalDateStr(start);
        if (dw == null) break;
        if (dw.isBefore(horizonStart) || dw.isAfter(horizonEnd)) break;
        events.add(CashflowEvent(
          date: dw,
          amount: -item.amount,
          itemId: item.id,
          type: ItemType.cashWithdrawal,
          title: item.title,
        ));
    }
    // An unrecognized type generates nothing. In Dart the sealed FinanceItem
    // hierarchy makes that unreachable — every subtype is handled above.
  }

  _stableSortEvents(events);
  return events;
}

/// `getHomeTotalExpensesForCurrentPeriod(itemsOverride, refDate)` — Home's
/// "סך הכול הוצאות" tile.
///
/// Uses the SAME 5th-to-4th reporting period as Forecast
/// ([getForecastPeriodBounds]) and the SAME unified event stream as its ONLY
/// source of truth. It adds NO exclusion logic of its own — every exclusion
/// (credit-paid fixed/variable, payroll loans, non-settlement credit-paid
/// dated charges) is already applied by [generateCashflowEvents]. It is only
/// a date-range filter plus a sum of the negative amounts, sign-flipped to a
/// positive total.
num getHomeTotalExpensesForCurrentPeriod(
  List<FinanceItem> items, {
  required DateTime refDate,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final bounds = getForecastPeriodBounds(refDate);
  final rangeStartMonth =
      DateTime(bounds.periodStart.year, bounds.periodStart.month, 1);
  // Whole calendar months spanned by [rangeStartMonth .. periodEnd].
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
    if (ev.amount < 0 &&
        !evDate.isBefore(bounds.periodStart) &&
        !evDate.isAfter(bounds.periodEnd)) {
      total += -ev.amount;
    }
  }
  return round2(total);
}

/// `getNextCashflowEvent(itemsOverride)` — the single "האירוע הכספי הבא"
/// card, strictly AFTER [today], from the same unified event source. Looks
/// two months ahead so an event just past a month boundary is never missed.
CashflowEvent? getNextCashflowEvent(
  List<FinanceItem> items, {
  required DateTime today,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final todayZero = cashflowDateOnly(today);
  final monthStart = DateTime(todayZero.year, todayZero.month, 1);
  final upcoming = generateCashflowEvents(
    items,
    monthStart,
    monthsCount: 2,
    categoryConfig: categoryConfig,
  );
  for (final ev in upcoming) {
    // `upcoming` is already sorted by compareCashflowEvents, so the first
    // strictly-future event IS the winner of app.js's re-sort of `future`.
    if (cashflowDateOnly(ev.date).isAfter(todayZero)) return ev;
  }
  return null;
}
