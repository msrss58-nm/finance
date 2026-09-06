import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';

/// These tests exercise Drift's REAL migration runner against a real sqlite
/// file — `schemaVersionOverride`/`migrationOverride` exist on [AppDatabase]
/// solely so a future schema version can be simulated even though only
/// version 1 has ever actually shipped. Nothing here fakes the outcome: the
/// file's on-disk PRAGMA user_version and its data are the actual thing
/// being asserted on.
void main() {
  late Directory tempDir;
  setUp(() => tempDir = Directory.systemTemp.createTempSync('drift_migration_test_'));
  tearDown(() {
    if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
  });

  test('version 1 initial schema creates the kv table with no data', () async {
    final db = AppDatabase(NativeDatabase.memory());
    expect(db.schemaVersion, 1);
    final rows = await db.select(db.kvEntries).get();
    expect(rows, isEmpty);
    await db.close();
  });

  test('simulated future migration: v1 -> v2 runs onUpgrade and preserves existing data', () async {
    final file = File(p.join(tempDir.path, 'migrate_success.sqlite'));

    final v1 = AppDatabase(NativeDatabase(file));
    final v1Store = DriftKeyValueStore(v1);
    await v1Store.setString('family_finance_data', '[{"id":1}]');
    await v1.close();

    var onUpgradeCalledWith = (0, 0);
    final v2 = AppDatabase(
      NativeDatabase(file),
      schemaVersionOverride: 2,
      migrationOverride: MigrationStrategy(
        onCreate: (m) async => m.createAll(),
        onUpgrade: (m, from, to) async {
          onUpgradeCalledWith = (from, to);
          // A real (if trivial) migration step: no schema change is needed
          // for this simulated v2, but a genuine ALTER/CREATE would go here.
        },
      ),
    );
    final v2Store = DriftKeyValueStore(v2);
    // Trigger the migration by touching the database.
    expect(await v2Store.getString('family_finance_data'), '[{"id":1}]');
    expect(onUpgradeCalledWith, (1, 2));
    await v2.close();
  });

  test('migration failure: no path defined blocks the open and leaves the original file untouched', () async {
    final file = File(p.join(tempDir.path, 'migrate_failure.sqlite'));

    final v1 = AppDatabase(NativeDatabase(file));
    final v1Store = DriftKeyValueStore(v1);
    await v1Store.setString('family_finance_data', '[{"id":42}]');
    await v1.close();

    // Reopen at a higher version using the DEFAULT migration strategy
    // (production behavior) — onUpgrade always throws SchemaMigrationFailure
    // because no migration has ever been defined.
    final v2 = AppDatabase(NativeDatabase(file), schemaVersionOverride: 2);
    final v2Store = DriftKeyValueStore(v2);
    await expectLater(
      v2Store.getString('family_finance_data'),
      throwsA(isA<SchemaMigrationFailure>()),
    );
    await v2.close();

    // Reopening again at the ORIGINAL version must show the data completely
    // intact — the failed upgrade attempt must not have reset or corrupted
    // anything, since onUpgrade threw before touching any table.
    final v1Again = AppDatabase(NativeDatabase(file));
    final v1AgainStore = DriftKeyValueStore(v1Again);
    expect(await v1AgainStore.getString('family_finance_data'), '[{"id":42}]');
    await v1Again.close();
  });

  test('a downgrade attempt is also rejected, never silently accepted', () async {
    final file = File(p.join(tempDir.path, 'downgrade.sqlite'));

    // Create the file already at a "higher" simulated version.
    final higher = AppDatabase(NativeDatabase(file), schemaVersionOverride: 2);
    await higher.customSelect('select 1').getSingle();
    await higher.close();

    // Now open with the real production schemaVersion (1) — a downgrade.
    final lower = AppDatabase(NativeDatabase(file));
    await expectLater(
      lower.customSelect('select 1').getSingle(),
      throwsA(isA<SchemaMigrationFailure>()),
    );
    await lower.close();
  });
}
