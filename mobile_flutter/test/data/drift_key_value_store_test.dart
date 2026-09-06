import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';

void main() {
  late Directory tempDir;

  setUp(() {
    tempDir = Directory.systemTemp.createTempSync('drift_kv_test_');
  });

  tearDown(() {
    if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
  });

  AppDatabase openMemory() => AppDatabase(NativeDatabase.memory());

  group('DriftKeyValueStore — basic get/set/remove/keysWithPrefix', () {
    test('create/open database and confirm schema version', () async {
      final db = openMemory();
      expect(db.schemaVersion, 1);
      // Triggers the migration runner (onCreate) — proves the table exists.
      final rows = await db.select(db.kvEntries).get();
      expect(rows, isEmpty);
      await db.close();
    });

    test('getString on a missing key returns null, never throws', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      expect(await store.getString('family_finance_data'), isNull);
      await db.close();
    });

    test('setString then getString round-trips exactly (raw preservation)', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      const raw = '[{"id":5,"type":"cashWithdrawal","extra_unknown_field":"kept"}]';
      await store.setString('family_finance_data', raw);
      expect(await store.getString('family_finance_data'), raw);
      await db.close();
    });

    test('setString overwrites an existing key (insertOnConflictUpdate)', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.setString('family_finance_settings', '{"a":1}');
      await store.setString('family_finance_settings', '{"a":2}');
      expect(await store.getString('family_finance_settings'), '{"a":2}');
      final rows = await db.select(db.kvEntries).get();
      expect(rows.length, 1); // no duplicate row for the same key
      await db.close();
    });

    test('remove deletes the key; a second remove is a harmless no-op', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.setString('family_finance_goals', '[]');
      await store.remove('family_finance_goals');
      expect(await store.getString('family_finance_goals'), isNull);
      await store.remove('family_finance_goals'); // must not throw
      await db.close();
    });

    test('keysWithPrefix returns only matching keys, unaffected by SQL-LIKE-style underscores', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.setString('family_finance_data', '[]');
      await store.setString('family_finance_goals', '[]');
      await store.setString('unrelated_other_key', 'x');
      // If keysWithPrefix used a naive SQL LIKE 'family_finance_%' clause,
      // the underscores in the prefix are wildcards and this key (which
      // does NOT start with the literal prefix) would incorrectly match a
      // pattern like 'familyxfinancexgoals'. Prove it does not, plus prove
      // an actual non-matching key is correctly excluded.
      await store.setString('familyxfinancexbogus', 'x');
      final keys = await store.keysWithPrefix(kFamilyFinanceKeyPrefix);
      expect(keys.toSet(), {'family_finance_data', 'family_finance_goals'});
      await db.close();
    });
  });

  group('DriftKeyValueStore — transactions', () {
    test('runTransaction commits all writes together on success', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.runTransaction(() async {
        await store.setString('family_finance_data', '[]');
        await store.setString('family_finance_settings', '{}');
      });
      expect(await store.getString('family_finance_data'), '[]');
      expect(await store.getString('family_finance_settings'), '{}');
      await db.close();
    });

    test('a thrown error inside runTransaction rolls back EVERY write in that block', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.setString('family_finance_data', 'ORIGINAL');

      await expectLater(
        store.runTransaction(() async {
          await store.setString('family_finance_data', 'CHANGED');
          await store.setString('family_finance_settings', '{"new":true}');
          throw Exception('simulated mid-transaction failure');
        }),
        throwsA(isA<StorageTransactionFailure>()),
      );

      // Both the modification to a pre-existing key AND the new key must be
      // undone — real SQL transaction rollback, not a partial commit.
      expect(await store.getString('family_finance_data'), 'ORIGINAL');
      expect(await store.getString('family_finance_settings'), isNull);
      await db.close();
    });

    test('a PersistenceError thrown inside the transaction is rethrown as-is, not double-wrapped', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await expectLater(
        store.runTransaction(() async {
          throw const StorageWriteFailure('k', 'inner failure');
        }),
        throwsA(isA<StorageWriteFailure>()),
      );
      await db.close();
    });
  });

  group('DriftKeyValueStore — durability across reopen', () {
    test('data written before close survives a full close/reopen of the same file', () async {
      final file = File(p.join(tempDir.path, 'durability.sqlite'));
      final db1 = AppDatabase(NativeDatabase(file));
      final store1 = DriftKeyValueStore(db1);
      await store1.setString('family_finance_data', '[{"id":1}]');
      await store1.setString('family_finance_activity_log', '[]');
      await db1.close();

      final db2 = AppDatabase(NativeDatabase(file));
      final store2 = DriftKeyValueStore(db2);
      expect(await store2.getString('family_finance_data'), '[{"id":1}]');
      expect(await store2.getString('family_finance_activity_log'), '[]');
      await db2.close();
    });

    test('reopen after a FAILED write attempt shows no partial state', () async {
      final file = File(p.join(tempDir.path, 'durability_failed.sqlite'));
      final db1 = AppDatabase(NativeDatabase(file));
      final store1 = DriftKeyValueStore(db1);
      await store1.setString('family_finance_data', 'ORIGINAL');
      try {
        await store1.runTransaction(() async {
          await store1.setString('family_finance_data', 'SHOULD_NOT_PERSIST');
          throw Exception('boom');
        });
      } catch (_) {
        // expected
      }
      await db1.close();

      final db2 = AppDatabase(NativeDatabase(file));
      final store2 = DriftKeyValueStore(db2);
      expect(await store2.getString('family_finance_data'), 'ORIGINAL');
      await db2.close();
    });
  });

  group('DriftKeyValueStore — null vs [] and other repo-shaped values round-trip', () {
    test('includedWithdrawalIds null vs [] survive as distinct raw strings through settings', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      const settingsWithNull =
          '{"projectedBalanceOpeningIncludedWithdrawalIds":null}';
      await store.setString('family_finance_settings', settingsWithNull);
      expect(await store.getString('family_finance_settings'), settingsWithNull);

      const settingsWithEmptyArray =
          '{"projectedBalanceOpeningIncludedWithdrawalIds":[]}';
      await store.setString('family_finance_settings', settingsWithEmptyArray);
      expect(await store.getString('family_finance_settings'), settingsWithEmptyArray);
      await db.close();
    });

    test('legacy raw (non-JSON) loan_balance_view value is stored and returned byte-identical', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      await store.setString('family_finance_loan_balance_view', 'total');
      expect(await store.getString('family_finance_loan_balance_view'), 'total');
      await db.close();
    });

    test('activity log cap is a repository-layer concern — the store itself stores whatever it is given', () async {
      final db = openMemory();
      final store = DriftKeyValueStore(db);
      final big = List.generate(250, (i) => {'ts': '2026-01-01', 'action': 'a$i', 'detail': ''});
      final encoded = big.toString();
      await store.setString('family_finance_activity_log', encoded);
      expect(await store.getString('family_finance_activity_log'), encoded);
      await db.close();
    });
  });
}
