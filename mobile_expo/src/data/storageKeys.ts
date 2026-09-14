// Storage key registry.
//
// family_finance_* keys are the Web-compatible data contract: a backup is
// exactly these keys with their raw string values. Device-local keys live in
// the same SQLite table but never start with the prefix, so a backup sweep
// can never include them. Secrets never live in SQLite at all (see
// src/security/secretStore.ts).

import type { KeyValueReader } from './keyValueStore.ts';

export const FAMILY_FINANCE_PREFIX = 'family_finance_';

/** The 7 known Web keys, in the Web restore priority order. */
export const FAMILY_FINANCE_KEYS = [
  'family_finance_data',
  'family_finance_cat_config',
  'family_finance_settings',
  'family_finance_activity_log',
  'family_finance_goals',
  'family_finance_category_tile_order',
  'family_finance_loan_balance_view',
] as const;

export function isFamilyFinanceKey(key: string): boolean {
  return key.startsWith(FAMILY_FINANCE_PREFIX);
}

/** Device-local, never-backed-up keys. */
export const DEVICE_LOCAL_KEYS = {
  /** Non-secret "a lock is configured" marker; see securityMarker.ts. */
  securityMarker: 'ff_security_marker_v1',
  /** Foundation diagnostics: survives-restart check. */
  diagnosticsMarker: 'ff_diag_persistence_v1',
  /** Goals-reminder OS notification preference (per install; same key as the Flutter oracle). */
  goalsReminderPrefs: 'ff_goals_reminder_v1',
} as const;

/**
 * Every family_finance_* key with its exact raw value — the persistence side
 * of a future backup export. Nothing else can appear in the result.
 */
export async function readFamilyFinanceSnapshot(store: KeyValueReader): Promise<Map<string, string>> {
  const entries = await store.entriesWithPrefix(FAMILY_FINANCE_PREFIX);
  return new Map(entries);
}
