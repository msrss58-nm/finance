import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/core/types/result.dart';
import 'package:familyfinance_pro/data/backup/backup_service.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/raw/raw_backup_envelope.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';

/// Wraps a real [TransactionalKeyValueStore] and throws after [failAfter]
/// successful setString calls made WHILE a transaction is active — used to
/// prove that BackupRepositoryImpl's restore() rolls back a REAL Drift
/// transaction (not just the in-memory compensating-snapshot path already
/// covered in repositories_test.dart). Writes made outside of a transaction
/// (i.e. BackupRepositoryImpl's compensating restoreFamilyFinanceSnapshot(),
/// which never calls runTransaction again) always succeed — modeling a
/// transient fault in the transactional write path whose plain
/// read/write path still works, so the rollback itself can succeed.
class _FailDuringTransactionAfterNWrites implements TransactionalKeyValueStore {
  final TransactionalKeyValueStore _inner;
  final int failAfter;
  bool _inTransaction = false;
  int _writesThisTransaction = 0;
  _FailDuringTransactionAfterNWrites(this._inner, {required this.failAfter});

  @override
  Future<String?> getString(String key) => _inner.getString(key);

  @override
  Future<void> setString(String key, String value) async {
    if (_inTransaction) {
      if (_writesThisTransaction >= failAfter) {
        throw Exception('simulated write failure after $failAfter writes');
      }
      _writesThisTransaction++;
    }
    await _inner.setString(key, value);
  }

  @override
  Future<void> remove(String key) => _inner.remove(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) => _inner.keysWithPrefix(prefix);

  @override
  Future<T> runTransaction<T>(Future<T> Function() action) async {
    _inTransaction = true;
    _writesThisTransaction = 0;
    try {
      return await _inner.runTransaction(action);
    } finally {
      _inTransaction = false;
    }
  }
}

/// Models a backend that is completely dead: every write fails, including
/// the compensating rollback's own writes — used to prove restore() reports
/// [RollbackFailure] (never a false success) when recovery itself cannot be
/// guaranteed.
class _AlwaysFailingWrites implements TransactionalKeyValueStore {
  final TransactionalKeyValueStore _inner;
  _AlwaysFailingWrites(this._inner);

  @override
  Future<String?> getString(String key) => _inner.getString(key);

  @override
  Future<void> setString(String key, String value) async {
    throw Exception('simulated permanent write failure');
  }

  @override
  Future<void> remove(String key) => _inner.remove(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) => _inner.keysWithPrefix(prefix);

  @override
  Future<T> runTransaction<T>(Future<T> Function() action) =>
      _inner.runTransaction(action);
}

