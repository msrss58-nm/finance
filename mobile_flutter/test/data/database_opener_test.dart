import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/database_opener.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:drift/native.dart';

/// Coverage gap identified by the Milestone 4 architecture review:
/// [StorageOpenFailure] and [StorageCorruptionFailure] are thrown only from
/// database_opener.dart, and neither had a single test exercising the real
/// classification logic. This closes that gap.
void main() {
  late Directory tempDir;
  setUp(() => tempDir = Directory.systemTemp.createTempSync('database_opener_test_'));
  tearDown(() {
    if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
  });

  test('happy path: opens/creates a fresh database file and it is usable', () async {
    final file = File(p.join(tempDir.path, 'ok.sqlite'));
    final db = await openAppDatabase(file);
    final store = DriftKeyValueStore(db);
    await store.setString('family_finance_data', '[]');
    expect(await store.getString('family_finance_data'), '[]');
    await db.close();
    expect(file.existsSync(), isTrue);
  });

  test('StorageOpenFailure: the parent "directory" is actually a plain file', () async {
    // A reliable, OS-portable way to force a real open failure: no
    // filesystem allows creating a path underneath a regular file.
    final notADirectory = File(p.join(tempDir.path, 'im_a_file'));
    notADirectory.writeAsStringSync('x');
    final file = File(p.join(notADirectory.path, 'db.sqlite'));
    await expectLater(
      openAppDatabase(file),
      throwsA(isA<StorageOpenFailure>()),
    );
  });

  test('StorageCorruptionFailure: the file exists but is not a valid sqlite database', () async {
    final file = File(p.join(tempDir.path, 'corrupt.sqlite'));
    file.writeAsStringSync('this is definitely not a sqlite database file');
    await expectLater(
      openAppDatabase(file),
      throwsA(isA<StorageCorruptionFailure>()),
    );
  });

  test('SchemaMigrationFailure propagates through openAppDatabase (a downgrade attempt)', () async {
    final file = File(p.join(tempDir.path, 'downgrade.sqlite'));

    // Create the file already at a "higher" simulated version using the
    // test-only override, then close it.
    final higher = AppDatabase(NativeDatabase(file), schemaVersionOverride: 2);
    await higher.customSelect('select 1').getSingle();
    await higher.close();

    // openAppDatabase always opens at the real production schemaVersion (1)
    // — a downgrade relative to the file on disk.
    await expectLater(
      openAppDatabase(file),
      throwsA(isA<SchemaMigrationFailure>()),
    );
  });
}
