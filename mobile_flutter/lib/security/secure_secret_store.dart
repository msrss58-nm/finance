import 'security_errors.dart';

/// The single, platform-agnostic seam between the security layer and
/// platform-secure storage (Milestone 7, section 3 + section 16).
///
/// Everything above this interface — [PinService], [AuthController], the
/// lock UI — is pure Dart with no knowledge of Android, iOS, Keystore, or
/// Keychain. That is what makes the Android implementation replaceable by a
/// Keychain-backed one without touching a line of shared logic, and what
/// lets the whole security layer be unit-tested with an in-memory fake.
///
/// Contract:
/// - [read] returns `null` ONLY when the key genuinely has no value.
/// - Any *failure* must throw a typed [SecurityError] — never return
///   `null`, and never swallow. Section 5 forbids a storage failure from
///   being interpreted as "no PIN configured".
abstract interface class SecureSecretStore {
  /// The stored value, or `null` if the key is genuinely absent.
  ///
  /// Throws [SecureStorageReadFailure] on any platform failure.
  Future<String?> read(String key);

  /// Throws [SecureStorageWriteFailure] on any platform failure.
  Future<void> write(String key, String value);

  /// Throws [SecureStorageDeleteFailure] on any platform failure.
  Future<void> delete(String key);
}
