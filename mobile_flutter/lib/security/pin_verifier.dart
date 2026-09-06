import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'security_errors.dart';

/// PIN verifier material and its derivation (Milestone 7, sections 2 + 3).
///
/// Approved design:
/// - KDF: PBKDF2-HMAC-SHA256, supplied by the `cryptography` package's
///   tested [Pbkdf2] implementation. NO cryptographic primitive is
///   hand-written here — this file only chooses parameters, encodes the
///   record, and compares bytes.
/// - Salt: 16 random bytes from [Random.secure] (a CSPRNG), regenerated
///   fresh on every PIN set AND every PIN change, so it is both
///   per-install and per-PIN.
/// - Output: 32 bytes (256 bit).
/// - Comparison: constant-time.
///
/// HONEST LIMIT, stated in the threat model and NOT papered over: a 4–6
/// digit PIN has only 10^4–10^6 possible values. No KDF makes that
/// brute-force-proof against an attacker who has already EXTRACTED the
/// verifier. PBKDF2 raises the offline cost; the actual protection against
/// extraction is Keystore/Keychain. This remains a privacy lock, not
/// encryption of the financial data.

/// Record schema version. Bumped only if the stored shape changes.
const int kPinRecordVersion = 1;

/// Identifier persisted inside the record so a future migration can tell
/// what an existing verifier was derived with.
const String kPinKdfId = 'pbkdf2-hmac-sha256';

const int kPinSaltLengthBytes = 16;
const int kPinVerifierLengthBits = 256;
const int kPinVerifierLengthBytes = kPinVerifierLengthBits ~/ 8;

/// Work factor, chosen from a MEASUREMENT on the real target device rather
/// than assumed.
///
/// The initial target was 210,000 (current OWASP guidance for
/// PBKDF2-HMAC-SHA256). Measured on the physical Samsung Galaxy S21+
/// (SM-G996B, Android 15) that came out at 1780 ms per derivation, which is
/// far too slow to sit in front of an unlock. `flutter test` has no
/// `--profile`, so that figure is debug/JIT; a release AOT build is faster,
/// which makes this choice conservative rather than optimistic.
///
/// 100,000 is a round, widely-deployed figure for this KDF (it was OWASP's
/// own recommendation for PBKDF2-HMAC-SHA256 before the 2023 increase) and
/// lands the measured derivation under a second on that device.
///
/// The honest security note, which the lower number does not change: a 4–6
/// digit PIN has at most 10^6 values, so no iteration count makes an
/// EXTRACTED verifier safe from brute force. The KDF raises offline cost;
/// the real protection is that the verifier lives in Keystore/Keychain.
///
/// Lowering this is safe for existing users: every record stores the
/// iteration count it was derived with, and verification always uses the
/// STORED value (see [PinService]), never this constant.
const int kPinKdfIterations = 100000;

/// The accepted PIN format.
///
/// 4–6 digits, NOT the milestone's suggested 4–8, because section 2 says to
/// use the authoritative existing requirement where one exists, and the live
/// Web app enforces `/^\d{4,6}$/` (app.js `submitSetPin`/`submitChangePin`).
final RegExp _kPinFormat = RegExp(r'^\d{4,6}$');

bool isValidPinFormat(String pin) => _kPinFormat.hasMatch(pin);

/// The complete stored PIN record.
///
/// Deliberately ONE record rather than three separate secure-storage keys:
/// a PIN change is then a single atomic write, so it is structurally
/// impossible to end up with a new salt paired with an old verifier
/// (section 10's "atomically replace verifier").
class PinVerifierRecord {
  const PinVerifierRecord({
    required this.version,
    required this.kdf,
    required this.iterations,
    required this.salt,
    required this.verifier,
  });

  final int version;
  final String kdf;
  final int iterations;
  final Uint8List salt;
  final Uint8List verifier;

  String encode() => jsonEncode(<String, Object?>{
        'v': version,
        'kdf': kdf,
        'iterations': iterations,
        'saltB64': base64Encode(salt),
        'verifierB64': base64Encode(verifier),
      });

  /// Strict parse. Anything unexpected is a [PinConfigurationFailure], never
  /// a silent fallback — a record we cannot interpret must lock the app with
  /// an explicit error, not degrade to "no PIN configured".
  static PinVerifierRecord decode(String raw) {
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      throw const PinConfigurationFailure('רשומת האבטחה פגומה');
    }
    if (decoded is! Map) {
      throw const PinConfigurationFailure('רשומת האבטחה פגומה');
    }

    final version = decoded['v'];
    if (version != kPinRecordVersion) {
      throw const PinConfigurationFailure('גרסת רשומת אבטחה לא נתמכת');
    }
    final kdf = decoded['kdf'];
    if (kdf != kPinKdfId) {
      throw const PinConfigurationFailure('אלגוריתם אבטחה לא נתמך');
    }
    final iterations = decoded['iterations'];
    if (iterations is! int || iterations < 1) {
      throw const PinConfigurationFailure('פרמטרי אבטחה לא תקינים');
    }

    final Uint8List salt;
    final Uint8List verifier;
    try {
      salt = base64Decode(decoded['saltB64'] as String);
      verifier = base64Decode(decoded['verifierB64'] as String);
    } catch (_) {
      throw const PinConfigurationFailure('רשומת האבטחה פגומה');
    }
    // Exact lengths, not merely "non-empty". A truncated record would
    // otherwise decode happily and then fail every comparison on length
    // mismatch inside constantTimeBytesEqual — telling the user "wrong PIN"
    // forever for a PIN that is in fact correct, and hiding a corrupt
    // record behind a misleading message. Version 1 fixes both lengths; the
    // `v` field is what allows them to change later.
    if (salt.length != kPinSaltLengthBytes ||
        verifier.length != kPinVerifierLengthBytes) {
      throw const PinConfigurationFailure('רשומת האבטחה פגומה');
    }

    return PinVerifierRecord(
      version: kPinRecordVersion,
      kdf: kPinKdfId,
      iterations: iterations,
      salt: salt,
      verifier: verifier,
    );
  }
}

/// A fresh CSPRNG salt. [random] is injectable purely so tests can assert
/// determinism; production always uses [Random.secure].
Uint8List generatePinSalt({Random? random, int length = kPinSaltLengthBytes}) {
  final rng = random ?? Random.secure();
  final bytes = Uint8List(length);
  for (var i = 0; i < length; i++) {
    bytes[i] = rng.nextInt(256);
  }
  return bytes;
}

/// Derives the verifier from a PIN + salt using the `cryptography`
/// package's PBKDF2 implementation.
Future<Uint8List> derivePinVerifier({
  required String pin,
  required List<int> salt,
  required int iterations,
}) async {
  final pbkdf2 = Pbkdf2.hmacSha256(
    iterations: iterations,
    bits: kPinVerifierLengthBits,
  );
  final key = await pbkdf2.deriveKeyFromPassword(password: pin, nonce: salt);
  return Uint8List.fromList(await key.extractBytes());
}

/// Length-checked, constant-time byte comparison.
///
/// No early return inside the loop: every byte of the shorter-or-equal
/// range is always examined, so total running time does not depend on WHERE
/// the first difference is. (Comparing lengths first is safe — the verifier
/// length is a public, fixed parameter, not a secret.)
bool constantTimeBytesEqual(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}
