import 'dart:math';

import 'pin_verifier.dart';
import 'secure_secret_store.dart';
import 'security_errors.dart';

/// The one secure-storage key the whole security layer uses.
///
/// Note the namespace: it is deliberately NOT `family_finance_*`. The backup
/// service sweeps exactly that prefix out of the Drift key-value store
/// (BackupRepositoryImpl.exportBackup), so keeping auth material out of both
/// that store AND that prefix is what makes section 12's isolation
/// structural rather than a promise.
const String kPinRecordStorageKey = 'ff_pin_v1';

/// PIN setup / verification / change / disable (Milestone 7, sections 2, 3,
/// 10).
///
/// Deliberately knows NOTHING about the app's financial layer: it holds a
/// [SecureSecretStore] and nothing else. There is no [KeyValueStore], no
/// repository, no [AppServices] reference anywhere in this class — so "PIN
/// operations cannot touch financial data" is enforced by construction, not
/// by review (sections 4 and 12).
///
/// Failure policy: every method either succeeds or throws a typed
/// [SecurityError]. A storage failure is NEVER converted into "no PIN
/// configured" or into a successful unlock.
class PinService {
  PinService(
    this._store, {
    this.iterations = kPinKdfIterations,
    this.random,
  });

  final SecureSecretStore _store;

  /// PBKDF2 work factor used for NEW records. Existing records are always
  /// verified with the iteration count stored inside them, so lowering this
  /// (as tests do) can never invalidate a real user's PIN.
  final int iterations;

  /// Injectable only so salt generation is reproducible in tests.
  /// Production leaves it null, which means [Random.secure].
  final Random? random;

  /// Reads and strictly parses the stored record; `null` means genuinely
  /// not configured.
  Future<PinVerifierRecord?> _readRecord() async {
    final raw = await _store.read(kPinRecordStorageKey);
    if (raw == null) return null;
    return PinVerifierRecord.decode(raw);
  }

  /// Whether a usable PIN record exists.
  ///
  /// Throws [SecureStorageReadFailure] if storage is unreadable and
  /// [PinConfigurationFailure] if a record exists but is unusable — the
  /// caller must treat both as "cannot proceed", never as `false`.
  Future<bool> isPinConfigured() async => await _readRecord() != null;

  /// Configures a PIN for the first time.
  ///
  /// Refuses to overwrite an existing record: replacing a PIN requires
  /// [changePin], which verifies the current PIN first. Without this guard a
  /// UI bug could silently replace a configured PIN without any
  /// verification — a complete bypass.
  Future<void> setPin(String pin) async {
    if (!isValidPinFormat(pin)) throw const InvalidPinFormat();
    if (await _readRecord() != null) {
      throw const PinConfigurationFailure('כבר מוגדר PIN — יש להשתמש בשינוי קוד');
    }
    await _writeNewRecord(pin);
  }

  /// `true` if [pin] matches the stored verifier, `false` if it does not.
  ///
  /// Throws (rather than returning `false`) when there is no PIN at all or
  /// when storage fails: "cannot check" and "checked, wrong" are different
  /// answers and must not be conflated.
  Future<bool> verifyPin(String pin) async {
    final record = await _readRecord();
    if (record == null) {
      throw const PinConfigurationFailure('לא מוגדר PIN');
    }
    // No format pre-check here: an input that cannot possibly match should
    // still cost the same work as a plausible one, and it simply fails.
    final candidate = await derivePinVerifier(
      pin: pin,
      salt: record.salt,
      iterations: record.iterations,
    );
    return constantTimeBytesEqual(candidate, record.verifier);
  }

  /// Verifies [currentPin], then atomically replaces the record with a new
  /// salt + verifier derived from [newPin].
  Future<void> changePin({
    required String currentPin,
    required String newPin,
  }) async {
    if (!await verifyPin(currentPin)) throw const PinVerificationFailure();
    if (!isValidPinFormat(newPin)) throw const InvalidPinFormat();
    // Single write of a single record => the new salt and the new verifier
    // can never be persisted separately.
    await _writeRecordOverwriting(newPin);
  }

  /// Verifies [currentPin], then removes the record entirely, returning the
  /// app to the PIN-not-configured mode.
  ///
  /// A delete failure throws [SecureStorageDeleteFailure] — it is never
  /// reported as success, because a user told "PIN removed" while the record
  /// survived would be actively misled.
  Future<void> disablePin({required String currentPin}) async {
    if (!await verifyPin(currentPin)) throw const PinVerificationFailure();
    await _store.delete(kPinRecordStorageKey);
  }

  Future<void> _writeNewRecord(String pin) => _writeRecordOverwriting(pin);

  Future<void> _writeRecordOverwriting(String pin) async {
    final salt = generatePinSalt(random: random);
    final verifier = await derivePinVerifier(
      pin: pin,
      salt: salt,
      iterations: iterations,
    );
    final record = PinVerifierRecord(
      version: kPinRecordVersion,
      kdf: kPinKdfId,
      iterations: iterations,
      salt: salt,
      verifier: verifier,
    );
    await _store.write(kPinRecordStorageKey, record.encode());
  }
}
