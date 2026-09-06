import '../../core/types/legacy_numeric_field.dart';
import '../models/category_config.dart';
import '../models/finance_item.dart';
import '../normalization/legacy_resolvers.dart';

/// Date/billing primitives ported from app.js's unified engine.
///
/// TRANSLATION NOTE (critical): JS `Date` months are 0-based, Dart
/// `DateTime` months are 1-based. Every port below uses Dart-native 1-based
/// months in its own API, and the JS equivalence is stated per function.
/// Both languages normalize out-of-range month/day arguments identically
/// (`DateTime(2026, 13, 1)` == Jan 2027, `DateTime(2026, 3, 0)` == last day
/// of Feb 2026), which is exactly what app.js relies on — so the arithmetic
/// idioms carry over 1:1 once the month offset is accounted for.
///
/// DST NOTE: never use `Duration(days: 1)` to step a calendar day. Israel
/// observes DST, so a 24-hour Duration can land on the same or a skipped
/// calendar day. [addCalendarDays] rebuilds the date field-wise, matching
/// JS's own `cursor.setDate(cursor.getDate() + 1)` semantics.

/// `parseLocalDateStr(str)` — parses a stored 'YYYY-MM-DD' as a LOCAL
/// calendar date. Deliberately NOT `DateTime.parse` (which treats a bare
/// date as local but a 'Z'/offset form as UTC, and throws on malformed
/// input): this mirrors app.js's field-wise split exactly, returning null
/// rather than throwing.
///
/// Matching app.js: a missing day component defaults to 1; non-numeric
/// components yield null. Note this is intentionally MORE permissive than
/// [isValidDateStr] — app.js's own parseLocalDateStr accepts e.g.
/// '2026-02-30' and lets Date normalize it (to March 2). Callers that need
/// strict calendar validity must use isValidDateStr() first, exactly as
/// app.js does.
/// JS falsiness for a RAW stored value. Note `'0'` (a non-empty string) is
/// TRUTHY in JS even though it parses to 0 — several helpers below branch on
/// the raw value's truthiness BEFORE parsing, so this distinction is
/// load-bearing, not pedantic.
bool _jsFalsy(Object? v) =>
    v == null ||
    v == false ||
    (v is num && (v == 0 || v.isNaN)) ||
    (v is String && v.isEmpty);

/// JS `parseInt(x, 10)` — lexes a leading integer and IGNORES trailing
/// garbage (`parseInt('05T12:30', 10) === 5`), unlike Dart's whole-string
/// `int.tryParse`. [LegacyNumericField.asInt] already implements exactly
/// this, so it is reused rather than duplicated.
int? _jsParseInt(Object? v) => LegacyNumericField(v).asInt();

DateTime? parseLocalDateStr(Object? str) {
  if (str is! String) return null;
  final parts = str.split('-');
  final y = _jsParseInt(parts.isNotEmpty ? parts[0] : '');
  final m = _jsParseInt(parts.length > 1 ? parts[1] : '');
  // JS: `parts[2] ? parseInt(parts[2], 10) : 1` — an ABSENT third component
  // and an EMPTY one ('2026-09-') both fall back to day 1.
  final rawDay = parts.length > 2 ? parts[2] : '';
  final d = _jsFalsy(rawDay) ? 1 : _jsParseInt(rawDay);
  if (y == null || m == null || d == null) return null;
  // JS does `new Date(y, parts[1] - 1, d)` with a 0-based month; Dart's month
  // is 1-based, so the parsed 1-based value is passed straight through.
  // Out-of-range values normalize identically in both languages
  // ('2026-13-01' -> Jan 2027, '2026-00-15' -> Dec 2025).
  // jsDateTime (not DateTime) reproduces `new Date()`'s 0..99 -> 1900+year
  // rule; see its doc comment for why that matters for validation.
  return jsDateTime(y, m, d);
}

/// `cashflowDateOnly(d)` — strips the time component, keeping local
/// year/month/day.
DateTime cashflowDateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// `cashflowDateKey(d)` — 'YYYY-MM-DD' local key used to bucket events by
/// calendar day.
String cashflowDateKey(DateTime d) {
  String pad(int n) => n < 10 ? '0$n' : '$n';
  return '${d.year}-${pad(d.month)}-${pad(d.day)}';
}

/// Calendar-safe day step (see DST note above).
DateTime addCalendarDays(DateTime d, int days) =>
    DateTime(d.year, d.month, d.day + days);

