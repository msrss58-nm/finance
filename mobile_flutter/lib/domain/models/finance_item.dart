import '../../core/types/item_id.dart';
import '../../core/types/legacy_numeric_field.dart';
import '../../core/types/legacy_string_field.dart';
import '../../core/types/safe_cast.dart';
import '../normalization/legacy_resolvers.dart';
import 'enums.dart';

/// `day` / `total` / `interest` are kept as [LegacyNumericField] rather than
/// pre-resolved numbers: resolving `day` to an "effective" value needs
/// categoryConfig context the item alone doesn't have (see
/// legacy_resolvers.dart's resolveEffectiveDay port), so this data layer
/// defers that resolution to call time instead of guessing here.
///
/// [extras] holds every raw JSON field this data layer does not model at
/// all for the item's type (a genuinely unknown future field, or the
/// vestigial-but-still-possibly-present `customFields`) — captured on load
/// (ItemNormalizer) and re-emitted verbatim on save (itemToRawJson), so a
/// load -> modify-a-known-field -> save round trip can never silently drop
/// data this data layer simply doesn't have an opinion about. This keeps
/// the modeled fields above clean (no domain code ever inspects [extras])
/// while still being lossless.
sealed class FinanceItem {
  final ItemId id;
  final bool isArchived;
  final ArchiveReason? archiveReason;
  final String? archivedAt;
  final String? displayCategory;
  final String title;
  final Map<String, Object?> extras;

  const FinanceItem({
    required this.id,
    required this.isArchived,
    this.archiveReason,
    this.archivedAt,
    this.displayCategory,
    required this.title,
    this.extras = const {},
  });

  ItemType get type;
}

final class IncomeItem extends FinanceItem {
  final num amount;
  final LegacyNumericField day;

  const IncomeItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    super.displayCategory,
    required super.title,
    super.extras,
    required this.amount,
    required this.day,
  });

  @override
  ItemType get type => ItemType.income;
}

final class FixedItem extends FinanceItem {
  final num amount;
  final LegacyNumericField day;

  /// The RAW stored `where` value, preserved verbatim — including an
  /// unrecognized free-form legacy string such as 'כרטיס אשראי'. Calculations
  /// must read [effectiveWhere]; serialization must write this raw value, so
  /// that a save triggered by an unrelated edit can never rewrite a legacy
  /// value to 'bank'. Same principle as [LegacyNumericField] for day/total
  /// and [LegacyStringField] for the theme/primaryColor/fontSize settings.
  final LegacyStringField where;

  /// Resolved for calculation: 'credit' ONLY on an exact match, bank for
  /// every other value (missing/legacy/unrecognized) — the VERIFIED
  /// resolveEffectiveWhere() semantics, unchanged.
  PaymentWhere get effectiveWhere =>
      resolveEffectiveWhere(asStringOrNull(where.raw));

  final String? cardLast4;
  final String? notes;
  /// Resolved via the raw `period` string check (`=== 'שנתי'` -> yearly,
  /// anything else -> monthly) — never null.
  final FixedPeriod period;
  final bool bimonthly;
  final int? bimonthlyStartMonth;

  const FixedItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    super.displayCategory,
    required super.title,
    super.extras,
    required this.amount,
    required this.day,
    required this.where,
    this.cardLast4,
    this.notes,
    required this.period,
    required this.bimonthly,
    this.bimonthlyStartMonth,
  });

  @override
  ItemType get type => ItemType.fixed;
}

final class VariableItem extends FinanceItem {
  /// VERIFIED (app.js:902, getLoanRemainingBalance — loan-only): the ONLY
  /// place in app.js that reads originalAmount for a calculation resolves a
  /// missing/non-numeric value to 0. No equivalent calculation exists for
  /// 'variable' items anywhere in app.js — originalAmount is read only for
  /// UI pre-fill (`item.originalAmount || ''`). Kept as a raw
  /// [LegacyNumericField], NOT defaulted to 0 or to `amount` here: baking a
  /// loan-specific fallback into a field shared with a type that has no
  /// verified fallback at all would be inventing a rule, which this data
  /// layer must not do. The eventual business-logic port decides.
  final LegacyNumericField originalAmount;
  final num amount;
  final LegacyNumericField day;
  final LegacyNumericField total;
  final String? start;

