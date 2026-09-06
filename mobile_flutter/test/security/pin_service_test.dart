import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/security/pin_service.dart';
import 'package:familyfinance_pro/security/pin_verifier.dart';
import 'package:familyfinance_pro/security/security_errors.dart';

import '../fakes/fake_secure_secret_store.dart';

/// Milestone 7, sections 2, 3, 5, 10 and 13 — [PinService] behaviour.
///
/// PERFORMANCE: every service here is built with `iterations: 1000`.
/// Production's 210000 is a deliberate work factor, not something a unit test
/// should pay for; [PinService] always verifies with the iteration count
/// stored INSIDE the record, so this substitution is faithful.
const int _kTestIterations = 1000;

PinService _service(FakeSecureSecretStore store) =>
    PinService(store, iterations: _kTestIterations);

void main() {
  group('configuration state', () {
    test('isPinConfigured is false on an empty store, true after setPin',
        () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);

      expect(await service.isPinConfigured(), isFalse);
      await service.setPin('1234');
      expect(await service.isPinConfigured(), isTrue);
    });

    test('setPin then verifyPin: correct PIN true, wrong PIN false', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('123456');

      expect(await service.verifyPin('123456'), isTrue);
      expect(await service.verifyPin('123457'), isFalse);
      expect(await service.verifyPin('1234'), isFalse);
    });

    test('setPin rejects a malformed PIN and writes NOTHING', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);

      await expectLater(service.setPin('123'), throwsA(isA<InvalidPinFormat>()));
      await expectLater(
          service.setPin('1234567'), throwsA(isA<InvalidPinFormat>()));
      await expectLater(
          service.setPin('12a4'), throwsA(isA<InvalidPinFormat>()));
      await expectLater(service.setPin(''), throwsA(isA<InvalidPinFormat>()));

      expect(store.snapshot, isEmpty);
      expect(store.writeCount, 0);
      expect(await service.isPinConfigured(), isFalse);
    });

    test('setPin refuses to overwrite an already-configured record', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      final before = store.snapshot[kPinRecordStorageKey];

      await expectLater(
          service.setPin('9999'), throwsA(isA<PinConfigurationFailure>()));

      // The guard exists precisely so a UI bug cannot silently replace a
      // configured PIN without verifying the current one — a full bypass.
      expect(store.snapshot[kPinRecordStorageKey], before);
      expect(await service.verifyPin('1234'), isTrue);
      expect(await service.verifyPin('9999'), isFalse);
    });

    test('verifyPin on an unconfigured store THROWS rather than returning false',
        () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      // "cannot check" and "checked, wrong" are different answers and must
      // never be conflated.
      await expectLater(
          service.verifyPin('1234'), throwsA(isA<PinConfigurationFailure>()));
    });
  });

  group('stored material', () {
    test('no plaintext PIN is stored anywhere', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      for (final entry in store.snapshot.entries) {
        expect(entry.key.contains('1234'), isFalse);
        expect(entry.value.contains('1234'), isFalse);
      }
    });

    test('exactly one key is used, it is kPinRecordStorageKey, and it is NOT '
        'in the family_finance backup namespace', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      expect(store.snapshot.keys, hasLength(1));
      expect(store.snapshot.keys.single, kPinRecordStorageKey);
      expect(kPinRecordStorageKey, 'ff_pin_v1');
      // Section 12's isolation is structural: the backup sweep collects the
      // 'family_finance' prefix, so the auth namespace must never start with
      // it.
      expect(kPinRecordStorageKey.startsWith('family_finance'), isFalse);
    });

    test('the stored record decodes to a well-formed verifier record',
        () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      final record =
          PinVerifierRecord.decode(store.snapshot[kPinRecordStorageKey]!);
      expect(record.version, kPinRecordVersion);
      expect(record.kdf, kPinKdfId);
      expect(record.iterations, _kTestIterations);
      expect(record.salt.length, kPinSaltLengthBytes);
      expect(record.verifier.length, kPinVerifierLengthBits ~/ 8);
    });

    test('two installs of the same PIN produce different stored records',
        () async {
      final a = FakeSecureSecretStore();
      final b = FakeSecureSecretStore();
      await _service(a).setPin('1234');
      await _service(b).setPin('1234');

      // Per-install salt: identical PINs must not yield identical verifiers.
      expect(a.snapshot[kPinRecordStorageKey],
          isNot(b.snapshot[kPinRecordStorageKey]));
    });
  });

  group('changePin', () {
    test('wrong current PIN throws and leaves the record byte-identical',
        () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      final before = store.snapshot[kPinRecordStorageKey];

      await expectLater(
        service.changePin(currentPin: '9999', newPin: '5678'),
        throwsA(isA<PinVerificationFailure>()),
      );

      expect(store.snapshot[kPinRecordStorageKey], before);
      expect(await service.verifyPin('1234'), isTrue);
      expect(await service.verifyPin('5678'), isFalse);
    });

    test('correct current PIN: old PIN stops working, new one works, salt is '
        'regenerated', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      final oldRecord =
          PinVerifierRecord.decode(store.snapshot[kPinRecordStorageKey]!);

      await service.changePin(currentPin: '1234', newPin: '567890');

      expect(await service.verifyPin('1234'), isFalse);
      expect(await service.verifyPin('567890'), isTrue);

      final newRecord =
          PinVerifierRecord.decode(store.snapshot[kPinRecordStorageKey]!);
      // Section 3: the salt is regenerated on every change, so it is
      // per-install AND per-PIN.
      expect(newRecord.salt, isNot(equals(oldRecord.salt)));
      expect(newRecord.verifier, isNot(equals(oldRecord.verifier)));
      // Still exactly one key — a change is one atomic record replacement.
      expect(store.snapshot.keys, hasLength(1));
    });

    test('a malformed NEW pin throws InvalidPinFormat after the current PIN '
        'was verified, and leaves the record unchanged', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      final before = store.snapshot[kPinRecordStorageKey];
      final writesBefore = store.writeCount;

      await expectLater(
        service.changePin(currentPin: '1234', newPin: 'abcd'),
        throwsA(isA<InvalidPinFormat>()),
      );

      expect(store.snapshot[kPinRecordStorageKey], before);
      expect(store.writeCount, writesBefore);
      expect(await service.verifyPin('1234'), isTrue);
    });

    test('a malformed new pin with a WRONG current pin reports the '
        'verification failure, not the format failure', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      // Order matters: the current PIN is authenticated first, so a caller
      // cannot use the format error as an oracle for anything.
      await expectLater(
        service.changePin(currentPin: '0000', newPin: 'abcd'),
        throwsA(isA<PinVerificationFailure>()),
      );
    });
  });

  group('disablePin', () {
    test('correct PIN removes the record entirely', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      await service.disablePin(currentPin: '1234');

      expect(await service.isPinConfigured(), isFalse);
      expect(store.snapshot, isEmpty);
    });

    test('wrong PIN throws and the record survives', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      final before = store.snapshot[kPinRecordStorageKey];

      await expectLater(service.disablePin(currentPin: '9999'),
          throwsA(isA<PinVerificationFailure>()));

      expect(store.snapshot[kPinRecordStorageKey], before);
      expect(await service.isPinConfigured(), isTrue);
      expect(store.deleteCount, 0);
    });

    test('a delete failure propagates — the caller is never told the PIN was '
        'removed while it still exists', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      store.failDeletes = true;

      await expectLater(service.disablePin(currentPin: '1234'),
          throwsA(isA<SecureStorageDeleteFailure>()));

      store.failDeletes = false;
      expect(await service.isPinConfigured(), isTrue);
      expect(await service.verifyPin('1234'), isTrue);
    });
  });

  group('storage-failure isolation (section 5)', () {
    test('a read failure makes isPinConfigured THROW, never return false',
        () async {
      final store = FakeSecureSecretStore();
      store.failReads = true;
      final service = _service(store);

      await expectLater(
          service.isPinConfigured(), throwsA(isA<SecureStorageReadFailure>()));
    });

    test('a read failure makes verifyPin throw rather than unlock', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');
      store.failReads = true;

      await expectLater(
          service.verifyPin('1234'), throwsA(isA<SecureStorageReadFailure>()));
    });

    test('a write failure makes setPin throw SecureStorageWriteFailure',
        () async {
      final store = FakeSecureSecretStore();
      store.failWrites = true;
      final service = _service(store);

      await expectLater(
          service.setPin('1234'), throwsA(isA<SecureStorageWriteFailure>()));
      expect(store.snapshot, isEmpty);
    });

    test('a corrupt stored record throws PinConfigurationFailure rather than '
        'reporting "not configured"', () async {
      final store =
          FakeSecureSecretStore(initial: {kPinRecordStorageKey: 'not json'});
      final service = _service(store);

      // Downgrading an unreadable record to "no PIN configured" would be a
      // complete bypass of the lock.
      await expectLater(service.isPinConfigured(),
          throwsA(isA<PinConfigurationFailure>()));
      await expectLater(
          service.verifyPin('1234'), throwsA(isA<PinConfigurationFailure>()));
      await expectLater(
          service.setPin('1234'), throwsA(isA<PinConfigurationFailure>()));
      expect(store.snapshot[kPinRecordStorageKey], 'not json');
    });

    test('a security error never carries the PIN in its message', () async {
      final store = FakeSecureSecretStore();
      final service = _service(store);
      await service.setPin('1234');

      try {
        await service.changePin(currentPin: '9999', newPin: '5678');
        fail('expected PinVerificationFailure');
      } on SecurityError catch (e) {
        expect(e.toString().contains('9999'), isFalse);
        expect(e.toString().contains('5678'), isFalse);
      }
    });
  });
}
