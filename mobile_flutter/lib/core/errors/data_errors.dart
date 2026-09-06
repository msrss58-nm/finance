/// Typed error model for the data layer. Split deliberately into "hard"
/// errors (below) that block a write/load outright — matching the Web app's
/// existing all-or-nothing conventions (isValidBackupShape, saveGoals'
/// guarded write, confirmRestoreBackup's compensating rollback) — and
/// [UnknownLegacyValueNotice], which is NOT a DataError: an unrecognized
/// legacy enum value (e.g. an item.where the Web app doesn't recognize)
/// resolves via the same silent, permanent fallback the Web app already
/// uses and must never block a load.
sealed class DataError {
  final String message;
  const DataError(this.message);

  @override
  String toString() => '$runtimeType: $message';
}

/// A single field/record could not be parsed at all (e.g. malformed JSON
/// nested inside a backup value for one key).
final class ParseError extends DataError {
  final String key;
  final Object? cause;
  const ParseError(this.key, String message, {this.cause}) : super(message);
}

/// The goals array (or one goal/component/confirmedTransfer within it) failed
/// strict validation — mirrors isValidGoalsArrayStrict()'s all-or-nothing
/// contract: the whole array is invalid, not just one entry.
final class InvalidGoalsArray extends DataError {
  const InvalidGoalsArray(super.message);
}

/// The backup envelope (or one of its declared values) failed
/// isValidBackupShape()-equivalent validation. Nothing has been written.
final class InvalidBackupShape extends DataError {
  const InvalidBackupShape(super.message);
}

/// A restore write loop failed partway through. [priorSnapshotRestored]
/// distinguishes the two outcomes confirmRestoreBackup() itself
/// distinguishes: original state recovered vs. not guaranteed recovered.
final class PartialWriteFailure extends DataError {
  final bool priorSnapshotRestored;
  final List<String> attemptedKeys;
  const PartialWriteFailure(
    super.message, {
    required this.priorSnapshotRestored,
    required this.attemptedKeys,
  });
}

/// The compensating rollback itself failed after a write failure — the most
/// severe outcome: full restoration of the prior state can no longer be
/// guaranteed and must never be reported as a success.
final class RollbackFailure extends DataError {
  const RollbackFailure(super.message);
}

/// Persistence-backend failures (Milestone 4). Thrown by the storage layer
/// itself rather than wrapped in a [DataResult] — the 7 simple repositories
/// (Items/Settings/Goals/ActivityLog/CategoryConfig/CategoryTileOrder/
/// LoanBalanceView) keep their pre-existing plain `Future<T>` contracts
/// unchanged (no UI exists yet to widen for, and 499 existing tests assert
/// on those contracts directly), so a genuine storage failure during normal
/// load/save propagates as one of these typed exceptions rather than being
/// silently swallowed into an empty/default result — the one place that
/// already speaks [DataResult] end-to-end, [BackupRepositoryImpl.restore],
/// catches and reports these precisely instead of collapsing them into a
/// single generic write-failure message.
sealed class PersistenceError extends DataError implements Exception {
  const PersistenceError(super.message);
}

/// The database file/connection could not be opened at all (e.g. permission
/// denied, disk full, directory missing).
final class StorageOpenFailure extends PersistenceError {
  final Object? cause;
  const StorageOpenFailure(super.message, {this.cause});
}

/// A stored schema version does not match what the app expects and no
/// migration path exists for the exact (from, to) pair — covers both a
/// missing forward migration and any downgrade attempt. Never triggers a
/// destructive reset: the pre-migration file is left untouched.
final class SchemaMigrationFailure extends PersistenceError {
  final int fromVersion;
  final int toVersion;
  const SchemaMigrationFailure(
    super.message, {
    required this.fromVersion,
    required this.toVersion,
  });
}

/// A read of a specific key failed at the storage layer itself (the key was
/// reachable but the backend could not retrieve it) — distinct from a value
/// that was read successfully but failed to JSON-decode, which the
/// repositories already treat as their own existing empty/default fallback.
final class StorageReadFailure extends PersistenceError {
  final String key;
  const StorageReadFailure(this.key, super.message);
}

/// A write (or remove) of a specific key failed at the storage layer.
final class StorageWriteFailure extends PersistenceError {
  final String key;
  const StorageWriteFailure(this.key, super.message);
}

/// A multi-key [TransactionalKeyValueStore] transaction failed and was
/// rolled back by the backend itself.
final class StorageTransactionFailure extends PersistenceError {
  const StorageTransactionFailure(super.message);
}

/// The database file exists but is not a valid/readable database (e.g. a
/// truncated or non-SQLite file) — distinct from [StorageOpenFailure]
/// because the fix is different (the file itself is bad, not the
/// permissions/path).
final class StorageCorruptionFailure extends PersistenceError {
  const StorageCorruptionFailure(super.message);
}

/// Soft, non-blocking diagnostic: a legacy field carried a value this data
/// layer does not recognize (e.g. an item.where other than 'bank'/'credit').
/// The Web app's own resolvers never throw on this — they fall back to a
/// fixed, documented default (or null) and keep going — so this notice is
/// informational only, never part of a [DataResult] failure.
class UnknownLegacyValueNotice {
  final String field;
  final Object? rawValue;
  final String context;
  const UnknownLegacyValueNotice({
    required this.field,
    required this.rawValue,
    required this.context,
  });

  @override
  String toString() =>
      'UnknownLegacyValueNotice(field: $field, rawValue: $rawValue, context: $context)';
}
