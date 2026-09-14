// Date semantics ported verbatim from app.js (local-calendar Date arithmetic).
// The only deliberate difference: "today"/"now" is an explicit parameter
// instead of a hidden `new Date()`, so every result is deterministic.

export function getClampedBillingDate(year: number, monthIndex: number, day: number): Date {
  const normalized = new Date(year, monthIndex, 1);
  const y = normalized.getFullYear();
  const m = normalized.getMonth();
  const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfMonth);
  return new Date(y, m, clampedDay);
}

export type BillingRange = { readonly first: Date; readonly last: Date; readonly bDay: number; readonly total: number };

/** app.js getBillingRange(). Values are taken exactly as stored (parseInt semantics). */
export function getBillingRange(startDateStr: unknown, totalPayments: unknown, billingDay: unknown): BillingRange | null {
  if (!startDateStr || !totalPayments) return null;
  const parts = (startDateStr as string).split('-');
  const startYear = parseInt(parts[0] as string, 10);
  const startMonth = parseInt(parts[1] as string, 10) - 1;
  const startDay = parts[2] ? parseInt(parts[2], 10) : 1;
  const total = parseInt(totalPayments as string, 10);
  const bDay = billingDay ? parseInt(billingDay as string, 10) : 1;

  let firstBillingMonth = startMonth;
  if (startDay >= bDay) firstBillingMonth += 1;
  const firstBillingDate = getClampedBillingDate(startYear, firstBillingMonth, bDay);
  const lastBillingDate = getClampedBillingDate(firstBillingDate.getFullYear(), firstBillingDate.getMonth() + (total - 1), bDay);
  return { first: firstBillingDate, last: lastBillingDate, bDay, total };
}

export type PaymentsLeft = { readonly left: number; readonly endStr: string };

/** app.js parseDatesAndGetLeft(), with `today` explicit. */
export function parseDatesAndGetLeft(startDateStr: unknown, totalPayments: unknown, billingDay: unknown, today: Date): PaymentsLeft {
  const range = getBillingRange(startDateStr, totalPayments, billingDay);
  if (!range) return { left: 0, endStr: '-' };
  const endStr = range.last.toLocaleDateString('he-IL');
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (todayZero < range.first) return { left: range.total, endStr };
  let passedMonths =
    (todayZero.getFullYear() - range.first.getFullYear()) * 12 + (todayZero.getMonth() - range.first.getMonth());
  if (todayZero.getDate() >= range.bDay) passedMonths += 1;
  let left = range.total - passedMonths;
  if (left < 0) left = 0;
  if (left > range.total) left = range.total;
  return { left, endStr };
}

export function isBillingActiveInMonth(range: BillingRange, year: number, monthIndex: number): boolean {
  const firstYm = range.first.getFullYear() * 12 + range.first.getMonth();
  const lastYm = range.last.getFullYear() * 12 + range.last.getMonth();
  const targetYm = year * 12 + monthIndex;
  return targetYm >= firstYm && targetYm <= lastYm;
}

/** app.js parseLocalDateStr(): 'YYYY-MM-DD' as a LOCAL date. Lenient (no calendar validation). */
export function parseLocalDateStr(str: unknown): Date | null {
  const parts = ((str || '') as string).split('-');
  const y = parseInt(parts[0] as string, 10);
  const m = parseInt(parts[1] as string, 10) - 1;
  const d = parts[2] ? parseInt(parts[2], 10) : 1;
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
  return new Date(y, m, d);
}

export function cashflowDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function cashflowDateKey(d: Date): string {
  const pad = (n: number): string => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** app.js isValidDateStr(): strict 'YYYY-MM-DD' that is a real calendar date. */
export function isValidDateStr(str: unknown): boolean {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = parseLocalDateStr(str);
  if (!d || isNaN(d.getTime())) return false;
  const parts = str.split('-');
  return (
    d.getFullYear() === parseInt(parts[0] as string, 10) &&
    d.getMonth() + 1 === parseInt(parts[1] as string, 10) &&
    d.getDate() === parseInt(parts[2] as string, 10)
  );
}

/** app.js isValidCanonicalIsoTimestamp(). */
export function isValidCanonicalIsoTimestamp(str: unknown): boolean {
  if (typeof str !== 'string' || str === '') return false;
  const d = new Date(str);
  if (isNaN(d.getTime())) return false;
  return d.toISOString() === str;
}

/** app.js todayStr(): local 'YYYY-MM-DD'. */
export function todayStr(now: Date): string {
  const mm = ('0' + (now.getMonth() + 1)).slice(-2);
  const dd = ('0' + now.getDate()).slice(-2);
  return now.getFullYear() + '-' + mm + '-' + dd;
}

/** app.js nowTimestampStr(): local 'YYYY-MM-DD HH:mm' (backup exportedAt, activity log). */
export function nowTimestampStr(now: Date): string {
  const pad = (n: number): string => (n < 10 ? '0' : '') + n;
  return (
    now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
  );
}

export function monthStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
