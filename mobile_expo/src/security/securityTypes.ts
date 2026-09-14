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
  /** A stored lock record exists but this build cannot verify it (e.g. ff_pin_v1 before the KDF is approved). */
  | 'unsupportedRecord'
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
  unexpected: 'שגיאת אבטחה בלתי צפויה',
};
