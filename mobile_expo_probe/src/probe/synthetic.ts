// Stage 0 probe — synthetic number/date/raw-string helpers.
// NOT business logic: no cash-flow, Goals, Forecast or Opening Balance rules
// live here. Import-free so `node --test` can run it directly.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Local calendar date for (y, 0-based month, day), clamped to month end. */
export function clampedDate(year: number, monthIndex: number, day: number): Date {
  const normalized = new Date(year, monthIndex, 1);
  const last = new Date(normalized.getFullYear(), normalized.getMonth() + 1, 0).getDate();
  return new Date(normalized.getFullYear(), normalized.getMonth(), Math.min(day, last));
}

/** Calendar-safe day step (never 24h arithmetic — Israel DST). */
export function addCalendarDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function dateKey(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Next local (day, hh:mm) strictly after `now` — same shape as Flutter's
 * nextGoalsReminderDateTime; used only to exercise notification scheduling. */
export function nextMonthlyInstant(now: Date, day = 2, hour = 9, minute = 0): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day, hour, minute);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, day, hour, minute);
}

export const BACKUP_PREFIX = 'family_finance_';

export function isBackupKey(key: string): boolean {
  return key.startsWith(BACKUP_PREFIX);
}

export type ProbeBackupEnvelope = {
  schemaVersion: 2;
  exportedAt: string;
  data: Record<string, string>;
};

/** Probe-only envelope builder: proves the prefix sweep keeps device-local
 * keys (ff_*) and anything else out of the payload. Values stay raw strings. */
export function buildProbeEnvelope(
  entries: readonly (readonly [string, string])[],
  exportedAt: string,
): ProbeBackupEnvelope {
  const data: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (isBackupKey(k)) data[k] = v;
  }
  return { schemaVersion: 2, exportedAt, data };
}

/** Raw values chosen to break any accidental parse/re-serialize step:
 * `1.0` and `1e21` change under JSON.parse+stringify, key order and
 * whitespace are significant, an unsafe integer loses precision, and one
 * value is the legacy non-JSON loan_balance_view form. All synthetic. */
export const RAW_FIXTURES: readonly (readonly [string, string])[] = [
  ['family_finance_data', '[{"id":1757000000000,"type":"income","amount":1.0,"title":"משכורת ✓","day":"05"},{"id":"legacy-7","type":"fixed","amount":1e21,"where":"credit"}]'],
  ['family_finance_settings', '{"zeta":1,"alpha":2,"projectedBalanceOpeningAmount":0,"projectedBalanceOpeningDate":"2026-02-29","extra":{"n":[null,true,-0.0]}}'],
  ['family_finance_loan_balance_view', 'total'],
  ['family_finance_goals', '[]'],
  ['family_finance_activity_log', '[{"ts":"2026-09-13 10:00","action":"backup","detail":"גיבוי \\"מלא\\"\\n\\u0000 👨‍👩‍👧"}]'],
  ['family_finance_cat_config', '  {"income" : {"label":"הכנסות","baseType":"income"}}\n'],
  ['family_finance_big', '{"unsafe":9007199254740993}'],
];

/** Device-local keys that must never reach a backup payload. */
export const DEVICE_LOCAL_KEYS: readonly string[] = ['ff_goals_reminder_v1', 'ff_pin_v1', 'probe_boot_count'];
