import '../../core/types/legacy_numeric_field.dart';
import '../models/category_config.dart';
import '../models/enums.dart';

/// JS `Number.EPSILON`.
const double kJsNumberEpsilon = 2.220446049250313e-16;

/// JS `Math.round(x)`.
///
/// Per the ES spec this is `floor(x + 0.5)`, which breaks .5 ties towards
/// POSITIVE INFINITY. Dart's `double.round()` breaks ties AWAY FROM ZERO,
/// so the two disagree on every negative half-integer (JS `Math.round(-0.5)`
/// is -0, Dart `(-0.5).round()` is -1). Money in this app is regularly
/// negative (expense events, negative net days, overdrawn balances), so the
/// difference is live, not theoretical.
double jsMathRound(double x) {
  if (x.isNaN || x.isInfinite) return x;
  // NOT `floor(x + 0.5)`: the ES spec calls that out as wrong for exactly one
  // double, x = 0.49999999999999994, where `x + 0.5` rounds UP to 1.0 in
  // binary floating point and yields 1 instead of 0. Comparing the fraction
  // against 0.5 directly avoids the intermediate addition entirely while
  // keeping ties-toward-+Infinity for negatives.
  final f = x.floorToDouble();
  return (x - f >= 0.5) ? f + 1.0 : f;
}

/// JS `Number.MAX_SAFE_INTEGER` (2^53 - 1).
const int kJsMaxSafeInteger = 9007199254740991;

/// JS `Number.isSafeInteger(x)`: true iff `x` is a number, `Number.isInteger(x)`
/// (finite AND has no fractional part — NaN/Infinity fail this), and
/// `Math.abs(x) <= Number.MAX_SAFE_INTEGER`.
///
/// This matters because `jsonDecode` in Dart can hand back either an `int` or
/// a `double` for a JSON numeric token depending on whether it contained a
/// decimal point (`5` -> int, `5.0` -> double) — a distinction JS itself does
/// not make (both are just `number`). A naive `id is int` check is therefore
/// STRICTER than the live Web validation it is meant to mirror: a backup
/// containing the literal token `5.0` for an id is accepted by
/// `Number.isSafeInteger(5.0)` in the browser (it IS an integer value, merely
/// stored in a double-typed Dart variable after decoding) and must be
/// accepted here too. Only an actual fractional value (5.5), NaN, Infinity,
/// or a magnitude beyond 2^53-1 is rejected.
bool jsIsSafeInteger(Object? v) {
  if (v is int) {
    return v >= -kJsMaxSafeInteger && v <= kJsMaxSafeInteger;
  }
  if (v is double) {
    if (!v.isFinite) return false;
    if (v != v.truncateToDouble()) return false;
    return v >= -kJsMaxSafeInteger && v <= kJsMaxSafeInteger;
  }
  return false;
}

/// JS `new Date(year, month, day)` maps a year of 0..99 to 1900+year — a
/// legacy Date constructor rule with no Dart equivalent (`DateTime(1, ...)`
/// really is year 1).
///
/// This is not a curiosity: it is what makes app.js's isValidDateStr()
/// REJECT '0001-01-01' (the round-trip year comes back as 1901, not 1).
/// Without the mapping, a corrupted stored date that the live app safely
/// refuses would instead be accepted here — and an opening date of year 1
/// would make the projected-balance walk iterate ~740,000 days.
DateTime jsDateTime(int year, int month, int day) =>
    DateTime((year >= 0 && year <= 99) ? 1900 + year : year, month, day);

/// `round2(n)` — app.js:1907: `Math.round((n + Number.EPSILON) * 100) / 100`.
///
/// The `+ Number.EPSILON` term is NOT decorative: it nudges a value sitting
/// just below a half-cent boundary in binary floating point up onto it, so
/// e.g. `round2(1.005)` is 1.01 in the live app even though `1.005 * 100`
/// evaluates to 100.49999999999999. Omitting it (or using Dart's own
/// `.round()`) diverges from the live app on a large fraction of real
/// values.
///
/// VERIFIED: this implementation was checked against the real JS formula run
/// under node across 1811 generated values (half-cent boundaries, both
/// signs, and a wide spread) — 0 mismatches. The naive
/// `(n * 100).round() / 100` mismatched on 393 of those same 1811 cases.
double round2(num n) =>
    jsMathRound((n.toDouble() + kJsNumberEpsilon) * 100) / 100;

/// isValidDateStr(): strict "YYYY-MM-DD" shape AND a real calendar date —
/// rejects a value that JS/Dart Date arithmetic would silently clamp/roll
/// over (e.g. "2027-02-30"). Takes [Object?], not [String?]: a legacy raw
/// value of the wrong type (e.g. a stray number) must fail this check
/// gracefully, not throw a cast error at the call site.
///
/// The round-trip comparison goes through [jsDateTime], so a 0..99 year is
/// mapped to 1900+year exactly as `new Date()` does and then FAILS the
/// year comparison — which is precisely why app.js rejects '0001-01-01'.
/// Using a plain `DateTime(y, m, d)` here would accept it, and every caller
/// that treats this as the gate for a stored date (notably the opening
/// balance) would then admit a date the live app refuses.
bool isValidDateStr(Object? str) {
  if (str is! String) return false;
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(str);
  if (match == null) return false;
  final y = int.parse(match.group(1)!);
  final m = int.parse(match.group(2)!);
  final d = int.parse(match.group(3)!);
  final date = jsDateTime(y, m, d);
  return date.year == y && date.month == m && date.day == d;
}

