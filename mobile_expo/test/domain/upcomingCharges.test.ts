// "מה צפוי לרדת" (approved decision B) and its interaction with the in-app
// alerts (decision C). Window: strictly after today through today + 10.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeInAppAlerts } from '../../src/domain/alerts.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { getDefaultAppSettings } from '../../src/domain/settings.ts';
import { getUpcomingCharges } from '../../src/domain/upcomingCharges.ts';

const cc = resolveCategoryConfig(null);
const now = new Date(2026, 8, 13, 10, 0); // window 2026-09-14 … 2026-09-23
const settings = getDefaultAppSettings();

const items: Record<string, unknown>[] = [
  { id: 1, type: 'fixed', title: 'A', amount: 100, day: 14, where: 'bank' }, // tomorrow — also an in-app alert
  { id: 2, type: 'fixed', title: 'B', amount: 230, day: 23, where: 'bank' }, // last day of the window
  { id: 3, type: 'fixed', title: 'C', amount: 999, day: 24, where: 'bank' }, // day 11 — outside
  { id: 4, type: 'fixed', title: 'T', amount: 999, day: 13, where: 'bank' }, // today — outside
  { id: 5, type: 'loan', title: 'D', amount: 500, day: 20, total: 24, start: '2026-01-01', where: 'bank' },
  { id: 6, type: 'variable', title: 'V', amount: 50, day: 16, total: 10, start: '2026-01-01', where: 'credit' },
  { id: 7, type: 'dated', title: 'DC', amount: 70, start: '2026-09-18', displayCategory: 'creditPurchase', where: 'credit' },
  { id: 8, type: 'dated', title: 'DB', amount: 2000, start: '2026-09-18', displayCategory: 'dated' },
  { id: 9, type: 'fixed', title: 'F9', amount: 90, day: 18, where: 'bank' },
  { id: 10, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 400, start: '2026-09-15', isArchived: false },
  { id: 11, type: 'fixed', title: 'FC', amount: 60, day: 17, where: 'credit' },
  { id: 12, type: 'income', title: 'I', amount: 9000, day: 15 },
];

const summary = (list: { dateKey: string; itemId: unknown; amount: number }[]) => list.map((c) => `${c.dateKey}#${String(c.itemId)}=${c.amount}`);

test('window, sorting (nearest first, same-day by type), exclusions and alert de-duplication', () => {
  const alerts = computeInAppAlerts({ items, settings, now, categoryConfig: cc, lastAutoArchivedTitles: [] });
  assert.deepEqual(alerts.map((a) => [a.kind, a.itemId]), [['upcomingPayment', 1]]);
  const upcoming = getUpcomingCharges({ items, now, categoryConfig: cc, alerts });
  assert.deepEqual(summary(upcoming), ['2026-09-18#9=90', '2026-09-18#8=2000', '2026-09-20#5=500', '2026-09-23#2=230']);
});

test('without an overlapping alert the item appears (nothing is dropped silently)', () => {
  const upcoming = getUpcomingCharges({ items, now, categoryConfig: cc, alerts: [] });
  assert.equal(summary(upcoming)[0], '2026-09-14#1=100');
  const noPaymentAlerts = computeInAppAlerts({ items, settings: { notifications: { ...settings.notifications, upcomingPayment: false } }, now, categoryConfig: cc, lastAutoArchivedTitles: [] });
  assert.equal(summary(getUpcomingCharges({ items, now, categoryConfig: cc, alerts: noPaymentAlerts }))[0], '2026-09-14#1=100');
});

test('an item never appears in both lists', () => {
  const alerts = computeInAppAlerts({ items, settings, now, categoryConfig: cc, lastAutoArchivedTitles: ['הלוואה ישנה'] });
  const upcoming = getUpcomingCharges({ items, now, categoryConfig: cc, alerts });
  const alerted = new Set(alerts.filter((a) => a.itemId !== null).map((a) => a.itemId));
  assert.ok(upcoming.every((c) => !alerted.has(c.itemId)));
});

test('empty list when there is nothing to show', () => {
  assert.deepEqual(getUpcomingCharges({ items: [], now, categoryConfig: cc, alerts: [] }), []);
});

test('duplicate records collapse deterministically; month boundary and clamping are respected', () => {
  const dup = { id: 20, type: 'fixed', title: 'dup', amount: 10, day: 16, where: 'bank' };
  assert.deepEqual(summary(getUpcomingCharges({ items: [dup, { ...dup }], now, categoryConfig: cc, alerts: [] })), ['2026-09-16#20=10']);

  const late = new Date(2026, 8, 28, 9); // window 2026-09-29 … 2026-10-08
  const across = [
    { id: 1, type: 'fixed', title: 'x', amount: 1, day: 2, where: 'bank' },
    { id: 2, type: 'fixed', title: 'y', amount: 2, day: 30, where: 'bank' },
    { id: 3, type: 'fixed', title: 'z', amount: 3, day: 9, where: 'bank' },
  ];
  assert.deepEqual(summary(getUpcomingCharges({ items: across, now: late, categoryConfig: cc, alerts: [] })), ['2026-09-30#2=2', '2026-10-02#1=1']);

  const feb = new Date(2026, 1, 20, 9);
  assert.deepEqual(summary(getUpcomingCharges({ items: [{ id: 1, type: 'fixed', title: 'x', amount: 5, day: 31, where: 'bank' }], now: feb, categoryConfig: cc, alerts: [] })), ['2026-02-28#1=5']);
});
