// Security failure vocabulary. Same hard rule as the Flutter oracle's
// security_errors.dart: a failure never carries a PIN, salt, verifier or any
// secret-derived value — only a fixed kind and a secret-free cause type.

export type SecurityFailureKind =
  /** Platform secure storage is not available on this device. */
  | 'secretStoreUnavailable'
  | 'secretRead'
  | 'secretWrite'
  | 'secretDelete'
  /** The non-secret "lock configured" marker could not be read/written. */
  | 'markerRead'
  | 'markerWrite'
  /**
   * The marker says a lock is configured but the secret is gone. Treated as
   * a hard failure, never as "no lock": on Android, expo-secure-store maps
   * some decryption failures to "absent" (and deletes the entry), so absence
   * alone cannot be trusted once a lock has been configured.
   */
  | 'secretMissing'
  /** A stored lock record exists but is malformed, weaker than the contract, or of an unknown kind. */
  | 'unsupportedRecord'
  /** The native PIN KDF is not in this build. Fail closed — there is no JavaScript fallback. */
  | 'kdfUnavailable'
  /** The native PIN KDF reported an error. */
  | 'kdfFailed'
  // PIN management input errors: returned to the settings form only, never a lock-state failure.
  | 'invalidPinFormat'
  | 'pinMismatch'
  | 'wrongCurrentPin'
  | 'alreadyConfigured'
  | 'unexpected';

export type SecurityFailure = { readonly kind: SecurityFailureKind; readonly causeType?: string };

/** Fixed Hebrew messages — never interpolated with anything dynamic. */
export const SECURITY_FAILURE_MESSAGES: Record<SecurityFailureKind, string> = {
  secretStoreUnavailable: 'אחסון מאובטח אינו זמין במכשיר',
  secretRead: 'קריאת נתוני האבטחה נכשלה',
  secretWrite: 'שמירת נתוני האבטחה נכשלה',
  secretDelete: 'מחיקת נתוני האבטחה נכשלה',
  markerRead: 'קריאת מצב הנעילה נכשלה',
  markerWrite: 'שמירת מצב הנעילה נכשלה',
  secretMissing: 'נתוני הנעילה חסרים — הגישה נחסמה',
  unsupportedRecord: 'רשומת אבטחה לא נתמכת בגרסה זו',
  kdfUnavailable: 'רכיב האבטחה של המכשיר אינו זמין',
  kdfFailed: 'אימות הקוד נכשל בשל שגיאה במכשיר',
  invalidPinFormat: 'PIN חייב להכיל 4 עד 6 ספרות',
  pinMismatch: 'הקודים אינם תואמים',
  wrongCurrentPin: 'קוד נוכחי שגוי',
  alreadyConfigured: 'כבר מוגדר PIN — יש להשתמש בשינוי קוד',
  unexpected: 'שגיאת אבטחה בלתי צפויה',
};
