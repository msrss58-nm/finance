import 'package:drift/drift.dart';

import '../../../core/errors/data_errors.dart';

part 'app_database.g.dart';

/// The single internal table backing every `family_finance_*` compatibility
/// key. This deliberately mirrors the flat key/value shape of
/// [KeyValueStore] rather than modeling items/settings/goals/etc. as
/// individual relational tables — NOT because a richer schema wasn't
/// considered, but because the approved architecture (Milestone 1-3) already
/// places raw-preservation and JSON normalization at the REPOSITORY layer,
/// not the storage layer: every repository decodes/encodes a whole JSON
/// blob per key today, and the entire backup/restore/snapshot/rollback
/// engine (499 tests) is written directly against [KeyValueStore]'s
/// string-map contract. Splitting items into rows here would require
/// reconstructing byte-identical raw JSON for export, duplicating
/// normalization logic that already exists, and would risk a lossy
/// round-trip — for this app's scale (a personal/family dataset, not a
/// multi-tenant one) a single small table decoded in Dart costs nothing
/// measurable and keeps one source of truth.
@DataClassName('KvRow')
class KvEntries extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [KvEntries])
class AppDatabase extends _$AppDatabase {
  /// [schemaVersionOverride] and [migrationOverride] exist ONLY so tests can
  /// simulate a future schema upgrade (and an upgrade failure) against a
  /// real Drift/sqlite migration run without a second shipped schema
  /// version existing yet. Production code never passes either.
  AppDatabase(
    super.executor, {
    this._schemaVersionOverride,
    this._migrationOverride,
  });

  final int? _schemaVersionOverride;
  final MigrationStrategy? _migrationOverride;

  @override
  int get schemaVersion => _schemaVersionOverride ?? 1;

  @override
  MigrationStrategy get migration =>
      _migrationOverride ??
      MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
        },
        // Only schema version 1 has ever shipped, so there is no known-good
        // upgrade step to run. Reaching this callback in production would
        // mean either an unexpected version jump or a downgrade — both are
        // integrity problems, never silently patched or reset. No table is
        // touched before this throws, so the pre-migration file on disk is
        // left completely intact.
        onUpgrade: (m, from, to) async {
          throw SchemaMigrationFailure(
            'no migration path defined for schema v$from -> v$to',
            fromVersion: from,
            toVersion: to,
          );
        },
      );
}
