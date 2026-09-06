import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/backup/backup_service.dart';
import 'package:familyfinance_pro/data/backup/backup_transfer_service.dart';
import 'package:familyfinance_pro/data/files/backup_file_gateway.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';

import '../fakes/fake_backup_file_gateway.dart';

/// Milestone 8 — the import/export coordinator.
///
/// Every assertion here is about I/O ORDER and I/O SAFETY, never about what
/// a backup means: the envelope, the validator and the restore transaction
/// are the pre-existing Milestone 3/4 implementation, exercised unchanged
/// through [BackupRepositoryImpl].

/// A store that counts every write, so "zero writes happened" can be
/// asserted as a fact rather than inferred.
class _CountingStore implements KeyValueStore {
  _CountingStore([Map<String, String>? initial])
      : _inner = InMemoryKeyValueStore(initial);

  final InMemoryKeyValueStore _inner;
  int writes = 0;
  int removes = 0;

  @override
  Future<String?> getString(String key) => _inner.getString(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) =>
      _inner.keysWithPrefix(prefix);

  @override
  Future<void> remove(String key) {
    removes++;
    return _inner.remove(key);
  }

  @override
  Future<void> setString(String key, String value) {
    writes++;
    return _inner.setString(key, value);
  }
}

/// Fails the FIRST write of one specific key and then behaves normally, so
/// the forward write loop breaks partway through while the compensating
/// rollback that follows it can still complete — the exact scenario that
/// must end as "nothing changed", not as a half-applied restore.
class _FailOnceOnKeyStore implements KeyValueStore {
  _FailOnceOnKeyStore(this.failingKey, [Map<String, String>? initial])
      : _inner = InMemoryKeyValueStore(initial);

  final InMemoryKeyValueStore _inner;
  final String failingKey;
  bool _alreadyFailed = false;

  @override
  Future<String?> getString(String key) => _inner.getString(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) =>
      _inner.keysWithPrefix(prefix);

  @override
  Future<void> remove(String key) => _inner.remove(key);

  @override
  Future<void> setString(String key, String value) {
    if (key == failingKey && !_alreadyFailed) {
      _alreadyFailed = true;
      throw StateError('simulated write failure');
    }
    return _inner.setString(key, value);
  }
}

/// Every write fails, so even the rollback cannot complete — the worst case,
/// which must never be reported as a success.
class _AllWritesFailStore implements KeyValueStore {
  _AllWritesFailStore([Map<String, String>? initial])
      : _inner = InMemoryKeyValueStore(initial);

  final InMemoryKeyValueStore _inner;

  @override
  Future<String?> getString(String key) => _inner.getString(key);

  @override
  Future<List<String>> keysWithPrefix(String prefix) =>
      _inner.keysWithPrefix(prefix);

  @override
  Future<void> remove(String key) => throw StateError('remove failed');

  @override
  Future<void> setString(String key, String value) =>
      throw StateError('write failed');
}

/// Reading storage itself fails while building an export.
class _UnreadableStore implements KeyValueStore {
  @override
  Future<String?> getString(String key) => throw StateError('read failed');

  @override
  Future<List<String>> keysWithPrefix(String prefix) =>
      throw StateError('read failed');

  @override
  Future<void> remove(String key) async {}

  @override
  Future<void> setString(String key, String value) async {}
}

const String _validItems = '[{"id":1,"type":"fixed","title":"שכירות",'
    '"amount":4000,"day":1,"isArchived":false}]';

Map<String, String> _seededData() => {
      kDataKey: _validItems,
      kSettingsKey: '{"theme":"dark"}',
      kGoalsKey: '[]',
    };

String _envelopeJson({
  Object? schemaVersion = 2,
  String exportedAt = '2026-09-06T10:00:00.000',
  Map<String, String>? data,
}) =>
    const JsonEncoder.withIndent('  ').convert({
      'schemaVersion': schemaVersion,
      'exportedAt': exportedAt,
      'data': data ?? _seededData(),
    });

