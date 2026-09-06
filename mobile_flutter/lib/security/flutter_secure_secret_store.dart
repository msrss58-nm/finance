import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_secret_store.dart';
import 'security_errors.dart';

/// Production [SecureSecretStore]: Keystore-backed on Android, Keychain on
/// iOS, via flutter_secure_storage.
///
/// Precisely what v11 does on Android (stated exactly rather than loosely):
/// the VALUE is encrypted with AES/GCM, and that AES key is wrapped with an
/// RSA-OAEP key held in the Android Keystore; the resulting ciphertext lives
/// in an ordinary SharedPreferences file. It is NOT AndroidX
/// EncryptedSharedPreferences. The security property we rely on — the
/// plaintext is unreadable without a Keystore-held key — holds either way,
/// but the mechanism is worth naming correctly.
///
/// SECURITY-CRITICAL OPTION CHOICES — both are deliberate, not defaults:
///
/// 1. `resetOnError: false`.
///    flutter_secure_storage's AndroidOptions default is `resetOnError:
///    true`, documented by the package as "PERMANENTLY erase the data when
///    an error occurs". For a PIN verifier that default is a security bug,
///    not a convenience: a transient decrypt failure would silently delete
///    the record, and the app would come back up as "no PIN configured" —
///    i.e. unlocked — which is precisely the failure mode section 5
///    forbids. We keep the record and surface a typed failure instead.
///
/// 2. `accessibility: KeychainAccessibility.first_unlock_this_device` (iOS).
///    The verifier is not needed while the device is locked, must not sync
///    to iCloud Keychain, and must not migrate to a new device — the lock is
///    a local privacy lock for THIS install.
class FlutterSecureSecretStore implements SecureSecretStore {
  FlutterSecureSecretStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const AndroidOptions _android = AndroidOptions(
    resetOnError: false,
  );

  static const IOSOptions _ios = IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  );

  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: key, aOptions: _android, iOptions: _ios);
    } catch (e) {
      throw SecureStorageReadFailure(causeType: e.runtimeType.toString());
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _storage.write(
        key: key,
        value: value,
        aOptions: _android,
        iOptions: _ios,
      );
    } catch (e) {
      throw SecureStorageWriteFailure(causeType: e.runtimeType.toString());
    }
  }

  @override
  Future<void> delete(String key) async {
    try {
      await _storage.delete(key: key, aOptions: _android, iOptions: _ios);
    } catch (e) {
      throw SecureStorageDeleteFailure(causeType: e.runtimeType.toString());
    }
  }
}
