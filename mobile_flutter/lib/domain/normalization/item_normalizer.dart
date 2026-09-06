import '../../core/errors/data_errors.dart';
import '../../core/types/item_id.dart';
import '../../core/types/legacy_numeric_field.dart';
import '../../core/types/legacy_string_field.dart';
import '../../core/types/safe_cast.dart';
import '../../data/raw/raw_item.dart';
import '../models/enums.dart';
import '../models/finance_item.dart';
import 'legacy_resolvers.dart';

/// Keys each item type's [FinanceItem] subtype actually models. Anything in
/// a raw item's JSON object NOT in the relevant set here is an
/// unknown/unmodeled field and is captured into [FinanceItem.extras]
/// instead of being silently discarded — see `_extrasFor` below.
///
/// 'displayCategory' is deliberately excluded from [_cashWithdrawalKeys]:
/// CashWithdrawalItem never models it (always null — the Web app never sets
/// one for this type), so if a raw record ever carried one anyway, it must
/// still survive via extras rather than vanish on the next save.
const Set<String> _commonKeys = {
  'id', 'type', 'isArchived', 'archiveReason', 'archivedAt',
  'displayCategory', 'title',
};
final Set<String> _incomeKeys = {..._commonKeys, 'amount', 'day'};
final Set<String> _fixedKeys = {
  ..._commonKeys, 'amount', 'day', 'where', 'cardLast4', 'notes', 'period',
  'bimonthly', 'bimonthlyStartMonth',
};
final Set<String> _variableKeys = {
  ..._commonKeys, 'amount', 'originalAmount', 'day', 'total', 'start',
  'where', 'cardLast4',
};
final Set<String> _loanKeys = {
  ..._commonKeys, 'amount', 'originalAmount', 'where', 'interest', 'day',
  'total', 'start',
};
final Set<String> _datedKeys = {
  ..._commonKeys, 'amount', 'start', 'where', 'cardLast4', 'notes',
};
final Set<String> _cashWithdrawalKeys = {
  'id', 'type', 'isArchived', 'archiveReason', 'archivedAt', 'title',
  'amount', 'start', 'notes',
};

Map<String, Object?> _extrasFor(RawItemJson raw, Set<String> recognizedKeys) => {
      for (final entry in raw.raw.entries)
        if (!recognizedKeys.contains(entry.key)) entry.key: entry.value,
    };

class ItemNormalizationResult {
  final FinanceItem? item;
  final List<UnknownLegacyValueNotice> diagnostics;
  final String? error;
  const ItemNormalizationResult({
    this.item,
    this.diagnostics = const [],
    this.error,
  });
}

