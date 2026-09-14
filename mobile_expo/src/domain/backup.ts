// Backup contract — ported from app.js collectAppLocalStorageBackup(),
// isValidItemsArrayForRestore(), isValidBackupShape(), confirmRestoreBackup()
// (decision part) and the post-restore activity-log line.
//
// Contract (approved decision G, unchanged): schemaVersion 2; exportedAt local
// 'YYYY-MM-DD HH:mm'; data = every family_finance_* key -> its exact raw
// string; the legacy pinHash inside family_finance_settings travels as inert
// data; ff_pin_v1 and every other ff_* device-local key can never be included
// (they do not carry the prefix). No schema change.
//
// The only intentional difference: `data` key ORDER. The Web app iterates
// localStorage (browser-defined order); Expo sweeps SQLite in byte order. JSON
// object key order carries no meaning in this contract.

import { FAMILY_FINANCE_PREFIX } from '../data/storageKeys.ts';
import { isValidDateStr, nowTimestampStr, todayStr } from './dates.ts';
import { isValidGoalsArrayStrict } from './goals.ts';
import { ACTIVITY_LOG_MAX, FF_KEYS } from './keys.ts';

export const BACKUP_SCHEMA_VERSION = 2;

export type BackupEnvelope = { schemaVersion: number; exportedAt: string; data: Record<string, string> };

/**
 * Builds the export envelope from the stored family_finance_* entries. null when
 * the local Goals dataset is invalid: a schemaVersion-2 backup must never
 * misrepresent corrupt goals as empty. A missing goals key exports as '[]'.
 */
export function buildBackupEnvelope(entries: Iterable<readonly [string, string]>, goalsStateValid: boolean, now: Date): BackupEnvelope | null {
  if (!goalsStateValid) return null;
  const backup: BackupEnvelope = { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: nowTimestampStr(now), data: {} };
  for (const [key, value] of entries) {
    if (key && key.indexOf(FAMILY_FINANCE_PREFIX) === 0) backup.data[key] = value;
  }
  if (backup.data[FF_KEYS.goals] === undefined) backup.data[FF_KEYS.goals] = '[]';
  return backup;
}

/** Byte-identical to the Web export body. */
export function serializeBackup(backup: BackupEnvelope): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(now: Date): string {
  return 'familyfinance-backup-' + todayStr(now) + '.json';
}

type Loose = Record<string, unknown>;

/** app.js isValidItemsArrayForRestore(): protects cash-withdrawal records specifically. */
export function isValidItemsArrayForRestore(itemsArr: unknown): boolean {
  if (!Array.isArray(itemsArr)) return false;
  const idCounts: Record<string, number> = {};
  for (const raw of itemsArr as unknown[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const id = (raw as Loose).id;
    if (typeof id === 'number' && isFinite(id)) idCounts[id] = (idCounts[id] || 0) + 1;
  }
  for (const it of itemsArr as Loose[]) {
    if (it.type !== 'cashWithdrawal') continue;
    const id = it.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return false;
    if ((idCounts[id] || 0) > 1) return false;
    if (typeof it.amount !== 'number' || !isFinite(it.amount) || it.amount <= 0) return false;
    if (!isValidDateStr(it.start)) return false;
    if (typeof it.title !== 'string' || !it.title) return false;
    if (it.notes !== undefined && typeof it.notes !== 'string') return false;
    if (typeof it.isArchived !== 'boolean') return false;
  }
  return true;
}

/** app.js isValidBackupShape(): validate EVERYTHING before any write. */
export function isValidBackupShape(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Loose;
  if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) return false;
  const data = o.data as Loose;
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (k.indexOf(FAMILY_FINANCE_PREFIX) !== 0) return false;
    if (typeof data[k] !== 'string') return false;
    if (k === FF_KEYS.loanBalanceView) {
      let lbvValue: unknown;
      try {
        lbvValue = JSON.parse(data[k] as string);
      } catch {
        lbvValue = data[k];
      }
      if (lbvValue !== 'total' && lbvValue !== 'principal') return false;
      continue;
    }
    try {
      JSON.parse(data[k] as string);
    } catch {
      return false;
    }
  }
  try {
    if (data[FF_KEYS.data] !== undefined && !isValidItemsArrayForRestore(JSON.parse(data[FF_KEYS.data] as string))) return false;
    if (data[FF_KEYS.categoryConfig] !== undefined) {
      const cfg: unknown = JSON.parse(data[FF_KEYS.categoryConfig] as string);
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
    }
    if (data[FF_KEYS.settings] !== undefined) {
      const st: unknown = JSON.parse(data[FF_KEYS.settings] as string);
      if (!st || typeof st !== 'object' || Array.isArray(st)) return false;
    }
    if (data[FF_KEYS.activityLog] !== undefined && !Array.isArray(JSON.parse(data[FF_KEYS.activityLog] as string))) return false;
    const isGoalsAwareVersion = typeof o.schemaVersion === 'number' && o.schemaVersion >= 2;
    if (isGoalsAwareVersion) {
      if (data[FF_KEYS.goals] === undefined) return false;
      if (isValidGoalsArrayStrict(JSON.parse(data[FF_KEYS.goals] as string)) === null) return false;
    }
  } catch {
    return false;
  }
  return true;
}

export type RestorePlan = {
  readonly goalsAware: boolean;
  /** Keys written, in write order. Keys absent from the backup are left untouched (Web behavior). */
  readonly keys: readonly string[];
  readonly data: Readonly<Record<string, string>>;
};

/**
 * The decision part of app.js confirmRestoreBackup(). Precondition: the backup
 * passed isValidBackupShape. A v1 (non-goals-aware) backup never restores a
 * goals key; the explicit "also delete current goals" opt-in (offered only
 * when local goals data exists) writes '[]' instead.
 */
export function planRestore(
  backup: { readonly schemaVersion?: unknown; readonly data: Readonly<Record<string, string>> },
  options: { readonly deleteExistingGoals: boolean; readonly localGoalsRawPresent: boolean },
): RestorePlan {
  const goalsAware = typeof backup.schemaVersion === 'number' && backup.schemaVersion >= 2;
  const data: Record<string, string> = {};
  for (const k in backup.data) {
    if (!goalsAware && k === FF_KEYS.goals) continue;
    data[k] = backup.data[k] as string;
  }
  if (!goalsAware && options.deleteExistingGoals && options.localGoalsRawPresent) data[FF_KEYS.goals] = '[]';
  return { goalsAware, keys: Object.keys(data), data };
}

/**
 * The best-effort 'data_restore' activity-log line appended AFTER a successful
 * restore. Returns the new raw log, or null when the current log cannot be
 * read (the Web app then silently skips the line).
 */
export function buildRestoreActivityLog(currentRaw: string | null, writtenKeyCount: number, now: Date): string | null {
  try {
    let freshLog: unknown = JSON.parse(currentRaw || '[]');
    if (!Array.isArray(freshLog)) freshLog = [];
    const log = freshLog as unknown[];
    log.push({ ts: nowTimestampStr(now), action: 'data_restore', detail: 'שוחזר מגיבוי (' + writtenKeyCount + ' מפתחות)' });
    if (log.length > ACTIVITY_LOG_MAX) log.splice(0, log.length - ACTIVITY_LOG_MAX);
    return JSON.stringify(log);
  } catch {
    return null;
  }
}
