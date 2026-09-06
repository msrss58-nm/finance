import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/backup/backup_service.dart';
import 'package:familyfinance_pro/data/backup/backup_transfer_service.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_backup_file_gateway.dart';
import '../fakes/fake_secure_secret_store.dart';

/// Milestone 8, section 11 — the file import/export path must not be able to
/// read, write, create or destroy PIN state.
///
/// The structural reason it cannot: [BackupTransferService] holds a
/// `BackupRepository` (over `KeyValueStore`) and a `BackupFileGateway`, and
/// neither can reach a `SecureSecretStore`. These tests assert the
/// OBSERVABLE consequences of that, through the REAL export/import path
/// rather than through the repository alone, so a future change that wires
/// the two together fails here.
///
/// Scope note, unchanged from Milestone 7's own isolation suite: the legacy
/// Web `pinHash` field lives INSIDE `family_finance_settings` and therefore
/// still travels in a backup. Removing it would change the approved backup
/// schema, which this milestone must not do. Every assertion below is about
/// the NEW `ff_pin_v1` record and about the legacy field never being allowed
/// to influence Flutter PIN state.
const int _kTestIterations = 1000;
const String _kPin = '246810';

const String _validItems = '[{"id":1,"type":"fixed","title":"שכירות",'
    '"amount":4000,"day":1,"isArchived":false}]';

/// Settings that carry a legacy Web PIN hash, exactly as a real Web backup
/// would.
String _settingsWithLegacyPinHash(String hash) => jsonEncode({
      'theme': 'dark',
      'pinEnabled': true,
      'pinHash': hash,
    });

String _envelope(Map<String, String> data) => jsonEncode({
      'schemaVersion': 2,
      'exportedAt': '2026-09-06T10:00:00.000',
      'data': data,
    });

BackupTransferService _service(
  KeyValueStore store,
  FakeBackupFileGateway gateway,
) =>
    BackupTransferService(
      repository: BackupRepositoryImpl(store),
      gateway: gateway,
    );

