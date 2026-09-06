import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/security/pin_verifier.dart';
import 'package:familyfinance_pro/security/security_errors.dart';

/// Milestone 7, sections 2 + 3 — the PIN verifier primitives.
///
/// PERFORMANCE: production uses [kPinKdfIterations] (210000). Every test here
/// derives with 1000 iterations (one deliberate exception at 2000, to prove
/// the iteration count is part of the derivation), because the work factor
/// itself is a production parameter, not something a unit test can verify.
const int _kTestIterations = 1000;

/// A fixed salt so every derivation assertion is deterministic and
/// reproducible — no test here depends on CSPRNG output except the two that
/// are explicitly about [generatePinSalt].
final Uint8List _fixedSalt =
    Uint8List.fromList(List<int>.generate(kPinSaltLengthBytes, (i) => i));

String _encodeRecordJson({
  Object? v = kPinRecordVersion,
  Object? kdf = kPinKdfId,
  Object? iterations = _kTestIterations,
  // Defaults are VALID lengths (16-byte salt, 32-byte verifier) so that a
  // test overriding one field still fails for the reason it is testing,
  // rather than tripping decode's length check first.
  Object? saltB64 = 'AAAAAAAAAAAAAAAAAAAAAA==',
  Object? verifierB64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  bool omitIterations = false,
}) {
  final map = <String, Object?>{
    'v': v,
    'kdf': kdf,
    'saltB64': saltB64,
    'verifierB64': verifierB64,
  };
  if (!omitIterations) map['iterations'] = iterations;
  return jsonEncode(map);
}