/// `getClampedBillingDate(year, monthIndex, day)` — a stored billing day of
/// 29/30/31 that doesn't exist in the target month lands on that month's
/// LAST real day instead. The stored day value itself is never altered —
/// only the date built from it here.
///
/// JS equivalence: `getClampedBillingDate(y, monthIndex, day)` with a
/// 0-based monthIndex; [month] here is 1-based. Out-of-range months
/// normalize first (so `month: 13` is January of the next year), then the
/// day is clamped against that normalized month's real length — matching
/// app.js's `new Date(year, monthIndex, 1)` pre-normalization step.
DateTime getClampedBillingDate(int year, int month, int day) {
  // jsDateTime for the initial construction only: `new Date(year, m, 1)` is
  // where JS's 0..99 -> 1900+year rule applies. The two follow-up
  // constructions take an ALREADY-mapped 4-digit year from `normalized`, so
  // they use plain DateTime — running the mapping twice would be wrong.
  final normalized = jsDateTime(year, month, 1);
  final lastDayOfMonth = DateTime(normalized.year, normalized.month + 1, 0).day;
  final clampedDay = day < lastDayOfMonth ? day : lastDayOfMonth;
  return DateTime(normalized.year, normalized.month, clampedDay);
}

/// Result of [getBillingRange] — the first and last billing dates of an
/// installment schedule, plus the effective billing day and total count.
class BillingRange {
  final DateTime first;
  final DateTime last;
  final int bDay;
  final int total;

  const BillingRange({
    required this.first,
    required this.last,
    required this.bDay,
    required this.total,
  });
}

/// `getBillingRange(startDateStr, totalPayments, billingDay)`.
///
/// Returns null when startDateStr or totalPayments is falsy in the JS sense
/// — reproduced here as: null/empty start string, or a total that parses to
/// null/0 (JS `!totalPayments` is true for 0, '', null and undefined).
///
/// The first billing month is the start month, PUSHED FORWARD ONE MONTH
/// when the start day is on or after the billing day (`startDay >= bDay`) —
/// i.e. a purchase made on/after this month's billing day is first charged
/// next month. The last billing date is `total - 1` months after the first.
BillingRange? getBillingRange(
  Object? startDateStr,
  Object? totalPayments,
  Object? billingDay,
) {
  // JS: `if (!startDateStr || !totalPayments) return null;` — truthiness is
  // tested on the RAW value. The string '0' is TRUTHY in JS, so a stored
  // total of '0' produces a real (degenerate) range, NOT null.
  if (_jsFalsy(startDateStr) || _jsFalsy(totalPayments)) return null;
  if (startDateStr is! String) return null;

  final total = _jsParseInt(totalPayments);
  // A truthy but genuinely unparseable total ('abc') yields NaN in JS and an
  // Invalid Date downstream. Dart has no Invalid Date; returning null is the
  // documented, deliberate divergence (a caller gets "no schedule" rather
  // than a garbage date).
  if (total == null) return null;

  final parts = startDateStr.split('-');
  final startYear = _jsParseInt(parts.isNotEmpty ? parts[0] : '');
  final startMonthRaw = _jsParseInt(parts.length > 1 ? parts[1] : '');
  if (startYear == null || startMonthRaw == null) return null;

  // JS: `parts[2] ? parseInt(parts[2], 10) : 1` — an absent OR empty day
  // component means 1. A non-numeric day yields NaN, and `NaN >= bDay` is
  // always false, so it must never trigger the month push below.
  final rawStartDay = parts.length > 2 ? parts[2] : '';
  final startDay = _jsFalsy(rawStartDay) ? 1 : _jsParseInt(rawStartDay);

  // JS: `billingDay ? parseInt(billingDay, 10) : 1`. Again raw truthiness —
  // the NUMBER 0 is falsy (so it becomes 1), but the STRING '0' is truthy
  // (so bDay really is 0, which getClampedBillingDate then resolves to the
  // last day of the PRECEDING month). Collapsing these two shifts an entire
  // payment schedule, so the distinction is preserved exactly.
  final bDay = _jsFalsy(billingDay) ? 1 : (_jsParseInt(billingDay) ?? 1);

  var firstBillingMonth = startMonthRaw;
  // NaN-safe: a null startDay (non-numeric) never pushes, matching JS.
  if (startDay != null && startDay >= bDay) {
    firstBillingMonth += 1;
  }
  final firstBillingDate =
      getClampedBillingDate(startYear, firstBillingMonth, bDay);
  final lastBillingDate = getClampedBillingDate(
    firstBillingDate.year,
    firstBillingDate.month + (total - 1),
    bDay,
  );

  return BillingRange(
    first: firstBillingDate,
    last: lastBillingDate,
    bDay: bDay,
    total: total,
  );
}

/// `isBillingActiveInMonth(range, year, monthIndex)` — whole-month
/// containment test on a year*12+month ordinal, so day-of-month never
/// affects it. [month] is 1-based (JS passes a 0-based index; the ordinal
/// is shifted consistently on both sides so the comparison is identical).
bool isBillingActiveInMonth(BillingRange range, int year, int month) {
  final firstYm = range.first.year * 12 + (range.first.month - 1);
  final lastYm = range.last.year * 12 + (range.last.month - 1);
  final targetYm = year * 12 + (month - 1);
  return targetYm >= firstYm && targetYm <= lastYm;
}

/// Result of [parseDatesAndGetLeft] — remaining payment count as of a
/// reference date.
class PaymentsLeft {
  final int left;
  final DateTime? endDate;

