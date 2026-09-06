/// Typed security failures (Milestone 7, section 13).
///
/// HARD RULE for every type in this file: a [SecurityError] may NEVER carry
/// the PIN, the salt, or the verifier — not in [message], not in
/// [causeType], not in [toString]. Only fixed literals plus the *runtime
/// type name* of an underlying cause are ever exposed, so an error can be
/// logged or rendered on screen without leaking secret material.
///
/// Deliberately small (section 13's "do not over-model errors
/// unnecessarily"): six types, each with a real, distinct call site.
sealed class SecurityError implements Exception {
  const SecurityError(this.message, {this.causeType});

  /// A fixed, non-secret description. Never interpolates secret material.
  final String message;

  /// The `runtimeType` NAME of an underlying platform exception, when one
  /// exists — never the exception itself and never its message, because a
  /// third-party plugin's message text is not under our control and is not
  /// something we can guarantee is secret-free.
  final String? causeType;

  @override
  String toString() =>
      causeType == null ? '$runtimeType: $message' : '$runtimeType: $message ($causeType)';
}

/// Reading the PIN record from platform-secure storage failed. This must
/// NEVER be interpreted as "no PIN configured" (section 5).
class SecureStorageReadFailure extends SecurityError {
  const SecureStorageReadFailure({super.causeType})
      : super('קריאת נתוני האבטחה נכשלה');
}

/// Writing the PIN record to platform-secure storage failed.
class SecureStorageWriteFailure extends SecurityError {
  const SecureStorageWriteFailure({super.causeType})
      : super('שמירת נתוני האבטחה נכשלה');
}

/// Deleting the PIN record from platform-secure storage failed. Surfaced
/// rather than swallowed: a "disable PIN" that silently failed would leave
/// the user believing the lock is off while it is still on.
class SecureStorageDeleteFailure extends SecurityError {
  const SecureStorageDeleteFailure({super.causeType})
      : super('מחיקת נתוני האבטחה נכשלה');
}

/// A PIN record exists but cannot be used: malformed JSON, unknown record
/// version, unsupported KDF, or structurally invalid parameters. Treated as
/// a hard failure (locked + error), never as "no PIN configured", because
/// downgrading a corrupt record to "unlocked" would be a bypass.
class PinConfigurationFailure extends SecurityError {
  const PinConfigurationFailure(super.message);
}

/// The supplied current PIN did not match the stored verifier during a
/// change/disable operation.
class PinVerificationFailure extends SecurityError {
  const PinVerificationFailure() : super('קוד נוכחי שגוי');
}

/// The supplied PIN does not satisfy the accepted format (4–6 digits — the
/// authoritative existing product rule, see [isValidPinFormat]).
class InvalidPinFormat extends SecurityError {
  const InvalidPinFormat() : super('PIN חייב להכיל 4 עד 6 ספרות');
}

/// Something outside this layer's typed vocabulary failed — e.g. the KDF
/// package throwing an error we do not model.
///
/// Exists so that an unexpected exception can still be turned into a
/// DEFINITE, gated state. Without it, an unmodelled throw would leave the
/// controller parked in [AuthUnlocking] forever: the lock screen's button
/// stays busy and the user cannot retry at all until they restart the app.
/// Failing closed is right; failing closed AND stuck is not.
class UnexpectedSecurityFailure extends SecurityError {
  const UnexpectedSecurityFailure({super.causeType})
      : super('שגיאת אבטחה בלתי צפויה');
}