void main() {
  group('isValidPinFormat', () {
    test('accepts the authoritative 4–6 ASCII digit range', () {
      expect(isValidPinFormat('1234'), isTrue);
      expect(isValidPinFormat('12345'), isTrue);
      expect(isValidPinFormat('123456'), isTrue);
      expect(isValidPinFormat('0000'), isTrue);
    });

    test('rejects too short, too long, empty, letters and whitespace', () {
      expect(isValidPinFormat('123'), isFalse);
      expect(isValidPinFormat('1234567'), isFalse);
      expect(isValidPinFormat(''), isFalse);
      expect(isValidPinFormat('12a4'), isFalse);
      expect(isValidPinFormat('12 34'), isFalse);
      expect(isValidPinFormat(' 1234'), isFalse);
      expect(isValidPinFormat('1234\n'), isFalse);
    });

    test('rejects non-ASCII digits (Dart RegExp \\d is ASCII-only here)', () {
      // Devanagari digits. Dart's RegExp is not created with the unicode
      // flag, so \d means [0-9] only — asserting the REAL behaviour, which is
      // also the desired one: the numeric keypad UI can only ever produce
      // ASCII digits, so anything else arriving here is not a legitimate PIN.
      expect(isValidPinFormat('१२३४'), isFalse);
      // Arabic-Indic digits, same reasoning.
      expect(isValidPinFormat('١٢٣٤'), isFalse);
      // Fullwidth digits.
      expect(isValidPinFormat('１２３４'), isFalse);
    });
  });

  group('derivePinVerifier', () {
    test('is deterministic for the same pin + salt + iterations', () async {
      final a = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: _kTestIterations);
      final b = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: _kTestIterations);
      expect(a, equals(b));
    });

    test('a different salt produces a different verifier for the same PIN',
        () async {
      final otherSalt = Uint8List.fromList(
          List<int>.generate(kPinSaltLengthBytes, (i) => 255 - i));
      final a = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: _kTestIterations);
      final b = await derivePinVerifier(
          pin: '1234', salt: otherSalt, iterations: _kTestIterations);
      expect(a, isNot(equals(b)));
    });

    test('a different PIN produces a different verifier for the same salt',
        () async {
      final a = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: _kTestIterations);
      final b = await derivePinVerifier(
          pin: '1235', salt: _fixedSalt, iterations: _kTestIterations);
      expect(a, isNot(equals(b)));
    });

    test('a different iteration count produces a different verifier', () async {
      // The ONE test that deliberately uses a second (still small) work
      // factor — proving `iterations` genuinely participates in the KDF, so a
      // stored record verified with the wrong count could never accidentally
      // match.
      final a = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: _kTestIterations);
      final b = await derivePinVerifier(
          pin: '1234', salt: _fixedSalt, iterations: 2000);
      expect(a, isNot(equals(b)));
    });

    test('output is exactly kPinVerifierLengthBits ~/ 8 bytes', () async {
      final v = await derivePinVerifier(
          pin: '123456', salt: _fixedSalt, iterations: _kTestIterations);
      expect(v.length, kPinVerifierLengthBits ~/ 8);
      expect(v.length, 32);
      expect(v.length, kPinVerifierLengthBytes);
    });
  });

  group('generatePinSalt', () {
    test('returns kPinSaltLengthBytes bytes', () {
      expect(generatePinSalt().length, kPinSaltLengthBytes);
      expect(generatePinSalt().length, 16);
    });

    test('two consecutive CSPRNG salts differ', () {
      // A false failure would require two independent 128-bit values to
      // collide (~2^-128).
      final a = generatePinSalt();
      final b = generatePinSalt();
      expect(a, isNot(equals(b)));
    });

    test('honours an injected Random so tests can be deterministic', () {
      final a = generatePinSalt(random: Random(42));
      final b = generatePinSalt(random: Random(42));
      expect(a, equals(b));
      expect(a, isNot(equals(generatePinSalt(random: Random(43)))));
    });

    test('honours an explicit length', () {
      expect(generatePinSalt(length: 32).length, 32);
    });
  });

  group('constantTimeBytesEqual', () {
    test('true for equal, equal-length lists', () {
      expect(constantTimeBytesEqual([1, 2, 3, 4], [1, 2, 3, 4]), isTrue);
      expect(constantTimeBytesEqual(const <int>[], const <int>[]), isTrue);
      final long = List<int>.generate(32, (i) => (i * 7) % 256);
      expect(constantTimeBytesEqual(long, List<int>.from(long)), isTrue);
    });

    test('false for differing lengths', () {
      expect(constantTimeBytesEqual([1, 2, 3], [1, 2, 3, 4]), isFalse);
      expect(constantTimeBytesEqual([1, 2, 3, 4], [1, 2, 3]), isFalse);
      expect(constantTimeBytesEqual(const <int>[], [0]), isFalse);
    });

    test('false when only the FIRST byte differs', () {
      expect(constantTimeBytesEqual([9, 2, 3, 4], [1, 2, 3, 4]), isFalse);
    });

    test('false when only the LAST byte differs', () {
      // The case a naive early-return implementation still gets right — it is
      // asserted alongside the first-byte case so both ends of the loop are
      // covered.
      expect(constantTimeBytesEqual([1, 2, 3, 4], [1, 2, 3, 9]), isFalse);
    });

    test('false when only a middle byte differs by a single bit', () {
      expect(constantTimeBytesEqual([1, 2, 3, 4], [1, 3, 3, 4]), isFalse);
    });
  });

  group('PinVerifierRecord encode/decode', () {
    test('round-trips version, kdf, iterations, salt and verifier byte-for-byte',
        () async {
      final verifier = await derivePinVerifier(
          pin: '123456', salt: _fixedSalt, iterations: _kTestIterations);
      final record = PinVerifierRecord(
        version: kPinRecordVersion,
        kdf: kPinKdfId,
        iterations: _kTestIterations,
        salt: _fixedSalt,
        verifier: verifier,
      );

      final decoded = PinVerifierRecord.decode(record.encode());

      expect(decoded.version, kPinRecordVersion);
      expect(decoded.kdf, kPinKdfId);
      expect(decoded.iterations, _kTestIterations);
      expect(decoded.salt, equals(_fixedSalt));
      expect(decoded.verifier, equals(verifier));
      // And the decoded material still verifies the same PIN.
      expect(
        constantTimeBytesEqual(
          decoded.verifier,
          await derivePinVerifier(
              pin: '123456',
              salt: decoded.salt,
              iterations: decoded.iterations),
        ),
        isTrue,
      );
    });

    test('the encoded record never contains the plaintext PIN', () async {
      const pin = '4321';
      final verifier = await derivePinVerifier(
          pin: pin, salt: _fixedSalt, iterations: _kTestIterations);
      final encoded = PinVerifierRecord(
        version: kPinRecordVersion,
        kdf: kPinKdfId,
        iterations: _kTestIterations,
        salt: _fixedSalt,
        verifier: verifier,
      ).encode();

      expect(encoded.contains(pin), isFalse);
    });

    test('decode rejects non-JSON garbage', () {
      expect(() => PinVerifierRecord.decode('not json at all'),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(''),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects a JSON array instead of an object', () {
      expect(() => PinVerifierRecord.decode('[1,2,3]'),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode('"a string"'),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode('null'),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects a wrong record version', () {
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(v: 2)),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(v: '1')),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(v: null)),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects an unknown KDF', () {
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(kdf: 'md5')),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(kdf: null)),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects missing / zero / negative / non-int iterations', () {
      expect(
          () =>
              PinVerifierRecord.decode(_encodeRecordJson(omitIterations: true)),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(iterations: 0)),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(iterations: -1)),
          throwsA(isA<PinConfigurationFailure>()));
      expect(
          () => PinVerifierRecord.decode(_encodeRecordJson(iterations: '1000')),
          throwsA(isA<PinConfigurationFailure>()));
      expect(
          () => PinVerifierRecord.decode(_encodeRecordJson(iterations: 1000.5)),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects a non-base64 salt', () {
      expect(
          () => PinVerifierRecord.decode(_encodeRecordJson(saltB64: '@@@@!!')),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(saltB64: 123)),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('decode rejects an empty salt or an empty verifier', () {
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(saltB64: '')),
          throwsA(isA<PinConfigurationFailure>()));
      expect(() => PinVerifierRecord.decode(_encodeRecordJson(verifierB64: '')),
          throwsA(isA<PinConfigurationFailure>()));
    });

    test('a salt or verifier of the wrong LENGTH is rejected, not silently accepted', () {
      // Regression guard for a real failure mode: a truncated record that
      // decoded "successfully" would then mismatch on length inside
      // constantTimeBytesEqual, so the user would be told "wrong PIN"
      // forever for a PIN that is actually correct — a corrupt record
      // masquerading as a forgotten one. Both lengths are fixed for
      // record version 1 and must be enforced at decode time.
      expect(
        () => PinVerifierRecord.decode(_encodeRecordJson(saltB64: 'AAAAAAAA')), // 6 bytes
        throwsA(isA<PinConfigurationFailure>()),
      );
      expect(
        () => PinVerifierRecord.decode(
          // 17 bytes: one byte too long, not merely "short".
          _encodeRecordJson(saltB64: 'AAAAAAAAAAAAAAAAAAAAAAA='),
        ),
        throwsA(isA<PinConfigurationFailure>()),
      );
      expect(
        () => PinVerifierRecord.decode(
          _encodeRecordJson(verifierB64: 'AAAAAAAAAAAAAAAAAAAAAA=='), // 16 bytes
        ),
        throwsA(isA<PinConfigurationFailure>()),
      );
    });

    test('a record with both lengths correct still decodes', () {
      // The complement of the test above: the length check must not have
      // made every record undecodable.
      final record = PinVerifierRecord.decode(_encodeRecordJson());
      expect(record.salt, hasLength(kPinSaltLengthBytes));
      expect(record.verifier, hasLength(kPinVerifierLengthBytes));
    });

    test('a decode failure is a SecurityError carrying no secret material', () {
      // Section 13: the message is a fixed Hebrew literal — it must never
      // echo back the raw (potentially secret-bearing) input.
      const raw = '{"v":1,"kdf":"pbkdf2-hmac-sha256","iterations":0,'
          '"saltB64":"AAAA","verifierB64":"SECRETMATERIAL"}';
      try {
        PinVerifierRecord.decode(raw);
        fail('expected PinConfigurationFailure');
      } on PinConfigurationFailure catch (e) {
        expect(e, isA<SecurityError>());
        expect(e.message.contains('SECRETMATERIAL'), isFalse);
        expect(e.toString().contains('SECRETMATERIAL'), isFalse);
      }
    });
  });
}
