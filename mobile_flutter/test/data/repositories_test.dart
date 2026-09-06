import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/data/backup/backup_service.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/raw/raw_backup_envelope.dart';
import 'package:familyfinance_pro/data/repositories/activity_log_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/loan_balance_view_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';
import 'package:familyfinance_pro/domain/models/goal.dart';

/// A [KeyValueStore] wrapper that throws on `setString` for a chosen set of
/// keys, and can additionally sabotage every write made during a
/// subsequent rollback attempt — used to exercise
/// confirmRestoreBackup()'s two distinct failure outcomes.
class FailingKeyValueStore implements KeyValueStore {
  final KeyValueStore inner;
  final Set<String> failSetOn;
  final bool failEveryWriteAfterFirstFailure;
  bool _hasFailedOnce = false;

  FailingKeyValueStore(
    this.inner, {
    required this.failSetOn,
    this.failEveryWriteAfterFirstFailure = false,
  });

  @override
  Future<String?> getString(String key) => inner.getString(key);

  @override
  Future<void> setString(String key, String value) async {
    if (failSetOn.contains(key)) {
      _hasFailedOnce = true;
      throw Exception('simulated write failure for $key');
    }
    if (_hasFailedOnce && failEveryWriteAfterFirstFailure) {
      throw Exception('simulated rollback failure for $key');
    }
    return inner.setString(key, value);
  }

  @override
  Future<void> remove(String key) => inner.remove(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) =>
      inner.keysWithPrefix(prefix);
}