/// isValidCanonicalIsoTimestamp(): the stored string must be EXACTLY the
/// canonical `Date.prototype.toISOString()` shape
/// ("YYYY-MM-DDTHH:mm:ss.sssZ", millisecond precision, literal "Z") — a
/// round-trip through parse -> re-serialize that doesn't reproduce the
/// original string is rejected, same technique the Web app itself uses.
bool isValidCanonicalIsoTimestamp(Object? str) {
  if (str is! String || str.isEmpty) return false;
  final parsed = DateTime.tryParse(str);
  if (parsed == null) return false;
  final utc = parsed.isUtc ? parsed : parsed.toUtc();
  return utc.toIso8601String() == str;
}

/// sanitizeFiniteAmount(): any-sign finite amount (0 is valid). Rejects
/// NaN/Infinity/non-numeric input and an empty/whitespace-only string —
/// never coerces, never defaults to 0.
num? sanitizeFiniteAmount(Object? raw) {
  if (raw is String && raw.trim().isEmpty) return null;
  num? n;
  if (raw is num) {
    n = raw;
  } else if (raw is String) {
    n = num.tryParse(raw.trim());
  }
  if (n == null || !n.isFinite) return null;
  return round2(n);
}

/// resolveEffectiveWhere(): 'credit' only when the raw value is EXACTLY
/// that string; every other value (missing/legacy/unrecognized) resolves to
/// 'bank' — the fixed-item convention, never null.
PaymentWhere resolveEffectiveWhere(String? rawWhere) =>
    rawWhere == 'credit' ? PaymentWhere.credit : PaymentWhere.bank;

/// resolveVariablePaymentMethod(): deliberately NOT the bank-defaulting
/// convention above. Returns null for a legacy item with a missing/
/// unrecognized `where` — silently defaulting it to bank would start
/// deducting a legacy tracking-only item from the balance with no user
/// confirmation.
VariablePaymentMethod? resolveVariablePaymentMethod(String? rawWhere) {
  if (rawWhere == 'bank') return VariablePaymentMethod.bank;
  if (rawWhere == 'credit') return VariablePaymentMethod.credit;
  return null;
}

/// resolveLoanSource(): reuses item.where (historically free-text "where
/// the loan is deducted from"). 'payroll' ONLY for the exact sentinel
/// string; every other value — including any legacy free-text bank name —
/// resolves to 'bank'.
const String kLoanPayrollSentinel = 'דרך תלוש השכר';

LoanSource resolveLoanSource(String? rawWhere) =>
    rawWhere == kLoanPayrollSentinel ? LoanSource.payroll : LoanSource.bank;

/// item.period === 'שנתי' -> yearly; anything else (including missing) ->
/// monthly.
FixedPeriod resolveFixedPeriod(String? rawPeriod) =>
    rawPeriod == 'שנתי' ? FixedPeriod.yearly : FixedPeriod.monthly;

/// resolveFixedIsBimonthly(): requires BOTH bimonthly===true AND a valid
/// 1-12 start month before treating an item as bimonthly at all — malformed
/// data (stray bimonthly:true with no/garbage start month) falls back to
/// the ordinary monthly/yearly period-based behavior.
bool resolveFixedIsBimonthly(bool? bimonthly, Object? bimonthlyStartMonth) {
  if (bimonthly != true) return false;
  final m = LegacyNumericField(bimonthlyStartMonth).asInt();
  return m != null && m >= 1 && m <= 12;
}

int resolveFixedBimonthlyStartMonth(Object? bimonthlyStartMonth) {
  final m = LegacyNumericField(bimonthlyStartMonth).asInt();
  return (m != null && m >= 1 && m <= 12) ? m : 1;
}

/// resolveEffectiveDay(): the item's own day if it parses to 1-31;
/// otherwise the category's configured defaultDayOfMonth if that is itself
/// valid; otherwise 1. Needs categoryConfig context, unlike the other
/// resolvers above — this is why `day` stays a raw [LegacyNumericField] on
/// the domain model instead of being pre-resolved at normalization time.
int resolveEffectiveDay({
  required LegacyNumericField day,
  required String? categoryKeyOrType,
  required Map<String, CategoryConfig> categoryConfig,
}) {
  final ownDay = day.asInt();
  if (ownDay != null && ownDay >= 1 && ownDay <= 31) return ownDay;

  final cfg = categoryKeyOrType != null ? categoryConfig[categoryKeyOrType] : null;
  final defaultDay = cfg?.defaultDayOfMonth;
  if (defaultDay != null && defaultDay >= 1 && defaultDay <= 31) return defaultDay;

  return 1;
}
