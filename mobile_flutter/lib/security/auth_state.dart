import 'security_errors.dart';

/// The security layer's state (Milestone 7, section 4).
///
/// Sealed so every consumer must handle every case exhaustively — there is
/// no `default:` branch anywhere that could accidentally treat an unhandled
/// state as "show the app".
sealed class AuthState {
  const AuthState();

  /// The ONE predicate that decides whether sensitive financial UI may be
  /// built. Defined here, on the state itself, so there is exactly one
  /// answer in the whole codebase and no screen can invent its own.
  ///
  /// Note it is a whitelist, not a blacklist: anything that is not
  /// explicitly "no PIN configured" or "unlocked" keeps the app gated,
  /// including every failure state.
  bool get allowsSensitiveContent =>
      this is AuthNotConfigured || this is AuthUnlocked;
}

/// Startup: the PIN record has not been read yet. Sensitive UI stays gated.
class AuthInitializing extends AuthState {
  const AuthInitializing();
}

/// No PIN is configured. The app is open — this is not a "logged in" state,
/// it is "this install has no privacy lock".
class AuthNotConfigured extends AuthState {
  const AuthNotConfigured();
}

/// A PIN is configured and the app is locked.
class AuthLocked extends AuthState {
  const AuthLocked({
    this.consecutiveFailures = 0,
    this.lastAttemptFailed = false,
    this.retryAllowedAt,
  });

  /// In-memory only, per section 9 — never persisted, so no counter can
  /// survive a restart and permanently lock a user out of their own data.
  final int consecutiveFailures;

  /// Whether the most recent submission was rejected (drives the error
  /// message, so a fresh lock screen does not open showing an error).
  final bool lastAttemptFailed;

  /// When backoff is active, the wall-clock instant at which the next
  /// attempt is accepted. `null` means no backoff.
  final DateTime? retryAllowedAt;
}

/// A submitted PIN is being verified (key derivation is deliberately slow).
class AuthUnlocking extends AuthState {
  const AuthUnlocking();
}

/// A PIN is configured and has been successfully verified this session.
class AuthUnlocked extends AuthState {
  const AuthUnlocked();
}

/// The security layer could not determine or enforce its own state:
/// secure storage failed, or the stored record is unusable.
///
/// This state deliberately does NOT allow sensitive content. Section 5 is
/// explicit that a secure-storage failure must never be treated as "PIN
/// disabled" and must never fabricate an unlocked state.
class AuthUnavailable extends AuthState {
  const AuthUnavailable(this.error);
  final SecurityError error;
}
