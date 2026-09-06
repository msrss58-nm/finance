import '../../../core/errors/data_errors.dart';
import '../key_value_store.dart';
import 'app_database.dart';

/// Production [KeyValueStore] backend (Milestone 4), backed by a single
/// Drift/sqlite table. Every method wraps the underlying query in a
/// try/catch and rethrows a typed [PersistenceError] rather than letting a
/// raw drift/sqlite3 exception surface — see data_errors.dart.
class DriftKeyValueStore implements TransactionalKeyValueStore {
  final AppDatabase _db;
  const DriftKeyValueStore(this._db);

  @override
  Future<String?> getString(String key) async {
    try {
      final row = await (_db.select(_db.kvEntries)
            ..where((t) => t.key.equals(key)))
          .getSingleOrNull();
      return row?.value;
    } catch (e) {
      if (e is PersistenceError) rethrow;
      throw StorageReadFailure(key, 'failed to read $key: $e');
    }
  }

  @override
  Future<void> setString(String key, String value) async {
    try {
      await _db.into(_db.kvEntries).insertOnConflictUpdate(
            KvRow(key: key, value: value),
          );
    } catch (e) {
      if (e is PersistenceError) rethrow;
      throw StorageWriteFailure(key, 'failed to write $key: $e');
    }
  }

  @override
  Future<void> remove(String key) async {
    try {
      await (_db.delete(_db.kvEntries)..where((t) => t.key.equals(key))).go();
    } catch (e) {
      if (e is PersistenceError) rethrow;
      throw StorageWriteFailure(key, 'failed to remove $key: $e');
    }
  }

  /// Filters in Dart rather than an SQL `LIKE '$prefix%'` clause: every
  /// known key contains literal underscores ('family_finance_...'), which
  /// are single-character wildcards in SQL LIKE — a naive LIKE query would
  /// silently match keys it shouldn't. At this app's scale (a handful of
  /// known keys) a full-table read is free; correctness here is not worth
  /// trading for an unneeded index scan.
  @override
  Future<List<String>> keysWithPrefix(String prefix) async {
    try {
      final rows = await _db.select(_db.kvEntries).get();
      return rows.map((r) => r.key).where((k) => k.startsWith(prefix)).toList();
    } catch (e) {
      if (e is PersistenceError) rethrow;
      throw StorageReadFailure(prefix, 'failed to list keys with prefix $prefix: $e');
    }
  }

  /// Runs [action] inside one real Drift/sqlite transaction. Nested calls
  /// made through this same [DriftKeyValueStore] instance (which share the
  /// underlying [_db]) automatically participate in it — Drift routes
  /// queries against a database to whatever transaction is active via a
  /// zone-local executor swap. If [action] throws, the backend rolls back
  /// every write attempted inside it; nothing partial is ever committed.
  @override
  Future<T> runTransaction<T>(Future<T> Function() action) async {
    try {
      return await _db.transaction(action);
    } catch (e) {
      if (e is PersistenceError) rethrow;
      throw StorageTransactionFailure('transaction failed: $e');
    }
  }
}
