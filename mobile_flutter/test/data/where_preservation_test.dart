import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/raw/raw_item.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/domain/cashflow/cashflow_engine.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';
import 'package:familyfinance_pro/domain/normalization/item_normalizer.dart';

/// MILESTONE 2 BLOCKER: a legacy free-form `where` value (e.g. the Hebrew
/// string 'כרטיס אשראי' a user typed before the field became a two-option
/// select) resolved to `bank` for calculation AND was then written back as
/// the literal 'bank' — destroying the stored value on any unrelated save.
/// For loan/variable items it was worse: the key was dropped entirely.
///
/// The fix stores the RAW value ([LegacyStringField]) and derives the
/// resolved value on read, exactly as day/total/interest already do.

const _legacyWhere = 'כרטיס אשראי'; // free-form, NOT 'bank'/'credit'
final _cfg = kDefaultCategoryConfig;

/// Load -> normalize -> modify ONE unrelated known field -> save, returning
/// the re-serialized raw JSON. This is the exact sequence the blocker
/// describes.
Map<String, Object?> _roundTripWithUnrelatedEdit(Map<String, Object?> stored) {
  final item = normalizeItem(RawItemJson.fromJson(stored)).item!;
  final edited = switch (item) {
    FixedItem i => FixedItem(
        id: i.id, isArchived: i.isArchived, archiveReason: i.archiveReason,
        archivedAt: i.archivedAt, displayCategory: i.displayCategory,
        title: 'RENAMED', // <- the unrelated change
        extras: i.extras, amount: i.amount, day: i.day, where: i.where,
        cardLast4: i.cardLast4, notes: i.notes, period: i.period,
        bimonthly: i.bimonthly, bimonthlyStartMonth: i.bimonthlyStartMonth,
      ),
    DatedItem i => DatedItem(
        id: i.id, isArchived: i.isArchived, archiveReason: i.archiveReason,
        archivedAt: i.archivedAt, displayCategory: i.displayCategory,
        title: 'RENAMED',
        extras: i.extras, amount: i.amount, start: i.start, where: i.where,
        cardLast4: i.cardLast4, notes: i.notes,
      ),
    VariableItem i => VariableItem(
        id: i.id, isArchived: i.isArchived, archiveReason: i.archiveReason,
        archivedAt: i.archivedAt, displayCategory: i.displayCategory,
        title: 'RENAMED',
        extras: i.extras, originalAmount: i.originalAmount, amount: i.amount,
        day: i.day, total: i.total, start: i.start, where: i.where,
        cardLast4: i.cardLast4,
      ),
    LoanItem i => LoanItem(
        id: i.id, isArchived: i.isArchived, archiveReason: i.archiveReason,
        archivedAt: i.archivedAt, displayCategory: i.displayCategory,
        title: 'RENAMED',
        extras: i.extras, originalAmount: i.originalAmount, amount: i.amount,
        where: i.where, interest: i.interest, day: i.day, total: i.total,
        start: i.start,
      ),
    _ => item,
  };
  return itemToRawJson(edited);
}

