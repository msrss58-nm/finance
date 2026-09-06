import '../../core/types/item_id.dart';
import '../cashflow/cashflow_engine.dart';
import '../dates/billing_dates.dart';
import '../models/app_settings.dart';
import '../models/category_config.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';
import '../normalization/legacy_resolvers.dart';

/// Projected daily balance engine — a faithful Dart port of app.js's
/// `buildProjectedBalanceSeries()`, `buildProjectedBalanceMonthView()` and
/// `getProjectedBalanceToday()` (Version 1.4.2 model).
///
/// This is the LIVE Opening Balance model (CLAUDE.md Section 11). The retired
/// Balance Anchor model (`anchorBalance`/`anchorDate`) is NOT implemented
/// here and must never be revived.
///
/// It reuses [generateCashflowEvents] verbatim as its ONLY event source — no
/// second, independent balance calculation exists anywhere in this layer,
/// exactly as app.js requires.
///
/// CLOCK NOTE: app.js reads `new Date()` inside getProjectedBalanceToday().
/// This port takes the reference date as a REQUIRED parameter — domain logic
/// must not read the system clock.

/// One cash-flow event as it appears inside a projected-balance day, carrying
/// the opening-day annotation app.js attaches.
class AnnotatedCashflowEvent {
  final CashflowEvent event;

  /// True only on the OPENING DAY, for an event considered already reflected
  /// in the user-entered opening amount. Always false on every later day
  /// (matching app.js's `isOpeningDay ? alreadyIncluded : false`).
  final bool alreadyIncludedInOpeningSnapshot;

  const AnnotatedCashflowEvent({
    required this.event,
    required this.alreadyIncludedInOpeningSnapshot,
  });
}

class ProjectedBalanceDay {
  final DateTime date;
  final String dateKey;
  final num income;
  final num expenses;
  final num net;
  final num projectedBalance;
  final List<AnnotatedCashflowEvent> events;
  final bool isOpeningDay;

  const ProjectedBalanceDay({
    required this.date,
    required this.dateKey,
    required this.income,
    required this.expenses,
    required this.net,
    required this.projectedBalance,
    required this.events,
    required this.isOpeningDay,
  });

  /// A negative projected balance is a WARNING state, never a blocking or
  /// error state (CLAUDE.md Section 10) — exposed as a plain predicate so no
  /// caller has to re-derive the sign convention.
  bool get isNegative => projectedBalance < 0;
}

class ProjectedBalanceSeries {
  final num openingAmount;
  final String openingDateStr;

  /// Empty when [throughDate] precedes the opening date — this engine only
  /// ever walks FORWARD. The caller decides how to label dates before the
  /// opening date; nothing is ever back-calculated.
  final List<ProjectedBalanceDay> days;

  const ProjectedBalanceSeries({
    required this.openingAmount,
    required this.openingDateStr,
    required this.days,
  });
}

