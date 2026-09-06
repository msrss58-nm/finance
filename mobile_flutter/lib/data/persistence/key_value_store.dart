/// Storage-agnostic abstraction the repositories are built on. No concrete
/// backend (shared_preferences/sqflite/Hive/...) is chosen in this phase —
/// see CLAUDE.md's explicit "no package/library selection yet" — so every
/// method is async, matching the shape any real platform storage API would
/// need, even though [InMemoryKeyValueStore] below resolves synchronously.
abstract interface class KeyValueStore {
  Future<String?> getString(String key);
  Future<void> setString(String key, String value);
  Future<void> remove(String key);
  Future<List<String>> keysWithPrefix(String prefix);
}

/// The 7 known `family_finance_*` keys, in the same priority order
/// restoreFamilyFinanceSnapshot() restores them in (financially-significant
/// keys first), so a partially-completed rollback loses the
/// least-significant data first.
const List<String> kFamilyFinanceKeyPriorityOrder = [
  'family_finance_data',
  'family_finance_cat_config',
  'family_finance_settings',
  'family_finance_activity_log',
  'family_finance_goals',
  'family_finance_category_tile_order',
  'family_finance_loan_balance_view',
];

const String kFamilyFinanceKeyPrefix = 'family_finance_';

/// Optional capability a [KeyValueStore] backend may support (Milestone 4):
/// running a batch of writes as one real, atomic backend transaction.
/// [BackupRepositoryImpl.restore] checks `_store is TransactionalKeyValueStore`
/// and uses it when available; a backend that doesn't implement it — notably
/// [InMemoryKeyValueStore], used throughout the pre-existing test suite —
/// falls back to the original sequential-write + compensating-rollback path
/// entirely unchanged, so no existing test's behavior is affected by this
/// addition.
abstract interface class TransactionalKeyValueStore implements KeyValueStore {
  Future<T> runTransaction<T>(Future<T> Function() action);
}

/// snapshotFamilyFinanceStorage(): captures every currently-stored
/// family_finance_* key/value pair before a restore attempts any write.
Future<Map<String, String>> snapshotFamilyFinanceStorage(
  KeyValueStore store,
) async {
  final keys = await store.keysWithPrefix(kFamilyFinanceKeyPrefix);
  final snapshot = <String, String>{};
  for (final key in keys) {
    final value = await store.getString(key);
    if (value != null) snapshot[key] = value;
  }
  return snapshot;
}

/// restoreFamilyFinanceSnapshot(): best-effort compensating rollback, NOT a
/// true atomic transaction (no backend here offers a multi-key transaction
/// primitive to build one on). Every key that existed beforehand is forced
/// back to its exact prior value (in priority order) BEFORE any key that
/// was newly introduced by the failed write is removed — restoring
/// already-existing user data is the higher-stakes operation. Returns
/// `false` the moment any write/remove itself fails, matching the Web app's
/// "never silently claim the rollback succeeded" contract.
Future<bool> restoreFamilyFinanceSnapshot(
  KeyValueStore store,
  Map<String, String> snapshot,
  List<String> attemptedKeys,
) async {
  final snapshotKeys = snapshot.keys.toSet();
  final ordered = [
    ...kFamilyFinanceKeyPriorityOrder.where(snapshotKeys.contains),
    ...snapshotKeys.where((k) => !kFamilyFinanceKeyPriorityOrder.contains(k)),
  ];

  for (final key in ordered) {
    try {
      await store.setString(key, snapshot[key]!);
    } catch (_) {
      return false;
    }
  }
  for (final key in attemptedKeys) {
    if (!snapshot.containsKey(key)) {
      try {
        await store.remove(key);
      } catch (_) {
        return false;
      }
    }
  }
  return true;
}

/// In-memory reference implementation — used by tests and as a placeholder
/// until a real platform-backed [KeyValueStore] is chosen and implemented.
class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> _data;
  InMemoryKeyValueStore([Map<String, String>? initial])
      : _data = Map<String, String>.from(initial ?? {});

  @override
  Future<String?> getString(String key) async => _data[key];

  @override
  Future<void> setString(String key, String value) async {
    _data[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    _data.remove(key);
  }

  @override
  Future<List<String>> keysWithPrefix(String prefix) async =>
      _data.keys.where((k) => k.startsWith(prefix)).toList();
}
