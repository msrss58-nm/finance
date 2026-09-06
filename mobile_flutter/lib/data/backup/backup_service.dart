import '../../core/errors/data_errors.dart';
import '../../core/types/result.dart';
import '../persistence/key_value_store.dart';
import '../raw/raw_backup_envelope.dart';
import '../repositories/goals_repository.dart' show kGoalsKey;
import 'backup_validator.dart';

/// BackupRepository operates ONLY on raw strings via [KeyValueStore] — never
/// on domain objects — mirroring collectAppLocalStorageBackup()'s verbatim
/// key/value sweep and confirmRestoreBackup()'s verbatim key/value write.
/// This is the compatibility bridge CLAUDE.md's approved architecture
/// decision calls for: the internal domain model can evolve freely without
/// ever risking a lossy re-serialization of a user's exported backup.
abstract interface class BackupRepository {
  Future<RawBackupEnvelope> exportBackup();
  BackupValidationResult validate(RawBackupEnvelope envelope);
  Future<DataResult<RestoreOutcome>> restore(
    RawBackupEnvelope envelope, {
    bool deleteExistingGoalsForLegacyBackup = false,
  });
}

class RestoreOutcome {
  final List<String> writtenKeys;
  const RestoreOutcome(this.writtenKeys);
}

class BackupRepositoryImpl implements BackupRepository {
  final KeyValueStore _store;
  const BackupRepositoryImpl(this._store);

  @override
  Future<RawBackupEnvelope> exportBackup() async {
    final keys = await _store.keysWithPrefix(kFamilyFinanceKeyPrefix);
    final data = <String, String>{};
    for (final key in keys) {
      final value = await _store.getString(key);
      if (value != null) data[key] = value;
    }
    data.putIfAbsent(kGoalsKey, () => '[]');
    return RawBackupEnvelope(
      schemaVersion: 2,
      exportedAt: DateTime.now().toIso8601String(),
      data: data,
    );
  }

  @override
  BackupValidationResult validate(RawBackupEnvelope envelope) =>
      validateBackupShape(envelope);

  /// Port of confirmRestoreBackup(): snapshot every current
  /// family_finance_* key first; write every backup key (goals excluded
  /// unless the backup is itself goals-aware, OR the caller explicitly
  /// opted into deleting existing goals for a legacy/non-goals-aware
  /// backup); on any write failure, attempt the compensating rollback and
  /// report which of the two distinct outcomes occurred.
  @override
  Future<DataResult<RestoreOutcome>> restore(
    RawBackupEnvelope envelope, {
    bool deleteExistingGoalsForLegacyBackup = false,
  }) async {
    final shape = validate(envelope);
    if (!shape.isValid) {
      return DataErr(InvalidBackupShape(shape.reason ?? 'invalid backup'));
    }

    final effectiveData = <String, String>{};
    for (final entry in envelope.data.entries) {
      if (!envelope.isGoalsAwareVersion && entry.key == kGoalsKey) {
        continue;
      }
      effectiveData[entry.key] = entry.value;
    }
    if (!envelope.isGoalsAwareVersion && deleteExistingGoalsForLegacyBackup) {
      effectiveData[kGoalsKey] = '[]';
    }

    final keys = effectiveData.keys.toList();
    final snapshot = await snapshotFamilyFinanceStorage(_store);

    Future<RestoreOutcome> writeAll() async {
      for (final key in keys) {
        await _store.setString(key, effectiveData[key]!);
      }
      return RestoreOutcome(keys);
    }

    try {
      // When the backend supports it, the whole write loop runs as one real
      // atomic transaction: a failure partway through is rolled back by the
      // backend itself, and no user-visible partial state is ever
      // committed. The snapshot above still runs unconditionally and the
      // compensating restoreFamilyFinanceSnapshot() below is still the
      // catch handler either way — for a transactional store it is a
      // redundant-but-harmless second safety net (the backend has already
      // undone everything by the time the exception reaches here); for a
      // non-transactional store (e.g. [InMemoryKeyValueStore], used
      // throughout the pre-existing test suite) it remains the ONLY
      // recovery mechanism, exactly as before this change.
      final store = _store;
      final outcome = store is TransactionalKeyValueStore
          ? await store.runTransaction(writeAll)
          : await writeAll();
      return DataOk(outcome);
    } catch (e) {
      final rolledBack =
          await restoreFamilyFinanceSnapshot(_store, snapshot, keys);
      return DataErr(rolledBack
          ? PartialWriteFailure(
              'write failed; original state restored',
              priorSnapshotRestored: true,
              attemptedKeys: keys,
            )
          : const RollbackFailure(
              'write failed AND rollback also failed — original state not guaranteed',
            ));
    }
  }
}
