// Milestone 4, section 12 — "Real Android storage smoke test".
//
// This is NOT part of the app's UI/build — it is a standalone on-device
// proof that the production-realistic Drift bootstrap path (drift_flutter's
// driftDatabase(), which resolves an Android-appropriate app-documents file
// path via path_provider and loads the native sqlite3 libs bundled by
// sqlite3_flutter_libs) actually persists data to disk on a real Android
// environment — not just against NativeDatabase.memory()/NativeDatabase(file)
// on the desktop host test runner.
//
// Flow: open a real on-device Drift database by name -> write two known
// key/value rows through DriftKeyValueStore -> close the connection ->
// open a brand-new AppDatabase/connection pointed at the exact same
// on-device file path -> assert the rows written before close are still
// present after reopen (proof of on-device durability, not just an
// in-process cache) -> delete the test database file so nothing is left
// behind on the device/emulator.
import 'dart:io';

import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';

const String _kSmokeTestDbName = 'familyfinance_smoke_test';

Future<File> _resolveSmokeTestDbFile() async {
  final docsDir = await getApplicationDocumentsDirectory();
  return File('${docsDir.path}/$_kSmokeTestDbName.sqlite');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    // Guard against a leftover file from a previously-interrupted run so
    // this test always starts from a genuinely fresh on-device database.
    final file = await _resolveSmokeTestDbFile();
    if (await file.exists()) {
      await file.delete();
    }
  });

  testWidgets(
    'Drift database written on-device survives a real close + reopen',
    (tester) async {
      // 1) Open a real on-device Drift database via the same
      // drift_flutter helper the production bootstrap is intended to use —
      // this resolves the actual Android app-documents directory through
      // path_provider and loads the native sqlite3 libs via
      // sqlite3_flutter_libs, unlike NativeDatabase.memory()/NativeDatabase(file)
      // used by the desktop host test suite.
      final firstConnection = driftDatabase(name: _kSmokeTestDbName);
      final firstDb = AppDatabase(firstConnection);
      final firstStore = DriftKeyValueStore(firstDb);

      const key1 = 'family_finance_smoke_test_key_1';
      const value1 = 'android-smoke-test-value-1';
      const key2 = 'family_finance_smoke_test_key_2';
      const value2 = 'android-smoke-test-value-2';

      await firstStore.setString(key1, value1);
      await firstStore.setString(key2, value2);

      // Sanity check within the same connection before closing it.
      expect(await firstStore.getString(key1), value1);
      expect(await firstStore.getString(key2), value2);

      // 2) Close the connection completely.
      await firstDb.close();

      // 3) Re-open a brand-new AppDatabase/connection pointed at the exact
      // same on-device file (driftDatabase resolves the same deterministic
      // path for the same name: app-documents-dir/<name>.sqlite).
      final secondConnection = driftDatabase(name: _kSmokeTestDbName);
      final secondDb = AppDatabase(secondConnection);
      final secondStore = DriftKeyValueStore(secondDb);

      try {
        // 4) Assert the data written before close is present after reopen —
        // actual proof of on-device durability, not just an in-process cache.
        expect(
          await secondStore.getString(key1),
          value1,
          reason: 'key1 must survive a real close+reopen on-device',
        );
        expect(
          await secondStore.getString(key2),
          value2,
          reason: 'key2 must survive a real close+reopen on-device',
        );
      } finally {
        await secondDb.close();
      }
    },
  );

  tearDown(() async {
    // 5) Clean up so no junk database file is left behind on the
    // device/emulator.
    final file = await _resolveSmokeTestDbFile();
    if (await file.exists()) {
      await file.delete();
    }
  });
}