  /// RAW stored value, preserved verbatim (see [FixedItem.where]). For
  /// variable items the loss was even starker before this was raw: an
  /// unrecognized value resolved to null and the key was then DROPPED
  /// entirely on save.
  final LegacyStringField where;

  /// Resolved for calculation. null for a legacy item with a missing or
  /// unrecognized `where` — tracking-only, and NEVER silently promoted to
  /// bank.
  VariablePaymentMethod? get paymentMethod =>
      resolveVariablePaymentMethod(asStringOrNull(where.raw));

  final String? cardLast4;

  const VariableItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    super.displayCategory,
    required super.title,
    super.extras,
    required this.originalAmount,
    required this.amount,
    required this.day,
    required this.total,
    this.start,
    required this.where,
    this.cardLast4,
  });

  @override
  ItemType get type => ItemType.variable;
}

final class LoanItem extends FinanceItem {
  /// VERIFIED (app.js:902, getLoanRemainingBalance): `(typeof
  /// it.originalAmount === 'number' && !isNaN(it.originalAmount)) ?
  /// it.originalAmount : 0` — the exact, sole call site that resolves a
  /// missing/malformed originalAmount for a loan, and it resolves to 0, NOT
  /// to `amount`. Kept as a raw [LegacyNumericField] here rather than
  /// baking that 0-fallback into normalization time: getLoanRemainingBalance
  /// itself is amortization business logic (out of scope for this phase —
  /// see CLAUDE.md's Business Logic Port phase), so the fallback belongs in
  /// that port, applied at read time, exactly where app.js applies it —
  /// not silently pre-applied here where every other consumer of this field
  /// would inherit it unconditionally.
  final LegacyNumericField originalAmount;
  final num amount;

  /// RAW stored value, preserved verbatim. A loan's `where` is historically
  /// FREE TEXT (the bank name the user typed, e.g. 'בנק הפועלים') — before
  /// this was raw, any non-payroll value was dropped entirely on save, which
  /// is the most destructive case of this whole class of bug.
  final LegacyStringField where;

  /// Resolved for calculation: payroll ONLY for the exact Hebrew sentinel
  /// string, bank for every other value — never null.
  LoanSource get source => resolveLoanSource(asStringOrNull(where.raw));

  final LegacyNumericField interest;
  final LegacyNumericField day;
  final LegacyNumericField total;
  final String? start;

  const LoanItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    super.displayCategory,
    required super.title,
    super.extras,
    required this.originalAmount,
    required this.amount,
    this.where = const LegacyStringField(null),
    required this.interest,
    required this.day,
    required this.total,
    this.start,
  });

  @override
  ItemType get type => ItemType.loan;
}

final class DatedItem extends FinanceItem {
  final num amount;
  final String? start;

  /// RAW stored value, preserved verbatim (see [FixedItem.where]). A one-time
  /// dated charge carries a payment method exactly like a fixed item does —
  /// the edit form writes `where`/`cardLast4`.
  ///
  /// NOTE: the BUILT-IN credit-card settlement is exempt from the credit
  /// exclusion regardless of this value — see isBuiltinCreditCardSettlement,
  /// which keys off the category, never off `where`.
  final LegacyStringField where;

  /// Resolved for calculation — same bank-defaulting rule as [FixedItem].
  PaymentWhere get effectiveWhere =>
      resolveEffectiveWhere(asStringOrNull(where.raw));

  final String? cardLast4;
  final String? notes;

  const DatedItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    super.displayCategory,
    required super.title,
    super.extras,
    required this.amount,
    this.start,
    this.where = const LegacyStringField(null),
    this.cardLast4,
    this.notes,
  });

  @override
  ItemType get type => ItemType.dated;
}

/// No displayCategory (the Web app never sets one for this type) and no
/// `day` field.
final class CashWithdrawalItem extends FinanceItem {
  final num amount;
  final String? start;
  final String? notes;

  const CashWithdrawalItem({
    required super.id,
    required super.isArchived,
    super.archiveReason,
    super.archivedAt,
    required super.title,
    super.extras,
    required this.amount,
    this.start,
    this.notes,
  }) : super(displayCategory: null);

  @override
  ItemType get type => ItemType.cashWithdrawal;
}
