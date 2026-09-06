import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/raw/raw_item.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/domain/models/app_settings.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';
import 'package:familyfinance_pro/domain/normalization/item_normalizer.dart';

/// Data Layer Hardening — covers 3 required areas: (1) unknown raw item
/// field preservation, (2) settings parity for theme/primaryColor/fontSize,
/// (3) VERIFIED originalAmount behavior (no invented fallback).
void main() {
  group('1. Unknown raw field preservation (items)', () {
    test('an arbitrary unknown field survives load -> normalize -> modify -> save', () async {
      final store = InMemoryKeyValueStore({
        kDataKey: jsonEncode([
          {
            'id': 1, 'type': 'fixed', 'title': 'שכירות', 'amount': 3000,
            'isArchived': false, 'day': 5,
            'someFutureFieldNotYetModeled': {'nested': true, 'value': 42},
          },
        ]),
      });
      final repo = ItemsRepositoryImpl(store);

      final loaded = (await repo.loadAll()).valueOrNull!;
      final original = loaded.items.single as FixedItem;
      expect(original.extras['someFutureFieldNotYetModeled'], {'nested': true, 'value': 42});

      // Modify a KNOWN field (amount), constructing a new immutable instance
      // by hand (no copyWith exists yet — business-logic phase concern) but
      // carrying `extras` forward unchanged, exactly as a real mutation path
      // must.
      final modified = FixedItem(
        id: original.id,
        isArchived: original.isArchived,
        archiveReason: original.archiveReason,
        archivedAt: original.archivedAt,
        displayCategory: original.displayCategory,
        title: original.title,
        extras: original.extras,
        amount: 3500, // the change
        day: original.day,
        where: original.where,
        cardLast4: original.cardLast4,
        notes: original.notes,
        period: original.period,
        bimonthly: original.bimonthly,
        bimonthlyStartMonth: original.bimonthlyStartMonth,
      );
      await repo.saveAll([modified]);

      final reloaded = (await repo.loadAll()).valueOrNull!;
      final reloadedItem = reloaded.items.single as FixedItem;
      expect(reloadedItem.amount, 3500); // the known-field change persisted
      expect(
        reloadedItem.extras['someFutureFieldNotYetModeled'],
        {'nested': true, 'value': 42},
      ); // the unknown field was NOT dropped
    });

    test('customFields survives even though it has no current domain behavior', () {
      final raw = RawItemJson.fromJson({
        'id': 2, 'type': 'income', 'title': 'x', 'amount': 100,
        'customFields': {'note': 'hand-added by a user once'},
      });
      final item = normalizeItem(raw).item as IncomeItem;
      expect(item.extras['customFields'], {'note': 'hand-added by a user once'});

      final reRaw = itemToRawJson(item);
      expect(reRaw['customFields'], {'note': 'hand-added by a user once'});
    });

    test('an unknown NESTED array/object value is not silently discarded', () {
      final raw = RawItemJson.fromJson({
        'id': 3, 'type': 'dated', 'title': 'x', 'amount': 500,
        'weirdLegacyHistory': [
          {'at': '2025-01-01', 'note': 'a'},
          {'at': '2025-02-01', 'note': 'b'},
        ],
      });
      final item = normalizeItem(raw).item as DatedItem;
      final roundTripped = itemToRawJson(item);
      expect(roundTripped['weirdLegacyHistory'], [
        {'at': '2025-01-01', 'note': 'a'},
        {'at': '2025-02-01', 'note': 'b'},
      ]);
    });

    test('a rogue displayCategory on a cashWithdrawal (never modeled for this type) still survives', () {
      final raw = RawItemJson.fromJson({
        'id': 4, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
        'start': '2026-09-01', 'displayCategory': 'unexpected',
      });
      final item = normalizeItem(raw).item as CashWithdrawalItem;
      expect(item.displayCategory, isNull); // never modeled for this type
      expect(item.extras['displayCategory'], 'unexpected'); // but preserved

      final reRaw = itemToRawJson(item);
      expect(reRaw['displayCategory'], 'unexpected');
    });

    test('a known field takes precedence over a same-named extras entry', () {
      // Cannot arise from normalizeItem() itself (recognized keys are never
      // copied into extras), but itemToRawJson()'s overlay order must still
      // be robust if a FinanceItem is ever hand-constructed with
      // contradictory extras.
      const item = DatedItem(
        id: IntItemId(5),
        isArchived: false,
        title: 'x',
        extras: {'amount': 999}, // contradicts the modeled field below
        amount: 250,
      );
      final raw = itemToRawJson(item);
      expect(raw['amount'], 250); // modeled field wins
    });
  });

  group('2. Settings parity — theme/primaryColor/fontSize', () {
    test('a well-formed string value round-trips normally', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({'theme': 'dark'}),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.theme.asStringOr('system'), 'dark');
    });

    test('VERIFIED (app.js loadAppSettings): a present non-string value is carried through, not coerced to the default', () {
      // app.js's merge loop: `if (parsed[k] !== undefined && parsed[k] !== null) merged[k] = parsed[k];`
      // — no typeof check. A stray non-string is copied through as-is.
      const field = LegacyStringField(1234);
      expect(field.raw, 1234);
      expect(field.asStringOr('system'), 'system'); // safe display fallback
    });

    test('an unrelated settings save does NOT destroy a malformed legacy theme value', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({'theme': 1234, 'pinEnabled': false}),
      });
      final repo = SettingsRepositoryImpl(store);
      final settings = await repo.load();
      expect(settings.theme.raw, 1234); // preserved raw, not coerced

      // Simulate an unrelated change (toggling pinEnabled) and save.
      final updated = AppSettings(
        theme: settings.theme, // untouched
        primaryColor: settings.primaryColor,
        fontSize: settings.fontSize,
        pinHash: settings.pinHash,
        pinEnabled: true, // the actual change
        autoLockMinutes: settings.autoLockMinutes,
        openingBalance: settings.openingBalance,
        notifications: settings.notifications,
        experimentalFlags: settings.experimentalFlags,
        creditCardSettlementUpdatedAt: settings.creditCardSettlementUpdatedAt,
        legacy: settings.legacy,
        extras: settings.extras,
      );
      await repo.save(updated);

      final raw = jsonDecode((await store.getString(kSettingsKey))!) as Map;
      expect(raw['theme'], 1234); // still there, untouched
      expect(raw['pinEnabled'], true); // the unrelated change did apply
    });

    test('a missing theme falls back to the default string', () async {
      final settings = await SettingsRepositoryImpl(InMemoryKeyValueStore()).load();
      expect(settings.theme.asStringOr('system'), 'system');
    });

    test('an unknown top-level settings key survives an unrelated save', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({'theme': 'dark', 'someFutureSetting': 'kept'}),
      });
      final repo = SettingsRepositoryImpl(store);
      final settings = await repo.load();
      expect(settings.extras['someFutureSetting'], 'kept');

      await repo.save(settings);
      final raw = jsonDecode((await store.getString(kSettingsKey))!) as Map;
      expect(raw['someFutureSetting'], 'kept');
    });
  });

  group('3. VERIFIED originalAmount behavior (no invented fallback)', () {
    test('loan: a missing originalAmount is preserved as raw null, not defaulted here', () {
      final raw = RawItemJson.fromJson({
        'id': 6, 'type': 'loan', 'title': 'הלוואה', 'amount': 500,
      });
      final item = normalizeItem(raw).item as LoanItem;
      expect(item.originalAmount.raw, isNull);
      expect(item.originalAmount.asNum(), isNull);
      // The VERIFIED app.js:902 fallback to 0 is a business-logic concern
      // (getLoanRemainingBalance) — NOT applied at normalization time. A
      // future port of that function is responsible for
      // `item.originalAmount.asNum() ?? 0` at the point it actually needs it.
    });

    test('loan: a malformed (non-numeric) originalAmount is preserved raw, not silently zeroed', () {
      final raw = RawItemJson.fromJson({
        'id': 7, 'type': 'loan', 'title': 'הלוואה', 'amount': 500,
        'originalAmount': 'not-a-number',
      });
      final item = normalizeItem(raw).item as LoanItem;
      expect(item.originalAmount.raw, 'not-a-number');
      expect(item.originalAmount.asNum(), isNull);
    });

    test('loan: a well-formed originalAmount parses normally', () {
      final raw = RawItemJson.fromJson({
        'id': 8, 'type': 'loan', 'title': 'הלוואה', 'amount': 500,
        'originalAmount': 24000,
      });
      final item = normalizeItem(raw).item as LoanItem;
      expect(item.originalAmount.asNum(), 24000);
    });

    test('variable: a missing originalAmount is preserved as raw null (no verified fallback exists at all)', () {
      final raw = RawItemJson.fromJson({
        'id': 9, 'type': 'variable', 'title': 'תשלום', 'amount': 200,
      });
      final item = normalizeItem(raw).item as VariableItem;
      expect(item.originalAmount.raw, isNull);
      // Unlike loan, there is no verified calculation anywhere in app.js
      // that reads a variable item's originalAmount — it is UI-display-only
      // (`item.originalAmount || ''`). This data layer must not invent one.
    });

    test('originalAmount round-trips through itemToRawJson unchanged when malformed', () {
      final raw = RawItemJson.fromJson({
        'id': 10, 'type': 'loan', 'title': 'x', 'amount': 500,
        'originalAmount': 'garbage',
      });
      final item = normalizeItem(raw).item as LoanItem;
      final reRaw = itemToRawJson(item);
      expect(reRaw['originalAmount'], 'garbage');
    });
  });
}