void main() {
  group('1. legacy free-form `where` survives an unrelated edit + save', () {
    test('FIXED: where=\'כרטיס אשראי\' survives byte-for-value', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 1, 'type': 'fixed', 'isArchived': false, 'title': 'שכירות',
        'amount': 3000, 'day': 5, 'where': _legacyWhere,
      });
      expect(out['where'], _legacyWhere); // NOT rewritten to 'bank'
      expect(out['title'], 'RENAMED'); // the unrelated edit did apply
    });

    test('DATED: where=\'כרטיס אשראי\' survives byte-for-value', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 2, 'type': 'dated', 'isArchived': false, 'title': 'חיוב',
        'amount': 300, 'start': '2026-02-14', 'displayCategory': 'purchase',
        'where': _legacyWhere,
      });
      expect(out['where'], _legacyWhere);
      expect(out['title'], 'RENAMED');
    });

    test('VARIABLE: a legacy value survives (previously the key was DROPPED)', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 3, 'type': 'variable', 'isArchived': false, 'title': 'מקרר',
        'amount': 350, 'day': 5, 'total': 10, 'start': '2026-01-01',
        'where': _legacyWhere,
      });
      expect(out.containsKey('where'), isTrue);
      expect(out['where'], _legacyWhere);
    });

    test('LOAN: free-text bank name survives (previously the key was DROPPED)', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 4, 'type': 'loan', 'isArchived': false, 'title': 'הלוואה',
        'amount': 500, 'day': 10, 'total': 12, 'start': '2026-01-20',
        'where': 'בנק הפועלים',
      });
      expect(out.containsKey('where'), isTrue);
      expect(out['where'], 'בנק הפועלים');
    });

    test('an absent `where` is not INVENTED on save', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 5, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5,
      });
      expect(out.containsKey('where'), isFalse);
    });
  });

  group('2. recognized values still round-trip unchanged', () {
    test('valid bank remains bank', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 6, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5, 'where': 'bank',
      });
      expect(out['where'], 'bank');
    });

    test('valid credit remains credit', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 7, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5, 'where': 'credit',
      });
      expect(out['where'], 'credit');
    });

    test('dated credit remains credit', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 8, 'type': 'dated', 'isArchived': false, 'title': 'x',
        'amount': 100, 'start': '2026-02-14', 'displayCategory': 'purchase',
        'where': 'credit',
      });
      expect(out['where'], 'credit');
    });

    test('the payroll sentinel survives exactly', () {
      final out = _roundTripWithUnrelatedEdit({
        'id': 9, 'type': 'loan', 'isArchived': false, 'title': 'x',
        'amount': 500, 'day': 10, 'total': 12, 'start': '2026-01-20',
        'where': 'דרך תלוש השכר',
      });
      expect(out['where'], 'דרך תלוש השכר');
    });
  });

  group('3. calculations for unknown legacy values match app.js semantics', () {
    test('FIXED legacy value still RESOLVES to bank (resolveEffectiveWhere)', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 10, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5, 'where': _legacyWhere,
      })).item as FixedItem;
      // Raw preserved, but the CALCULATION view is unchanged: bank.
      expect(item.where.raw, _legacyWhere);
      expect(item.effectiveWhere, PaymentWhere.bank);
    });

    test('DATED legacy value still resolves to bank', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 11, 'type': 'dated', 'isArchived': false, 'title': 'x',
        'amount': 100, 'start': '2026-02-14', 'where': _legacyWhere,
      })).item as DatedItem;
      expect(item.effectiveWhere, PaymentWhere.bank);
    });

    test('VARIABLE legacy value still resolves to NULL — never promoted to bank', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 12, 'type': 'variable', 'isArchived': false, 'title': 'x',
        'amount': 350, 'day': 5, 'total': 10, 'start': '2026-01-01',
        'where': _legacyWhere,
      })).item as VariableItem;
      expect(item.where.raw, _legacyWhere);
      expect(item.paymentMethod, isNull);
    });

    test('LOAN free-text value still resolves to bank (only the exact sentinel is payroll)', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 13, 'type': 'loan', 'isArchived': false, 'title': 'x',
        'amount': 500, 'where': 'בנק הפועלים',
      })).item as LoanItem;
      expect(item.source, LoanSource.bank);
    });

    test('a legacy FIXED item still GENERATES a bank event (resolves to bank)', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 14, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5, 'where': _legacyWhere,
      })).item as FixedItem;
      final evs = generateCashflowEvents([item], DateTime(2026, 1, 1),
          monthsCount: 1, categoryConfig: _cfg);
      expect(evs.length, 1);
      expect(evs.single.amount, -100);
    });

    test('a legacy VARIABLE item still generates NOTHING (tracking-only)', () {
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 15, 'type': 'variable', 'isArchived': false, 'title': 'x',
        'amount': 350, 'day': 5, 'total': 10, 'start': '2026-01-01',
        'where': _legacyWhere,
      })).item as VariableItem;
      final evs = generateCashflowEvents([item], DateTime(2026, 1, 1),
          monthsCount: 6, categoryConfig: _cfg);
      expect(evs, isEmpty);
    });
  });

  group('4. no regression in credit-card exactly-once', () {
    test('credit fixed + built-in settlement => exactly ONE bank event', () {
      final creditFixed = normalizeItem(RawItemJson.fromJson({
        'id': 20, 'type': 'fixed', 'isArchived': false, 'title': 'ביטוח',
        'amount': 640, 'day': 5, 'where': 'credit',
      })).item!;
      final settlement = normalizeItem(RawItemJson.fromJson({
        'id': 21, 'type': 'dated', 'isArchived': false, 'title': 'חיוב אשראי',
        'amount': 2000, 'start': '2026-01-10', 'displayCategory': 'dated',
      })).item!;
      final evs = generateCashflowEvents([creditFixed, settlement],
          DateTime(2026, 1, 1), monthsCount: 1, categoryConfig: _cfg);
      expect(evs.length, 1);
      expect(evs.single.amount, -2000); // the settlement, not the purchase
    });

    test('the settlement counts even when it carries a legacy free-form where', () {
      // isBuiltinCreditCardSettlement keys off the CATEGORY, never `where`.
      final settlement = normalizeItem(RawItemJson.fromJson({
        'id': 22, 'type': 'dated', 'isArchived': false, 'title': 'חיוב אשראי',
        'amount': 2000, 'start': '2026-01-10', 'displayCategory': 'dated',
        'where': _legacyWhere,
      })).item!;
      expect(isBuiltinCreditCardSettlement(settlement), isTrue);
      final evs = generateCashflowEvents([settlement], DateTime(2026, 1, 1),
          monthsCount: 1, categoryConfig: _cfg);
      expect(evs.length, 1);
    });

    test('a credit-marked purchase still generates nothing after the change', () {
      final creditDated = normalizeItem(RawItemJson.fromJson({
        'id': 23, 'type': 'dated', 'isArchived': false, 'title': 'רכישה',
        'amount': 300, 'start': '2026-01-14', 'displayCategory': 'purchase',
        'where': 'credit',
      })).item!;
      final evs = generateCashflowEvents([creditDated], DateTime(2026, 1, 1),
          monthsCount: 1, categoryConfig: _cfg);
      expect(evs, isEmpty);
    });
  });

  group('5. full repository round trip preserves the raw value', () {
    test('save/load through ItemsRepository keeps the legacy string', () async {
      final store = InMemoryKeyValueStore({
        kDataKey: jsonEncode([
          {
            'id': 30, 'type': 'fixed', 'isArchived': false, 'title': 'שכירות',
            'amount': 3000, 'day': 5, 'where': _legacyWhere,
          },
        ]),
      });
      final repo = ItemsRepositoryImpl(store);
      final loaded = (await repo.loadAll()).valueOrNull!;
      await repo.saveAll(loaded.items);

      final persisted =
          (jsonDecode((await store.getString(kDataKey))!) as List).single as Map;
      expect(persisted['where'], _legacyWhere);
    });
  });

  group('6. an explicit payment-method change DOES replace the raw value', () {
    test('replacing `where` with an explicit choice overwrites the legacy string', () {
      // Requirement 4: a deliberate user change may replace the stored value;
      // only UNRELATED saves must leave it alone.
      final item = normalizeItem(RawItemJson.fromJson({
        'id': 40, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': 5, 'where': _legacyWhere,
      })).item as FixedItem;
      final changed = FixedItem(
        id: item.id, isArchived: item.isArchived, title: item.title,
        extras: item.extras, amount: item.amount, day: item.day,
        where: const LegacyStringField('credit'), // explicit user choice
        cardLast4: item.cardLast4, notes: item.notes, period: item.period,
        bimonthly: item.bimonthly,
      );
      expect(itemToRawJson(changed)['where'], 'credit');
      expect(changed.effectiveWhere, PaymentWhere.credit);
    });
  });

  group('7. the raw value is never used as a calculation shortcut', () {
    test('an item constructed with no where at all behaves as bank', () {
      const item = FixedItem(
        id: IntItemId(50), isArchived: false, title: 'x', amount: 100,
        day: LegacyNumericField(5), where: LegacyStringField(null),
        period: FixedPeriod.monthly, bimonthly: false,
      );
      expect(item.effectiveWhere, PaymentWhere.bank);
      expect(itemToRawJson(item).containsKey('where'), isFalse);
    });
  });
}
