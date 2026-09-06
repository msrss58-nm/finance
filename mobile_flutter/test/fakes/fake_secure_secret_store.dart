import 'package:familyfinance_pro/security/secure_secret_store.dart';
import 'package:familyfinance_pro/security/security_errors.dart';

/// In-memory [SecureSecretStore] for unit/widget tests (Milestone 7,
/// section 14: "Use fake secure-storage implementations for unit/widget
/// tests. Do not require physical secure storage for all automated tests.").
///
/// Also able to simulate each distinct platform failure independently, so
/// the "a storage failure must never unlock the app" rule can actually be
/// exercised rather than assumed.
class FakeSecureSecretStore implements SecureSecretStore {
  FakeSecureSecretStore({Map<String, String>? initial})
      : _values = {...?initial};

  final Map<String, String> _values;

  bool failReads = false;
  bool failWrites = false;
  bool failDeletes = false;

  /// Makes [read] throw something that is NOT a [SecurityError], to prove the
  /// controller still reaches a definite gated state instead of parking in
  /// [AuthUnlocking] forever.
  bool failReadsWithUnexpectedError = false;

  /// Delays [read] so a verification can be observed while still in flight
  /// (used to reproduce the lock-during-verification race deterministically,
  /// without depending on the real key-derivation cost).
  Duration? readDelay;

  int readCount = 0;
  int writeCount = 0;
  int deleteCount = 0;

  /// Direct, non-throwing inspection for assertions.
  Map<String, String> get snapshot => Map.unmodifiable(_values);

  @override
  Future<String?> read(String key) async {
    readCount++;
    final delay = readDelay;
    if (delay != null) await Future<void>.delayed(delay);
    if (failReadsWithUnexpectedError) throw StateError('unmodelled failure');
    if (failReads) throw const SecureStorageReadFailure(causeType: 'FakeFailure');
    return _values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    writeCount++;
    if (failWrites) throw const SecureStorageWriteFailure(causeType: 'FakeFailure');
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    deleteCount++;
    if (failDeletes) throw const SecureStorageDeleteFailure(causeType: 'FakeFailure');
    _values.remove(key);
  }
}