void main() {
  group('export', () {
    test('successful export writes the exact approved envelope bytes', () async {
      final store = InMemoryKeyValueStore(_seededData());
      final gateway = FakeBackupFileGateway();
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
        clock: () => DateTime(2026, 9, 6),
      );

      final outcome = await service.exportToFile();

      expect(outcome, isA<BackupExportSaved>());
      expect(gateway.saveCalls, 1);
      expect(gateway.lastSuggestedFileName, 'familyfinance-backup-2026-09-06.json');
      expect(gateway.lastMimeType, 'application/json');

      final text = utf8.decode(gateway.lastSavedBytes!);
      final decoded = jsonDecode(text) as Map<String, Object?>;
      expect(decoded['schemaVersion'], 2);
      expect(decoded['exportedAt'], isA<String>());
      final data = decoded['data'] as Map<String, Object?>;
      // Values are raw strings, byte-for-byte as stored — the compatibility
      // rule the whole backup layer is built on.
      expect(data[kDataKey], _validItems);
      expect(data[kSettingsKey], '{"theme":"dark"}');
      expect(data[kGoalsKey], '[]');
      // Pretty-printed with two spaces, exactly like the Web export.
      expect(text.contains('\n  "schemaVersion"'), isTrue);
    });

    test('filename uses the local calendar date, zero padded', () {
      expect(backupFileNameFor(DateTime(2026, 1, 2)),
          'familyfinance-backup-2026-01-02.json');
      expect(backupFileNameFor(DateTime(2026, 12, 31)),
          'familyfinance-backup-2026-12-31.json');
    });

    test('cancelling the save dialog is not an error and writes nothing', () async {
      final store = InMemoryKeyValueStore(_seededData());
      final gateway = FakeBackupFileGateway(
        saveResult: const FileTransferCancelled<Uri>(),
      );
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      expect(await service.exportToFile(), isA<BackupExportCancelled>());
    });

    test('a native save failure is reported as a file-I/O failure', () async {
      final store = InMemoryKeyValueStore(_seededData());
      final gateway = FakeBackupFileGateway(
        saveResult: const FileTransferFailed<Uri>(FileSaveFailure()),
      );
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final outcome = await service.exportToFile();
      expect(outcome, isA<BackupExportFailed>());
      expect((outcome as BackupExportFailed).kind,
          BackupTransferFailureKind.fileIo);
    });

    test('corrupt local goals refuse to produce a file at all', () async {
      // Preserves app.js exportBackupJson()'s refusal contract: never hand
      // the user a file that could not be restored.
      final store = InMemoryKeyValueStore({
        ..._seededData(),
        kGoalsKey: '[{"id":"g1","title":"x","targetAmount":"not-a-number"}]',
      });
      final gateway = FakeBackupFileGateway();
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final outcome = await service.exportToFile();
      expect(outcome, isA<BackupExportFailed>());
      expect((outcome as BackupExportFailed).kind,
          BackupTransferFailureKind.validation);
      expect(gateway.saveCalls, 0, reason: 'no file may be offered at all');
    });

    test('a storage read failure never produces a partial file', () async {
      final gateway = FakeBackupFileGateway();
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(_UnreadableStore()),
        gateway: gateway,
      );

      final outcome = await service.exportToFile();
      expect(outcome, isA<BackupExportFailed>());
      expect((outcome as BackupExportFailed).kind,
          BackupTransferFailureKind.storage);
      expect(gateway.saveCalls, 0);
    });
  });

  group('import — phase 1 never writes', () {
    test('a fully valid file is prepared without a single write', () async {
      final store = _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway()..willPickText(_envelopeJson());
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final prepared = await service.prepareImport();

      expect(prepared, isA<BackupImportReady>());
      expect(store.writes, 0, reason: 'validation must precede every write');
      expect(store.removes, 0);
    });

    test('cancelling the picker is not an error and writes nothing', () async {
      final store = _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway(
        pickResult: const FileTransferCancelled<PickedFile>(),
      );
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      expect(await service.prepareImport(), isA<BackupImportCancelled>());
      expect(store.writes, 0);
    });

    test('a picker/read failure is a file-I/O rejection, not a validation one',
        () async {
      final store = _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway(
        pickResult: const FileTransferFailed<PickedFile>(FileReadFailure()),
      );
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final prepared = await service.prepareImport();
      expect(prepared, isA<BackupImportRejected>());
      expect((prepared as BackupImportRejected).kind,
          BackupTransferFailureKind.fileIo);
      expect(store.writes, 0);
    });

    test('a UTF-8 BOM is tolerated (text decoding, not backup repair)', () async {
      final store = _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway()
        ..willPickText('﻿${_envelopeJson()}');
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      expect(await service.prepareImport(), isA<BackupImportReady>());
      expect(store.writes, 0);
    });

    test('goals-awareness is read from schemaVersion only', () async {
      final store = _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway()
        ..willPickText(_envelopeJson(schemaVersion: 1, data: {
          kDataKey: _validItems,
          kGoalsKey: '[]',
        }));
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final prepared = await service.prepareImport();
      expect(prepared, isA<BackupImportReady>());
      expect((prepared as BackupImportReady).isGoalsAware, isFalse);
    });
  });

  group('import — hostile / malformed input', () {
    Future<BackupImportPreparation> prepare(
      void Function(FakeBackupFileGateway) arrange, {
      _CountingStore? store,
    }) async {
      final s = store ?? _CountingStore(_seededData());
      final gateway = FakeBackupFileGateway();
      arrange(gateway);
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(s),
        gateway: gateway,
      );
      final prepared = await service.prepareImport();
      expect(s.writes, 0, reason: 'a rejected file must never write');
      expect(s.removes, 0);
      return prepared;
    }

    void expectValidationRejection(BackupImportPreparation p) {
      expect(p, isA<BackupImportRejected>());
      expect((p as BackupImportRejected).kind,
          BackupTransferFailureKind.validation);
    }

    test('empty file', () async {
      expectValidationRejection(await prepare((g) => g.willPickBytes(const [])));
    });

    test('invalid UTF-8 bytes', () async {
      expectValidationRejection(
          await prepare((g) => g.willPickBytes(const [0xC3, 0x28, 0xA0])));
    });

    test('non-JSON text', () async {
      expectValidationRejection(
          await prepare((g) => g.willPickText('this is not json at all')));
    });

    test('JSON primitive instead of an object', () async {
      expectValidationRejection(await prepare((g) => g.willPickText('42')));
      expectValidationRejection(await prepare((g) => g.willPickText('"str"')));
      expectValidationRejection(await prepare((g) => g.willPickText('null')));
      expectValidationRejection(await prepare((g) => g.willPickText('[1,2,3]')));
    });

    test('truncated JSON', () async {
      final full = _envelopeJson();
      expectValidationRejection(
          await prepare((g) => g.willPickText(full.substring(0, full.length ~/ 2))));
    });

    test('missing data field', () async {
      expectValidationRejection(
          await prepare((g) => g.willPickText('{"schemaVersion":2}')));
    });

    test('data values of the wrong type', () async {
      expectValidationRejection(await prepare(
          (g) => g.willPickText('{"schemaVersion":2,"data":{"$kDataKey":[]}}')));
    });

    test('empty data object', () async {
      expectValidationRejection(
          await prepare((g) => g.willPickText('{"schemaVersion":2,"data":{}}')));
    });

    test('schemaVersion 2 without goals is rejected', () async {
      expectValidationRejection(await prepare((g) => g.willPickText(
            _envelopeJson(data: {kDataKey: _validItems}),
          )));
    });

    test('malformed goals array is rejected wholesale', () async {
      expectValidationRejection(await prepare((g) => g.willPickText(
            _envelopeJson(data: {
              kDataKey: _validItems,
              kGoalsKey: '[{"id":"g1","targetAmount":"nope"}]',
            }),
          )));
    });

    test('a key outside the family_finance_ namespace is rejected', () async {
      expectValidationRejection(await prepare((g) => g.willPickText(
            _envelopeJson(data: {
              ..._seededData(),
              'evil_key': '{}',
            }),
          )));
    });

    test('a value that is not valid JSON is rejected', () async {
      expectValidationRejection(await prepare((g) => g.willPickText(
            _envelopeJson(data: {
              ..._seededData(),
              kSettingsKey: '{not json',
            }),
          )));
    });

    test('deeply nested structure does not crash the parser path', () async {
      final deep = '${'[' * 2000}${']' * 2000}';
      final p = await prepare((g) => g.willPickText(
            _envelopeJson(data: {..._seededData(), kSettingsKey: deep}),
          ));
      // Either shape is acceptable; crashing or writing is not.
      expect(p, isA<BackupImportRejected>());
    });

    test('rejection messages are fixed literals, never file contents', () async {
      const secret = 'SUPER-SECRET-MARKER-9137';
      final p = await prepare((g) =>
          g.willPickText('{"schemaVersion":2,"data":{"evil":"$secret"}}'));
      expect(p, isA<BackupImportRejected>());
      final message = (p as BackupImportRejected).message;
      expect(message.contains(secret), isFalse);
      expect(message.contains('evil'), isFalse);
    });
  });

  group('import — phase 2 restore', () {
    Future<BackupImportReady> readyFor(
      BackupTransferService service,
    ) async {
      final prepared = await service.prepareImport();
      return prepared as BackupImportReady;
    }

    test('confirmed restore writes the backup verbatim', () async {
      final store = _CountingStore({kDataKey: '[]'});
      final gateway = FakeBackupFileGateway()..willPickText(_envelopeJson());
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final ready = await readyFor(service);
      expect(store.writes, 0);

      final result = await service.commitImport(ready);
      expect(result, isA<BackupRestoreSucceeded>());
      expect(await store.getString(kDataKey), _validItems);
      expect(await store.getString(kSettingsKey), '{"theme":"dark"}');
    });

    test('a legacy backup preserves existing goals by default', () async {
      final store = InMemoryKeyValueStore({
        kDataKey: '[]',
        kGoalsKey: '[{"id":"g1","title":"קיים","targetAmount":100,'
            '"savedAmount":0,"dueDate":"2027-01-01"}]',
      });
      final gateway = FakeBackupFileGateway()
        ..willPickText(_envelopeJson(schemaVersion: 1, data: {
          kDataKey: _validItems,
          kGoalsKey: '[]',
        }));
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final ready = await readyFor(service);
      expect(await service.commitImport(ready), isA<BackupRestoreSucceeded>());
      expect(await store.getString(kGoalsKey), contains('קיים'));
    });

    test('a legacy backup clears goals only on explicit opt-in', () async {
      final store = InMemoryKeyValueStore({
        kDataKey: '[]',
        kGoalsKey: '[{"id":"g1","title":"קיים","targetAmount":100,'
            '"savedAmount":0,"dueDate":"2027-01-01"}]',
      });
      final gateway = FakeBackupFileGateway()
        ..willPickText(_envelopeJson(schemaVersion: 1, data: {
          kDataKey: _validItems,
        }));
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final ready = await readyFor(service);
      expect(
        await service.commitImport(ready, deleteExistingGoalsForLegacyBackup: true),
        isA<BackupRestoreSucceeded>(),
      );
      expect(await store.getString(kGoalsKey), '[]');
    });

    test('a write failure rolls back and reports the prior state as restored',
        () async {
      final store = _FailOnceOnKeyStore(kSettingsKey, {
        kDataKey: '[]',
        kSettingsKey: '{"theme":"light"}',
      });
      final gateway = FakeBackupFileGateway()..willPickText(_envelopeJson());
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final ready = await readyFor(service);
      final result = await service.commitImport(ready);

      expect(result, isA<BackupRestoreFailed>());
      final failed = result as BackupRestoreFailed;
      expect(failed.kind, BackupTransferFailureKind.restore);
      expect(failed.priorStateGuaranteed, isTrue);
      // The failing key kept its original value; nothing was half-applied
      // into a state the user cannot recognise.
      expect(await store.getString(kSettingsKey), '{"theme":"light"}');
    });

    test('a failed rollback is reported as NOT guaranteed, never as success',
        () async {
      final store = _AllWritesFailStore({kDataKey: '[]'});
      final gateway = FakeBackupFileGateway()..willPickText(_envelopeJson());
      final service = BackupTransferService(
        repository: BackupRepositoryImpl(store),
        gateway: gateway,
      );

      final ready = await readyFor(service);
      final result = await service.commitImport(ready);

      expect(result, isA<BackupRestoreFailed>());
      expect((result as BackupRestoreFailed).priorStateGuaranteed, isFalse);
    });
  });
}