/// Raw -> Domain for one `family_finance_data` entry.
///
/// An item is treated as genuinely unparseable (returns `item: null`) only
/// when it lacks the two things every calculation path unconditionally
/// depends on: a usable `id` and a numeric `amount`. Everything else
/// (day/total/interest typing, where/period/source values, missing
/// title/notes/cardLast4) is resolved permissively via the same lazy
/// fallbacks legacy_resolvers.dart ports from the Web app — never a reason
/// to drop the item.
ItemNormalizationResult normalizeItem(RawItemJson raw) {
  final diagnostics = <UnknownLegacyValueNotice>[];

  final ItemId id;
  try {
    id = ItemId.fromJson(raw.id);
  } catch (_) {
    return ItemNormalizationResult(
      error: 'item missing a usable id (raw id: ${raw.id})',
    );
  }

  final title = raw.title ?? '';
  final isArchived = raw.isArchived;
  final archiveReason = _parseArchiveReason(raw.archiveReason, id, diagnostics);
  final displayCategory = raw.displayCategory;
  final archivedAt = raw.archivedAt;

  switch (raw.type) {
    case 'income':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'income item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: IncomeItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          displayCategory: displayCategory,
          title: title,
          extras: _extrasFor(raw, _incomeKeys),
          amount: amount,
          day: LegacyNumericField(raw.day),
        ),
      );

    case 'fixed':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'fixed item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      if (raw.where != null && raw.where != 'bank' && raw.where != 'credit') {
        diagnostics.add(UnknownLegacyValueNotice(
          field: 'where',
          rawValue: raw.where,
          context: 'fixed item ${id.toJson()}',
        ));
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: FixedItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          displayCategory: displayCategory,
          title: title,
          extras: _extrasFor(raw, _fixedKeys),
          amount: amount,
          day: LegacyNumericField(raw.day),
          // RAW, never the resolved enum — see FixedItem.where.
          where: LegacyStringField(raw['where']),
          cardLast4: raw.cardLast4,
          notes: raw.notes,
          period: resolveFixedPeriod(raw.period),
          bimonthly: resolveFixedIsBimonthly(raw.bimonthly, raw.bimonthlyStartMonth),
          bimonthlyStartMonth: raw.bimonthly == true
              ? resolveFixedBimonthlyStartMonth(raw.bimonthlyStartMonth)
              : null,
        ),
      );

    case 'variable':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'variable item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      if (raw.where != null && raw.where != 'bank' && raw.where != 'credit') {
        diagnostics.add(UnknownLegacyValueNotice(
          field: 'where',
          rawValue: raw.where,
          context: 'variable item ${id.toJson()}',
        ));
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: VariableItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          displayCategory: displayCategory,
          title: title,
          extras: _extrasFor(raw, _variableKeys),
          // No verified fallback for 'variable' — see VariableItem.originalAmount
          // doc comment. Kept raw, never defaulted to 0 or to `amount`.
          originalAmount: LegacyNumericField(raw.originalAmount),
          amount: amount,
          day: LegacyNumericField(raw.day),
          total: LegacyNumericField(raw.total),
          start: asStringOrNull(raw.start),
          // RAW. Resolution to a (possibly null) payment method happens in
          // VariableItem.paymentMethod — a legacy item with no/unrecognized
          // `where` still resolves to null there, exactly as it must, but the
          // original string is no longer destroyed on save.
          where: LegacyStringField(raw['where']),
          cardLast4: raw.cardLast4,
        ),
      );

    case 'loan':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'loan item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: LoanItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          displayCategory: displayCategory,
          title: title,
          extras: _extrasFor(raw, _loanKeys),
          // VERIFIED app.js:902 fallback (0, loan-only business logic) is
          // NOT applied here — see LoanItem.originalAmount doc comment.
          originalAmount: LegacyNumericField(raw.originalAmount),
          amount: amount,
          // RAW — a loan's `where` is free text (a typed bank name).
          where: LegacyStringField(raw['where']),
          interest: LegacyNumericField(raw.interest),
          day: LegacyNumericField(raw.day),
          total: LegacyNumericField(raw.total),
          start: asStringOrNull(raw.start),
        ),
      );

    case 'dated':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'dated item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: DatedItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          displayCategory: displayCategory,
          title: title,
          extras: _extrasFor(raw, _datedKeys),
          amount: amount,
          start: asStringOrNull(raw.start),
          // RAW — same preservation rule as FixedItem.
          where: LegacyStringField(raw['where']),
          cardLast4: raw.cardLast4,
          notes: raw.notes,
        ),
      );

    case 'cashWithdrawal':
      final amount = LegacyNumericField(raw.amount).asNum();
      if (amount == null) {
        return ItemNormalizationResult(
          error: 'cashWithdrawal item ${id.toJson()} has a non-numeric amount: ${raw.amount}',
        );
      }
      return ItemNormalizationResult(
        diagnostics: diagnostics,
        item: CashWithdrawalItem(
          id: id,
          isArchived: isArchived,
          archiveReason: archiveReason,
          archivedAt: archivedAt,
          title: title,
          extras: _extrasFor(raw, _cashWithdrawalKeys),
          amount: amount,
          start: asStringOrNull(raw.start),
          notes: raw.notes,
        ),
      );

    default:
      return ItemNormalizationResult(
        error: 'item ${id.toJson()} has an unrecognized type: ${raw.type}',
      );
  }
}