void main() {
  test('A. a configured PIN never appears in the exported bytes', () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    expect(await pinService.isPinConfigured(), isTrue);

    final store = InMemoryKeyValueStore({
      kDataKey: _validItems,
      kSettingsKey: '{"theme":"dark"}',
      kGoalsKey: '[]',
    });
    final gateway = FakeBackupFileGateway();

    expect(await _service(store, gateway).exportToFile(),
        isA<BackupExportSaved>());

    final text = utf8.decode(gateway.lastSavedBytes!);
    expect(text.contains(kPinRecordStorageKey), isFalse);
    expect(text.contains(_kPin), isFalse);
    // The record's own material, taken straight from the secure store, must
    // not appear anywhere in the file either.
    final record = await secure.read(kPinRecordStorageKey);
    expect(record, isNotNull);
    final decodedRecord = jsonDecode(record!) as Map<String, Object?>;
    for (final value in decodedRecord.values) {
      if (value is String && value.length > 8) {
        expect(text.contains(value), isFalse,
            reason: 'PIN salt/verifier material leaked into the backup');
      }
    }
    // And the export path never touched the secure store.
    expect(secure.writeCount, 1, reason: 'only the setPin() above may have written');
  });

  test('B. a financial restore leaves a configured Flutter PIN unchanged',
      () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    final recordBefore = await secure.read(kPinRecordStorageKey);
    final writesBefore = secure.writeCount;

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({
        kDataKey: _validItems,
        kSettingsKey: '{"theme":"light"}',
        kGoalsKey: '[]',
      }));
    final service = _service(store, gateway);

    final ready = await service.prepareImport() as BackupImportReady;
    expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());

    expect(await pinService.isPinConfigured(), isTrue);
    expect(await secure.read(kPinRecordStorageKey), recordBefore);
    expect(secure.writeCount, writesBefore,
        reason: 'the restore path must never write to secure storage');
    expect(await pinService.verifyPin(_kPin), isTrue);
  });

  test('C. importing a Web backup with a legacy pinHash does NOT configure a '
      'Flutter PIN', () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    expect(await pinService.isPinConfigured(), isFalse);

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({
        kDataKey: _validItems,
        kSettingsKey: _settingsWithLegacyPinHash('a' * 64),
        kGoalsKey: '[]',
      }));
    final service = _service(store, gateway);

    final ready = await service.prepareImport() as BackupImportReady;
    expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());

    // The app stays unlocked-by-configuration, and no verifier record was
    // fabricated from the legacy hash.
    expect(await pinService.isPinConfigured(), isFalse);
    expect(await secure.read(kPinRecordStorageKey), isNull);
    expect(secure.writeCount, 0);

    // The legacy field itself is preserved verbatim in storage — removing it
    // would be a backup-contract change, which is explicitly out of scope.
    final restored = await store.getString(kSettingsKey);
    expect(jsonDecode(restored!), containsPair('pinHash', 'a' * 64));
  });

  test('D. a legacy pinHash cannot overwrite an existing Flutter PIN',
      () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    final recordBefore = await secure.read(kPinRecordStorageKey);

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({
        kDataKey: _validItems,
        kSettingsKey: _settingsWithLegacyPinHash('b' * 64),
        kGoalsKey: '[]',
      }));
    final service = _service(store, gateway);

    final ready = await service.prepareImport() as BackupImportReady;
    expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());

    expect(await secure.read(kPinRecordStorageKey), recordBefore);
    expect(await pinService.verifyPin(_kPin), isTrue,
        reason: 'the original PIN still unlocks the app');
  });

  test('E. a backup that tries to inject ff_pin_v1 is rejected outright',
      () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    final recordBefore = await secure.read(kPinRecordStorageKey);

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({
        kDataKey: _validItems,
        kGoalsKey: '[]',
        // Not in the family_finance_ namespace -> the pre-existing validator
        // refuses the whole envelope. It never reaches a write path, and it
        // could not reach secure storage even if it did.
        kPinRecordStorageKey: '{"v":1,"saltB64":"AAAA","verifierB64":"AAAA"}',
      }));
    final service = _service(store, gateway);

    final prepared = await service.prepareImport();
    expect(prepared, isA<BackupImportRejected>());
    expect((prepared as BackupImportRejected).kind,
        BackupTransferFailureKind.validation);

    // Nothing changed anywhere.
    expect(await store.getString(kDataKey), '[]');
    expect(await secure.read(kPinRecordStorageKey), recordBefore);
    expect(await pinService.verifyPin(_kPin), isTrue);
  });

  test('E2. even a family_finance_-prefixed key cannot become a secure-store '
      'record', () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({
        kDataKey: _validItems,
        kGoalsKey: '[]',
        // A hostile file cannot smuggle a verifier in under a legal key
        // either: this lands in the ordinary KeyValueStore and is inert.
        'family_finance_$kPinRecordStorageKey':
            '{"v":1,"saltB64":"AAAA","verifierB64":"AAAA"}',
      }));
    final service = _service(store, gateway);

    final ready = await service.prepareImport() as BackupImportReady;
    expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());

    // It is just an ordinary stored string. The real record is untouched and
    // the real PIN still works.
    expect(await pinService.isPinConfigured(), isTrue);
    expect(await pinService.verifyPin(_kPin), isTrue);
    expect(await pinService.verifyPin('000000'), isFalse);
  });

  test('a secure-storage failure is never interpreted as a successful restore',
      () async {
    // The two layers are independent: a broken secure store cannot make a
    // financial restore look successful, and cannot make it fail either.
    final secure = FakeSecureSecretStore()..failReads = true;
    final pinService = PinService(secure, iterations: _kTestIterations);

    final store = InMemoryKeyValueStore({kDataKey: '[]'});
    final gateway = FakeBackupFileGateway()
      ..willPickText(_envelope({kDataKey: _validItems, kGoalsKey: '[]'}));
    final service = _service(store, gateway);

    final ready = await service.prepareImport() as BackupImportReady;
    expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());

    // And the security layer still reports its own failure honestly rather
    // than "no PIN configured".
    await expectLater(pinService.isPinConfigured(), throwsA(isA<Object>()));
  });
}