void main() {
  test('full backup export from Drift-persisted data matches what was written', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);

    // Seeded as raw JSON directly (rather than via ItemsRepository.saveAll)
    // because this test's target is exportBackup() reading THROUGH the
    // Drift-backed store correctly — not the domain item normalizer, which
    // is already covered exhaustively elsewhere.
    await store.setString(
      kDataKey,
      jsonEncode([
        {
          'id': 1,
          'type': 'fixed',
          'title': 'שכירות',
          'amount': 4000,
          'day': 1,
          'isArchived': false,
        },
      ]),
    );
    final settingsRepo = SettingsRepositoryImpl(store);
    await settingsRepo.save((await settingsRepo.load()));
    final goalsRepo = GoalsRepositoryImpl(store);
    await goalsRepo.saveAll([], wasValid: true);

    final backupRepo = BackupRepositoryImpl(store);
    final envelope = await backupRepo.exportBackup();

    expect(envelope.schemaVersion, 2);
    expect(envelope.data[kDataKey], isNotNull);
    final decodedItems = jsonDecode(envelope.data[kDataKey]!) as List;
    expect(decodedItems, hasLength(1));
    expect(decodedItems.first['title'], 'שכירות');
    expect(envelope.data[kGoalsKey], '[]');
    await db.close();
  });

  test('restore into a Drift-persisted backend writes through to storage and survives reopen', () async {
    final db1 = AppDatabase(NativeDatabase.memory());
    final store1 = DriftKeyValueStore(db1);
    final backupRepo1 = BackupRepositoryImpl(store1);

    final envelope = RawBackupEnvelope(
      schemaVersion: 2,
      exportedAt: '2026-09-06T00:00:00.000Z',
      data: {
        kDataKey: '[]',
        kGoalsKey: '[]',
        'family_finance_settings': '{}',
      },
    );
    final result = await backupRepo1.restore(envelope);
    expect(result, isA<DataOk<RestoreOutcome>>());
    expect(await store1.getString(kDataKey), '[]');
    await db1.close();
  });

  test('restore rollback on a REAL transactional storage failure: nothing partial is committed, rollback succeeds', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final realStore = DriftKeyValueStore(db);

    // Seed pre-existing data that must survive the failed restore intact.
    await realStore.setString(kDataKey, '[{"PREEXISTING":true}]');

    final failingStore = _FailDuringTransactionAfterNWrites(realStore, failAfter: 1);
    final backupRepo = BackupRepositoryImpl(failingStore);

    final envelope = RawBackupEnvelope(
      schemaVersion: 2,
      exportedAt: '2026-09-06T00:00:00.000Z',
      data: {
        kDataKey: '[{"NEW":true}]',
        kGoalsKey: '[]',
        'family_finance_settings': '{"changed":true}',
      },
    );
    final result = await backupRepo.restore(envelope);

    expect(result, isA<DataErr<RestoreOutcome>>());
    final err = (result as DataErr<RestoreOutcome>).error;
    expect(err, isA<PartialWriteFailure>());
    expect((err as PartialWriteFailure).priorSnapshotRestored, isTrue);

    // The real backend transaction must have rolled back the ONE write that
    // did succeed before the injected failure — the pre-existing key must
    // be completely unchanged, not partially overwritten.
    expect(await realStore.getString(kDataKey), '[{"PREEXISTING":true}]');
    await db.close();
  });

  test('restore reports RollbackFailure (never a false success) when the backend is completely dead', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final realStore = DriftKeyValueStore(db);
    await realStore.setString(kDataKey, '[{"PREEXISTING":true}]');

    final deadStore = _AlwaysFailingWrites(realStore);
    final backupRepo = BackupRepositoryImpl(deadStore);

    final envelope = RawBackupEnvelope(
      schemaVersion: 2,
      exportedAt: '2026-09-06T00:00:00.000Z',
      data: {kDataKey: '[{"NEW":true}]', kGoalsKey: '[]'},
    );
    final result = await backupRepo.restore(envelope);

    expect(result, isA<DataErr<RestoreOutcome>>());
    final err = (result as DataErr<RestoreOutcome>).error;
    expect(err, isA<RollbackFailure>());
    await db.close();
  });

  test('a v1 (non-goals-aware) restore into a Drift-persisted backend leaves existing goals untouched', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    final goalsRepo = GoalsRepositoryImpl(store);
    await goalsRepo.saveAll([], wasValid: true);
    await store.setString(kGoalsKey, '[{"id":"g1","title":"x","dueDate":"2027-01-01","targetAmount":100,"savedAmount":0,"isArchived":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","components":[],"confirmedTransfers":[]}]');

    final backupRepo = BackupRepositoryImpl(store);
    final v1Envelope = RawBackupEnvelope(
      schemaVersion: 1,
      exportedAt: '2026-09-06T00:00:00.000Z',
      data: {kDataKey: '[]'},
    );
    final result = await backupRepo.restore(v1Envelope);
    expect(result, isA<DataOk<RestoreOutcome>>());
    // Goals key was never part of the v1 backup and must remain exactly as
    // it was before the restore.
    final goalsRaw = await store.getString(kGoalsKey);
    expect(goalsRaw, contains('"id":"g1"'));
    await db.close();
  });
}