void main() {
  group('ItemsRepository', () {
    test('round-trips a mixed set of items through save/load', () async {
      final store = InMemoryKeyValueStore();
      final repo = ItemsRepositoryImpl(store);
      await repo.saveAll([
        const IncomeItem(
          id: IntItemId(1),
          isArchived: false,
          title: 'משכורת',
          amount: 12000,
          day: LegacyNumericField(1),
        ),
      ]);
      final outcome = (await repo.loadAll()).valueOrNull!;
      expect(outcome.items, hasLength(1));
      expect(outcome.itemErrors, isEmpty);
    });

    test('a missing key loads as an empty list, never throws', () async {
      final repo = ItemsRepositoryImpl(InMemoryKeyValueStore());
      final outcome = (await repo.loadAll()).valueOrNull!;
      expect(outcome.items, isEmpty);
    });

    test('one malformed entry is reported without discarding the others', () async {
      final store = InMemoryKeyValueStore({
        kDataKey: jsonEncode([
          {'id': 1, 'type': 'income', 'title': 'ok', 'amount': 100},
          {'type': 'income', 'title': 'no id', 'amount': 100}, // missing id
        ]),
      });
      final outcome = (await ItemsRepositoryImpl(store).loadAll()).valueOrNull!;
      expect(outcome.items, hasLength(1));
      expect(outcome.itemErrors, hasLength(1));
    });
  });

  group('GoalsRepository', () {
    test('saveAll refuses to write when the last load was invalid', () async {
      final store = InMemoryKeyValueStore({kGoalsKey: '{not valid json'});
      final repo = GoalsRepositoryImpl(store);
      final loadResult = await repo.load();
      expect(loadResult, isA<GoalsInvalid>());
      final wrote = await repo.saveAll([], wasValid: false);
      expect(wrote, isFalse);
      // The corrupted raw value must survive untouched.
      expect(await store.getString(kGoalsKey), '{not valid json');
    });

    test('a missing key is a valid empty list, not corruption', () async {
      final result = await GoalsRepositoryImpl(InMemoryKeyValueStore()).load();
      expect(result, isA<GoalsValid>());
      expect((result as GoalsValid).goals, isEmpty);
    });
  });

  group('ActivityLogRepository', () {
    test('caps at kActivityLogMax, dropping the oldest entries first', () async {
      final store = InMemoryKeyValueStore();
      final repo = ActivityLogRepositoryImpl(store);
      for (var i = 0; i < kActivityLogMax + 5; i++) {
        await repo.append('action$i', 'detail$i');
      }
      final log = await repo.loadAll();
      expect(log, hasLength(kActivityLogMax));
      expect(log.first.action, 'action5'); // the first 5 were dropped
      expect(log.last.action, 'action${kActivityLogMax + 4}');
    });
  });

  group('LoanBalanceViewRepository', () {
    test('accepts the legacy raw (non-JSON) stored form', () async {
      final store = InMemoryKeyValueStore({kLoanBalanceViewKey: 'principal'});
      expect(await LoanBalanceViewRepositoryImpl(store).load(), LoanBalanceView.principal);
    });

    test('accepts the newer JSON-encoded form', () async {
      final store = InMemoryKeyValueStore({kLoanBalanceViewKey: jsonEncode('total')});
      expect(await LoanBalanceViewRepositoryImpl(store).load(), LoanBalanceView.total);
    });

    test('an unrecognized value falls back to total', () async {
      final store = InMemoryKeyValueStore({kLoanBalanceViewKey: 'garbage'});
      expect(await LoanBalanceViewRepositoryImpl(store).load(), LoanBalanceView.total);
    });
  });

  group('SettingsRepository — opening balance null vs [] distinction', () {
    test('a missing includedWithdrawalIds list resolves to null, not []', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 500,
          'projectedBalanceOpeningDate': '2026-09-01',
        }),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.openingBalance!.includedWithdrawalIds, isNull);
    });

    test('an explicit empty list is preserved as [], not coerced to null', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 500,
          'projectedBalanceOpeningDate': '2026-09-01',
          'projectedBalanceOpeningIncludedWithdrawalIds': <int>[],
        }),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.openingBalance!.includedWithdrawalIds, isNotNull);
      expect(settings.openingBalance!.includedWithdrawalIds, isEmpty);
    });

    test('a zero opening amount is valid and distinct from unconfigured', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 0,
          'projectedBalanceOpeningDate': '2026-09-01',
        }),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.openingBalance, isNotNull);
      expect(settings.openingBalance!.amount, 0);
    });

    test('an invalid date makes the whole opening balance unconfigured', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 500,
          'projectedBalanceOpeningDate': '2026-02-30',
        }),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.openingBalance, isNull);
    });

    test('legacy anchor fields are preserved read-only, never surfaced as opening balance', () async {
      final store = InMemoryKeyValueStore({
        kSettingsKey: jsonEncode({'anchorBalance': 1000, 'anchorDate': '2025-01-01'}),
      });
      final settings = await SettingsRepositoryImpl(store).load();
      expect(settings.legacy.anchorBalance, 1000);
      expect(settings.openingBalance, isNull);
    });
  });

  group('BackupRepository — export/validate/restore round trip', () {
    test('export then restore into a fresh store reproduces every key byte-for-byte', () async {
      final source = InMemoryKeyValueStore({
        kDataKey: jsonEncode([
          {'id': 1, 'type': 'income', 'title': 'x', 'amount': 100},
        ]),
        kSettingsKey: jsonEncode({'theme': 'dark'}),
      });
      final envelope = await BackupRepositoryImpl(source).exportBackup();

      final target = InMemoryKeyValueStore();
      final result = await BackupRepositoryImpl(target).restore(envelope);
      expect(result.isOk, isTrue);

      expect(await target.getString(kDataKey), await source.getString(kDataKey));
      expect(await target.getString(kSettingsKey), await source.getString(kSettingsKey));
    });

    test('a write failure triggers a successful rollback (PartialWriteFailure)', () async {
      final target = InMemoryKeyValueStore({kDataKey: 'ORIGINAL'});
      final failing = FailingKeyValueStore(target, failSetOn: {kSettingsKey});
      final envelope = await BackupRepositoryImpl(InMemoryKeyValueStore({
        kDataKey: jsonEncode([]),
        kSettingsKey: jsonEncode({'theme': 'dark'}),
      })).exportBackup();

      final result = await BackupRepositoryImpl(failing).restore(envelope);
      expect(result.isErr, isTrue);
      expect(result.errorOrNull, isA<PartialWriteFailure>());
      expect((result.errorOrNull as PartialWriteFailure).priorSnapshotRestored, isTrue);
      // The pre-existing value must have been restored, not left half-written.
      expect(await target.getString(kDataKey), 'ORIGINAL');
    });

    test('a write failure whose rollback ALSO fails reports RollbackFailure', () async {
      final target = InMemoryKeyValueStore({kDataKey: 'ORIGINAL'});
      final failing = FailingKeyValueStore(
        target,
        failSetOn: {kSettingsKey},
        failEveryWriteAfterFirstFailure: true,
      );
      final envelope = await BackupRepositoryImpl(InMemoryKeyValueStore({
        kDataKey: jsonEncode([]),
        kSettingsKey: jsonEncode({'theme': 'dark'}),
      })).exportBackup();

      final result = await BackupRepositoryImpl(failing).restore(envelope);
      expect(result.isErr, isTrue);
      expect(result.errorOrNull, isA<RollbackFailure>());
    });

    test('restoring an invalid backup writes nothing at all', () async {
      final target = InMemoryKeyValueStore({kDataKey: 'ORIGINAL'});
      final badEnvelope = await BackupRepositoryImpl(InMemoryKeyValueStore({
        kDataKey: '{not valid json',
      })).exportBackup();

      final result = await BackupRepositoryImpl(target).restore(badEnvelope);
      expect(result.isErr, isTrue);
      expect(result.errorOrNull, isA<InvalidBackupShape>());
      expect(await target.getString(kDataKey), 'ORIGINAL');
    });

    // A single realistic, strictly-valid goal JSON string, reused (with
    // id/title tweaks) across the goals-aware-vs-legacy tests below so a
    // schemaVersion-2 envelope's family_finance_goals value always passes
    // normalizeGoalsArrayStrict.
    String validGoalJson({required String id, required String title}) =>
        jsonEncode([
          {
            'id': id,
            'title': title,
            'dueDate': '2026-09-05',
            'targetAmount': 100,
            'savedAmount': 0,
            'isArchived': false,
            'createdAt': '2026-01-01T00:00:00.000Z',
            'updatedAt': '2026-01-01T00:00:00.000Z',
            'components': [],
            'confirmedTransfers': [],
          },
        ]);

    group('legacy (non-goals-aware) restore leaves target goals untouched', () {
      test('existing valid goals survive a v1 restore byte-for-byte by default', () async {
        final existingGoals = validGoalJson(id: 'g1', title: 'x');
        final target = InMemoryKeyValueStore({kGoalsKey: existingGoals});
        // schemaVersion absent (v1) but the backup itself DOES contain a
        // goals key — proving it's the schemaVersion gate that matters,
        // not mere key-presence in the incoming backup.
        final envelope = RawBackupEnvelope(
          schemaVersion: null,
          exportedAt: null,
          data: {
            kDataKey: jsonEncode([]),
            kGoalsKey: validGoalJson(id: 'backup-goal', title: 'should be ignored'),
          },
        );

        final result = await BackupRepositoryImpl(target).restore(envelope);
        expect(result.isOk, isTrue);
        expect(await target.getString(kGoalsKey), existingGoals);
      });

      test('existing corrupted-raw goals also survive a v1 restore untouched', () async {
        final target = InMemoryKeyValueStore({kGoalsKey: '{not valid json'});
        final envelope = RawBackupEnvelope(
          schemaVersion: 1,
          exportedAt: null,
          data: {kDataKey: jsonEncode([])},
        );

        final result = await BackupRepositoryImpl(target).restore(envelope);
        expect(result.isOk, isTrue);
        expect(await target.getString(kGoalsKey), '{not valid json');
      });

      test('deleteExistingGoalsForLegacyBackup: true explicitly wipes goals to []', () async {
        final target = InMemoryKeyValueStore({
          kGoalsKey: validGoalJson(id: 'g1', title: 'x'),
        });
        final envelope = RawBackupEnvelope(
          schemaVersion: null,
          exportedAt: null,
          data: {kDataKey: jsonEncode([])},
        );

        final result = await BackupRepositoryImpl(target).restore(
          envelope,
          deleteExistingGoalsForLegacyBackup: true,
        );
        expect(result.isOk, isTrue);
        expect(await target.getString(kGoalsKey), '[]');
      });
    });

    group('goals-aware (v2) restore replaces existing goals exactly', () {
      test('the backup goals value replaces the target goals value byte-for-byte', () async {
        final target = InMemoryKeyValueStore({
          kGoalsKey: validGoalJson(id: 'old', title: 'old goal'),
        });
        final backupGoals = validGoalJson(id: 'g2', title: 'new goal');
        final envelope = RawBackupEnvelope(
          schemaVersion: 2,
          exportedAt: null,
          data: {
            kDataKey: jsonEncode([]),
            kGoalsKey: backupGoals,
          },
        );

        final result = await BackupRepositoryImpl(target).restore(envelope);
        expect(result.isOk, isTrue);
        expect(await target.getString(kGoalsKey), backupGoals);
      });

      test('deleteExistingGoalsForLegacyBackup: true is ignored for a goals-aware backup', () async {
        final target = InMemoryKeyValueStore({
          kGoalsKey: validGoalJson(id: 'old', title: 'old goal'),
        });
        final backupGoals = validGoalJson(id: 'g2', title: 'new goal');
        final envelope = RawBackupEnvelope(
          schemaVersion: 2,
          exportedAt: null,
          data: {
            kDataKey: jsonEncode([]),
            kGoalsKey: backupGoals,
          },
        );

        final result = await BackupRepositoryImpl(target).restore(
          envelope,
          deleteExistingGoalsForLegacyBackup: true,
        );
        expect(result.isOk, isTrue);
        // Normal replacement still happens — the flag is meaningless once
        // the backup is goals-aware; it must not force-wipe to '[]' instead.
        expect(await target.getString(kGoalsKey), backupGoals);
      });
    });

    test('an unrecognized family_finance_* key round-trips byte-for-byte through export and restore', () async {
      final source = InMemoryKeyValueStore({
        kDataKey: jsonEncode([]),
        'family_finance_widget_layout': '{"cols":3}',
      });
      final envelope = await BackupRepositoryImpl(source).exportBackup();

      final target = InMemoryKeyValueStore();
      final result = await BackupRepositoryImpl(target).restore(envelope);
      expect(result.isOk, isTrue);

      expect(await target.getString('family_finance_widget_layout'), '{"cols":3}');
    });
  });
}