/// `buildProjectedBalanceSeries(openingAmount, openingDateStr, throughDate,
/// itemsOverride, includedWithdrawalIds)`.
///
/// Walks EVERY local calendar day from the opening date through
/// [throughDate], both inclusive, carrying a running balance forward. There
/// is no separate catch-up-vs-future split — it is one continuous walk,
/// reused for both "today" and the forecast view.
///
/// Returns null only for a structurally invalid opening date/amount
/// (defensive guard; callers are expected to have validated via
/// [AppSettings.openingBalance] / getProjectedBalanceOpeningConfig already).
///
/// OPENING-DAY RULE: an event dated on the opening day is treated as already
/// reflected in the opening amount — EXCEPT a `cashWithdrawal` whose id is
/// absent from the captured [includedWithdrawalIds] snapshot, which means it
/// was entered AFTER the snapshot was taken and must still reduce the
/// balance that same day.
///
/// `includedWithdrawalIds == null` (never captured — legacy, or explicitly
/// not supplied) restores the original blanket rule for cash withdrawals
/// too. `null` and `[]` are therefore NOT interchangeable, and this
/// distinction must never be collapsed.
ProjectedBalanceSeries? buildProjectedBalanceSeries({
  required num openingAmount,
  required String openingDateStr,
  required DateTime throughDate,
  required List<FinanceItem> items,
  required List<int>? includedWithdrawalIds,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final openingDate = parseLocalDateStr(openingDateStr);
  // JS additionally guards `typeof openingAmount !== 'number' || !isFinite`;
  // Dart's type system covers the first half, isFinite the second.
  if (openingDate == null || !openingAmount.isFinite) return null;

  final openingZero = cashflowDateOnly(openingDate);
  final through = cashflowDateOnly(throughDate);
  if (through.isBefore(openingZero)) {
    return ProjectedBalanceSeries(
      openingAmount: round2(openingAmount),
      openingDateStr: openingDateStr,
      days: const [],
    );
  }

  final includedIds = includedWithdrawalIds;

  // JS: rangeStartMonth = 1st of the opening month; monthsCount spans through
  // the target month inclusive.
  final rangeStartMonth = DateTime(openingZero.year, openingZero.month, 1);
  final monthsCount = (through.year - rangeStartMonth.year) * 12 +
      (through.month - rangeStartMonth.month) +
      1;
  final events = generateCashflowEvents(
    items,
    rangeStartMonth,
    monthsCount: monthsCount,
    categoryConfig: categoryConfig,
  );

  final byDay = <String, List<CashflowEvent>>{};
  for (final ev in events) {
    byDay.putIfAbsent(cashflowDateKey(ev.date), () => []).add(ev);
  }

  final days = <ProjectedBalanceDay>[];
  var runningBalance = round2(openingAmount);
  var cursor = DateTime(openingZero.year, openingZero.month, openingZero.day);
  var isOpeningDay = true;

  while (!cursor.isAfter(through)) {
    final dateKey = cashflowDateKey(cursor);
    final dayEvents = byDay[dateKey] ?? const <CashflowEvent>[];

    num income = 0;
    num expenses = 0;
    num appliedNet = 0;
    final annotated = <AnnotatedCashflowEvent>[];

    for (final ev in dayEvents) {
      if (ev.amount >= 0) {
        income += ev.amount;
      } else {
        expenses += -ev.amount;
      }

      var alreadyIncluded = true;
      if (isOpeningDay && ev.type == ItemType.cashWithdrawal) {
        alreadyIncluded = includedIds == null
            ? true
            : _withdrawalIdIsIncluded(ev.itemId, includedIds);
      }
      if (!isOpeningDay || !alreadyIncluded) {
        appliedNet += ev.amount;
      }
      annotated.add(AnnotatedCashflowEvent(
        event: ev,
        alreadyIncludedInOpeningSnapshot: isOpeningDay ? alreadyIncluded : false,
      ));
    }

    income = round2(income);
    expenses = round2(expenses);
    final net = round2(income - expenses);
    appliedNet = round2(appliedNet);

    if (isOpeningDay) {
      runningBalance = round2(openingAmount + appliedNet);
    } else {
      runningBalance = round2(runningBalance + net);
    }

    days.add(ProjectedBalanceDay(
      date: DateTime(cursor.year, cursor.month, cursor.day),
      dateKey: dateKey,
      income: income,
      expenses: expenses,
      net: net,
      projectedBalance: runningBalance,
      events: annotated,
      isOpeningDay: isOpeningDay,
    ));

    isOpeningDay = false;
    // Calendar-safe step (Israel DST) — never Duration(days: 1).
    cursor = addCalendarDays(cursor, 1);
  }

  return ProjectedBalanceSeries(
    openingAmount: round2(openingAmount),
    openingDateStr: openingDateStr,
    days: days,
  );
}

/// JS uses `includedIds.indexOf(ev.itemId) !== -1` against a list of numbers.
/// The captured snapshot is `List<int>`, and every cash-withdrawal id the app
/// produces is numeric — so a non-numeric id can never be found, which
/// reproduces JS's `indexOf` miss (=> the withdrawal is treated as NOT already
/// included, and is applied). That is the conservative direction: a withdrawal
/// is deducted rather than silently ignored.
bool _withdrawalIdIsIncluded(ItemId itemId, List<int> includedIds) =>
    switch (itemId) {
      IntItemId(value: final v) => includedIds.contains(v),
      StringItemId() => false,
    };

/// Day availability in the forecast period view.
enum DayAvailability {
  /// Strictly before the opening date — carries NO computed figures at all.
  /// Never back-calculated, never fabricated.
  unavailable,
  opening,
  available,
}

class ProjectedBalanceMonthDay {
  final DateTime date;
  final int periodDayIndex;
  final String dateKey;
  final DayAvailability availability;
  final num? income;
  final num? expenses;
  final num? net;
  final num? projectedBalance;
  final List<AnnotatedCashflowEvent> events;

  const ProjectedBalanceMonthDay({
    required this.date,
    required this.periodDayIndex,
    required this.dateKey,
    required this.availability,
    required this.income,
    required this.expenses,
    required this.net,
    required this.projectedBalance,
    required this.events,
  });
}

class ProjectedBalanceMonthView {
  final DateTime periodStart;
  final DateTime periodEnd;
  final int totalDays;
  final bool configured;
  final num? openingAmount;
  final String? openingDateStr;
  final List<ProjectedBalanceMonthDay> days;

  const ProjectedBalanceMonthView({
    required this.periodStart,
    required this.periodEnd,
    required this.totalDays,
    required this.configured,
    required this.openingAmount,
    required this.openingDateStr,
    required this.days,
  });
}

/// `buildProjectedBalanceMonthView(refDate, itemsOverride)` — one entry for
/// every day of the 5th-to-4th reporting period containing [refDate],
/// ALWAYS (including days before the opening date and days before today).
///
/// The opening balance is never reset or reseeded on the 5th: the underlying
/// series is walked from the existing opening balance through periodEnd. This
/// function only decides which slice of that one series to expose — it never
/// computes a balance independently.
ProjectedBalanceMonthView buildProjectedBalanceMonthView({
  required DateTime refDate,
  required OpeningBalanceConfig? opening,
  required List<FinanceItem> items,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final bounds = getForecastPeriodBounds(refDate);

  if (opening == null) {
    return ProjectedBalanceMonthView(
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      totalDays: bounds.totalDays,
      configured: false,
      openingAmount: null,
      openingDateStr: null,
      days: const [],
    );
  }

  final openingParsed = parseLocalDateStr(opening.dateStr);
  // getProjectedBalanceOpeningConfig() already guarantees a valid date, so
  // this is a defensive guard only.
  final openingZero =
      openingParsed == null ? null : cashflowDateOnly(openingParsed);

  final series = (openingZero != null && !openingZero.isAfter(bounds.periodEnd))
      ? buildProjectedBalanceSeries(
          openingAmount: opening.amount,
          openingDateStr: opening.dateStr,
          throughDate: bounds.periodEnd,
          items: items,
          includedWithdrawalIds: opening.includedWithdrawalIds,
          categoryConfig: categoryConfig,
        )
      : null;

  final seriesByKey = <String, ProjectedBalanceDay>{};
  if (series != null) {
    for (final d in series.days) {
      seriesByKey[d.dateKey] = d;
    }
  }

  final days = <ProjectedBalanceMonthDay>[];
  var cursor = DateTime(
    bounds.periodStart.year,
    bounds.periodStart.month,
    bounds.periodStart.day,
  );
  var periodDayIndex = 1;

  while (!cursor.isAfter(bounds.periodEnd)) {
    final date = DateTime(cursor.year, cursor.month, cursor.day);
    final dateKey = cashflowDateKey(date);
    final rec = seriesByKey[dateKey];

    if (openingZero == null || date.isBefore(openingZero) || rec == null) {
      days.add(ProjectedBalanceMonthDay(
        date: date,
        periodDayIndex: periodDayIndex,
        dateKey: dateKey,
        availability: DayAvailability.unavailable,
        income: null,
        expenses: null,
        net: null,
        projectedBalance: null,
        events: const [],
      ));
    } else {
      days.add(ProjectedBalanceMonthDay(
        date: date,
        periodDayIndex: periodDayIndex,
        dateKey: dateKey,
        availability:
            rec.isOpeningDay ? DayAvailability.opening : DayAvailability.available,
        income: rec.income,
        expenses: rec.expenses,
        net: rec.net,
        projectedBalance: rec.projectedBalance,
        events: rec.events,
      ));
    }

    periodDayIndex++;
    cursor = addCalendarDays(cursor, 1);
  }

  return ProjectedBalanceMonthView(
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    totalDays: bounds.totalDays,
    configured: true,
    openingAmount: opening.amount,
    openingDateStr: opening.dateStr,
    days: days,
  );
}

/// The three states `getProjectedBalanceToday()` can return, modelled as a
/// sealed hierarchy so a caller cannot read `projectedBalance` in a state
/// where app.js does not provide one (in particular: no valid opening balance
/// yields NO number at all — never a fabricated zero).
sealed class ProjectedBalanceTodayResult {
  const ProjectedBalanceTodayResult();
}

/// `{ configured: false }` — no valid opening balance configured.
final class ProjectedBalanceUnconfigured extends ProjectedBalanceTodayResult {
  const ProjectedBalanceUnconfigured();
}

/// `{ configured: true, state: 'future' }` — today precedes the user-entered
/// opening date. The opening date is user-editable and is NOT forced to
/// today, so this is a legitimate, expected state.
final class ProjectedBalanceFuture extends ProjectedBalanceTodayResult {
  final String openingDateStr;
  const ProjectedBalanceFuture(this.openingDateStr);
}

/// `{ configured: true, state: 'available', projectedBalance, isOpeningDay }`.
final class ProjectedBalanceAvailable extends ProjectedBalanceTodayResult {
  final num projectedBalance;
  final bool isOpeningDay;
  const ProjectedBalanceAvailable({
    required this.projectedBalance,
    required this.isOpeningDay,
  });

  /// Negative is a warning state only — never blocking.
  bool get isNegative => projectedBalance < 0;
}

/// `getProjectedBalanceToday(itemsOverride)` — the SAME series engine as the
/// forecast view, walked through [today] instead of through the period end.
/// Never a second/independent balance calculation.
ProjectedBalanceTodayResult getProjectedBalanceToday({
  required DateTime today,
  required OpeningBalanceConfig? opening,
  required List<FinanceItem> items,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  if (opening == null) return const ProjectedBalanceUnconfigured();

  final openingParsed = parseLocalDateStr(opening.dateStr);
  if (openingParsed == null) return const ProjectedBalanceUnconfigured();

  final todayZero = cashflowDateOnly(today);
  final openingZero = cashflowDateOnly(openingParsed);
  if (todayZero.isBefore(openingZero)) {
    return ProjectedBalanceFuture(opening.dateStr);
  }

  final series = buildProjectedBalanceSeries(
    openingAmount: opening.amount,
    openingDateStr: opening.dateStr,
    throughDate: todayZero,
    items: items,
    includedWithdrawalIds: opening.includedWithdrawalIds,
    categoryConfig: categoryConfig,
  );
  if (series == null || series.days.isEmpty) {
    return const ProjectedBalanceUnconfigured();
  }

  final last = series.days.last;
  return ProjectedBalanceAvailable(
    projectedBalance: last.projectedBalance,
    isOpeningDay: last.isOpeningDay,
  );
}