ArchiveReason? _parseArchiveReason(
  String? raw,
  ItemId id,
  List<UnknownLegacyValueNotice> diagnostics,
) {
  if (raw == null) return null;
  if (raw == 'manual') return ArchiveReason.manual;
  if (raw == 'completed') return ArchiveReason.completed;
  diagnostics.add(UnknownLegacyValueNotice(
    field: 'archiveReason',
    rawValue: raw,
    context: 'item ${id.toJson()}',
  ));
  return null;
}

/// Domain -> Raw, the reverse direction ItemsRepository.saveAll() needs to
/// write a full replacement array back to storage.
///
/// Starts from [FinanceItem.extras] — every field this data layer doesn't
/// model at all for this item's type — and overlays the modeled fields on
/// top. This is what makes a load -> normalize -> modify-a-known-field ->
/// save round trip lossless for unknown fields (including `customFields`,
/// which has no modeled behavior anywhere and therefore always lands in
/// extras): nothing about this function's structure can omit them, they are
/// the base the modeled fields are layered onto, not something added
/// afterward that could be forgotten.
Map<String, Object?> itemToRawJson(FinanceItem item) {
  final map = <String, Object?>{
    ...item.extras,
    'id': item.id.toJson(),
    'type': item.type.name,
    'isArchived': item.isArchived,
    if (item.archiveReason != null) 'archiveReason': item.archiveReason!.name,
    if (item.archivedAt != null) 'archivedAt': item.archivedAt,
    if (item.displayCategory != null) 'displayCategory': item.displayCategory,
    'title': item.title,
  };

  switch (item) {
    case IncomeItem i:
      map['amount'] = i.amount;
      map['day'] = i.day.toJson();
    case FixedItem f:
      map['amount'] = f.amount;
      map['day'] = f.day.toJson();
      // Write back exactly what was stored. Omitting the key when nothing
      // was stored is also faithful: resolveEffectiveWhere(null) is bank,
      // identical to writing 'bank', but it does not invent a key the
      // original record never had.
      if (f.where.raw != null) map['where'] = f.where.raw;
      if (f.cardLast4 != null) map['cardLast4'] = f.cardLast4;
      if (f.notes != null) map['notes'] = f.notes;
      map['period'] = f.period == FixedPeriod.yearly ? 'שנתי' : 'חודשי';
      map['bimonthly'] = f.bimonthly;
      if (f.bimonthlyStartMonth != null) {
        map['bimonthlyStartMonth'] = f.bimonthlyStartMonth;
      }
    case VariableItem v:
      map['originalAmount'] = v.originalAmount.toJson();
      map['amount'] = v.amount;
      map['day'] = v.day.toJson();
      map['total'] = v.total.toJson();
      if (v.start != null) map['start'] = v.start;
      if (v.where.raw != null) map['where'] = v.where.raw;
      if (v.cardLast4 != null) map['cardLast4'] = v.cardLast4;
    case LoanItem l:
      map['originalAmount'] = l.originalAmount.toJson();
      map['amount'] = l.amount;
      if (l.where.raw != null) map['where'] = l.where.raw;
      map['interest'] = l.interest.toJson();
      map['day'] = l.day.toJson();
      map['total'] = l.total.toJson();
      if (l.start != null) map['start'] = l.start;
    case DatedItem d:
      map['amount'] = d.amount;
      if (d.start != null) map['start'] = d.start;
      if (d.where.raw != null) map['where'] = d.where.raw;
      if (d.cardLast4 != null) map['cardLast4'] = d.cardLast4;
      if (d.notes != null) map['notes'] = d.notes;
    case CashWithdrawalItem c:
      map['amount'] = c.amount;
      if (c.start != null) map['start'] = c.start;
      if (c.notes != null) map['notes'] = c.notes;
  }
  return map;
}