  const PaymentsLeft({required this.left, required this.endDate});
}

/// `parseDatesAndGetLeft(startDateStr, totalPayments, billingDay)`.
///
/// [today] is injected rather than read from the clock so this is
/// deterministic and testable; app.js reads `new Date()` at exactly this
/// point. `endStr` in app.js is a he-IL *display* string built here — that
/// is a formatting concern, so this port returns the raw [endDate] and
/// leaves formatting to the presentation layer (no UI in this milestone).
PaymentsLeft parseDatesAndGetLeft(
  Object? startDateStr,
  Object? totalPayments,
  Object? billingDay, {
  required DateTime today,
}) {
  final range = getBillingRange(startDateStr, totalPayments, billingDay);
  if (range == null) return const PaymentsLeft(left: 0, endDate: null);

  final todayZero = cashflowDateOnly(today);

  // Before the first real billing date: every payment still remains.
  if (todayZero.isBefore(range.first)) {
    return PaymentsLeft(left: range.total, endDate: range.last);
  }

  var passedMonths = (todayZero.year - range.first.year) * 12 +
      (todayZero.month - range.first.month);

  // On/after this month's billing day, the current month's payment counts
  // as already taken.
  if (todayZero.day >= range.bDay) {
    passedMonths += 1;
  }

  var left = range.total - passedMonths;
  if (left < 0) left = 0;
  if (left > range.total) left = range.total;

  return PaymentsLeft(left: left, endDate: range.last);
}

/// `isBimonthlyActiveMonth(targetMonth1to12, startMonth1to12)` — a
/// bimonthly item is active in every month sharing its start month's
/// odd/even parity, which is year-agnostic by construction (which is why
/// only a month, never a year, is stored).
bool isBimonthlyActiveMonth(int targetMonth1to12, int startMonth1to12) =>
    (targetMonth1to12 % 2) == (startMonth1to12 % 2);

/// The Forecast reporting period: the 5th of [refDate]'s OWN calendar month
/// through the 4th of the following month, inclusive — anchored to
/// refDate's month number regardless of whether refDate's own day is before
/// or after the 5th (Version 1.4.7 correction; the earlier "which period
/// contains today" rule was the confirmed root cause of a wrong-period/
/// blank-graph bug).
///
/// `totalDays` uses the same integer year/month idiom as
/// [getClampedBillingDate] (`DateTime(y, m + 1, 0).day`) rather than a
/// millisecond difference, so Israel DST can never introduce an
/// off-by-one. The period label is a presentation concern and is not
/// produced here (no UI in this milestone).
class ForecastPeriodBounds {
  final DateTime periodStart;
  final DateTime periodEnd;
  final int totalDays;

  const ForecastPeriodBounds({
    required this.periodStart,
    required this.periodEnd,
    required this.totalDays,
  });
}

ForecastPeriodBounds getForecastPeriodBounds(DateTime refDate) {
  final periodStart = DateTime(refDate.year, refDate.month, 5);
  final periodEnd = DateTime(periodStart.year, periodStart.month + 1, 4);
  final totalDays = DateTime(periodStart.year, periodStart.month + 1, 0).day;
  return ForecastPeriodBounds(
    periodStart: periodStart,
    periodEnd: periodEnd,
    totalDays: totalDays,
  );
}

/// `resolveEffectiveDay(item)` bound to a domain [FinanceItem].
///
/// app.js resolves the category key as `item.displayCategory || item.type`,
/// then falls back to `categoryConfig[item.type]` when that lookup misses —
/// so a stale/mismatched displayCategory still finds its type's default.
/// legacy_resolvers.dart's [resolveEffectiveDay] implements the lookup
/// itself; this wrapper supplies the same key-resolution chain.
int resolveItemEffectiveDay(
  FinanceItem item,
  Map<String, CategoryConfig> categoryConfig,
) {
  final day = _dayFieldOf(item);
  final ownDay = day.asInt();
  if (ownDay != null && ownDay >= 1 && ownDay <= 31) return ownDay;

  final primaryKey = item.displayCategory ?? item.type.name;
  final primary = categoryConfig[primaryKey];
  final cfg = primary ?? categoryConfig[item.type.name];
  final defaultDay = cfg?.defaultDayOfMonth;
  if (defaultDay != null && defaultDay >= 1 && defaultDay <= 31) {
    return defaultDay;
  }
  return 1;
}

/// Not every item type carries a `day` field (dated/cashWithdrawal never
/// do) — those resolve through the category-default/1 path, exactly as
/// app.js's `parseInt(undefined, 10)` (NaN) does.
LegacyNumericField _dayFieldOf(FinanceItem item) => switch (item) {
      IncomeItem i => i.day,
      FixedItem f => f.day,
      VariableItem v => v.day,
      LoanItem l => l.day,
      DatedItem _ => LegacyNumericField.absent,
      CashWithdrawalItem _ => LegacyNumericField.absent,
    };
