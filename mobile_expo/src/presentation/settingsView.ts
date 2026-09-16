// Settings screen view model (pure) — app.js SETTINGS_TOPICS and
// buildActivityLogSectionHtml(). The topic order is the Web's approved list.

import { activityActionLabel } from '../domain/activityLog.ts';
import { isPlainObject } from '../domain/raw.ts';

export type SettingsTopicKey = 'security' | 'appearance' | 'notifications' | 'data' | 'openingBalance' | 'activityLog' | 'experimental' | 'about';

export const SETTINGS_TOPICS: readonly { readonly key: SettingsTopicKey; readonly icon: string; readonly label: string; readonly desc: string }[] = [
  { key: 'security', icon: '🔒', label: 'אבטחה', desc: 'PIN, נעילה אוטומטית' },
  { key: 'appearance', icon: '🎨', label: 'מראה', desc: 'ערכת נושא, צבעים וגודל גופן' },
  { key: 'notifications', icon: '🔔', label: 'התראות', desc: 'התראות בתוך האפליקציה' },
  { key: 'data', icon: '💾', label: 'נתונים', desc: 'גיבוי, שחזור וייצוא' },
  { key: 'openingBalance', icon: '⚖️', label: 'יתרת התחלה לחישוב', desc: 'נקודת התחלה לחישוב היתרה הצפויה' },
  { key: 'activityLog', icon: '🕒', label: 'יומן פעילות', desc: 'היסטוריית פעולות' },
  { key: 'experimental', icon: '🧪', label: 'אפשרויות ניסיוניות', desc: "פיצ'רים עתידיים" },
  { key: 'about', icon: 'ℹ️', label: 'אודות', desc: 'גרסה ומה חדש' },
];

/** app.js buildAboutSectionHtml() "מה חדש" list, verbatim. */
export const WHATS_NEW: readonly string[] = [
  'דפי קטגוריות',
  'אריחי בית משופרים',
  'ימי כניסה וירידה',
  'עריכת תנועה בלחיצה',
  'ארכוב אוטומטי להתחייבויות שהסתיימו',
  'הפרדת קטגוריות והגדרות',
];

export function isSettingsTopicKey(value: unknown): value is SettingsTopicKey {
  return typeof value === 'string' && SETTINGS_TOPICS.some((t) => t.key === value);
}

export type ActivityRow = { readonly key: string; readonly label: string; readonly detail: string | null; readonly ts: string };

/** Newest first; entries of an unexpected shape are shown as text, never dropped or thrown on. */
export function buildActivityRows(log: readonly unknown[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    const e = isPlainObject(entry) ? entry : {};
    rows.push({
      key: String(i),
      label: activityActionLabel(e.action),
      detail: typeof e.detail === 'string' && e.detail ? e.detail : null,
      ts: typeof e.ts === 'string' ? e.ts : '',
    });
  }
  return rows;
}
