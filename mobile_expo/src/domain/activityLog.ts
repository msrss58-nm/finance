// family_finance_activity_log — app.js appendActivityLog() and
// getActivityActionLabel(). Entries: { ts: 'YYYY-MM-DD HH:mm', action, detail },
// capped at ACTIVITY_LOG_MAX (oldest dropped). Never a PIN, hash or secret.

import { nowTimestampStr } from './dates.ts';
import { ACTIVITY_LOG_MAX } from './keys.ts';

export type ActivityEntryInput = { readonly action: string; readonly detail: string };

export const ACTIVITY_ACTION_LABELS: Readonly<Record<string, string>> = {
  category_created: 'קטגוריה נוצרה',
  category_renamed: 'שם קטגוריה שונה',
  category_deleted: 'קטגוריה נמחקה',
  default_day_changed: 'יום ברירת מחדל שונה',
  auto_archive: 'ארכוב אוטומטי',
  manual_archive: 'ארכוב ידני',
  restore: 'שחזור מארכיון',
  backup: 'גיבוי נתונים',
  data_restore: 'שחזור נתונים מגיבוי',
};

/** app.js getActivityActionLabel(): the label, or the raw action text. */
export function activityActionLabel(action: unknown): string {
  const key = String(action);
  return Object.prototype.hasOwnProperty.call(ACTIVITY_ACTION_LABELS, key) ? (ACTIVITY_ACTION_LABELS[key] as string) : key;
}

/**
 * Appends entries to the stored log and returns the new raw value, or null
 * when nothing should be written. Deliberately safer than the Web app: a
 * stored log that is present but not a JSON array is left untouched (the line
 * is skipped) instead of being replaced by a fresh array.
 */
export function appendActivityEntries(currentRaw: string | null, entries: readonly ActivityEntryInput[], now: Date): string | null {
  if (entries.length === 0) return null;
  let log: unknown[];
  if (currentRaw === null || currentRaw === '') {
    log = [];
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(currentRaw);
    } catch {
      return null;
    }
    if (!Array.isArray(parsed)) return null;
    log = parsed;
  }
  const ts = nowTimestampStr(now);
  for (const e of entries) log.push({ ts, action: e.action, detail: e.detail || '' });
  if (log.length > ACTIVITY_LOG_MAX) log.splice(0, log.length - ACTIVITY_LOG_MAX);
  return JSON.stringify(log);
}
