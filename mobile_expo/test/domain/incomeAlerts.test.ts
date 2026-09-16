// APPROVED 16/09/2026: a future income alerts while today < date <= today + 14.
// Real income cash-flow events only; never part of "מה צפוי לרדת".
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeInAppAlerts, INCOME_ALERT_WINDOW_DAYS } from '../../src/domain/alerts.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { getDefaultAppSettings } from '../../src/domain/settings.ts';
import { getUpcomingCharges } from '../../src/domain/upcomingCharges.ts';

const cc = resolveCategoryConfig(null);
const settings = getDefaultAppSettings();
const NOW = new Date(2026, 8, 16, 10, 0); // 2026-09-16; window 17.9 … 30.9

const incomeAlerts = (items: Record<string, unknown>[], now: Date = NOW) =>
  computeInAppAlerts({ items, settings, now, categoryConfig: cc, lastAutoArchivedTitles: [] }).filter((a) => a.kind === 'upcomingIncome');

test('the window is today+14: day 14 alerts, day 15 does not, tomorrow alerts', () => {
  assert.equal(INCOME_ALERT_WINDOW_DAYS, 14);
  const items = [
    { id: 1, type: 'income', title: 'אזרח ותיק', amount: 4200, day: '28' }, // 28.9 = in 12 days
    { id: 2, type: 'income', title: 'יום 14', amount: 100, day: '30' }, // 30.9 = exactly day 14
    { id: 3, type: 'income', title: 'יום 15', amount: 200, day: '1' }, // 1.10 = day 15 — outside
    { id: 4, type: 'income', title: 'מחר', amount: 300, day: '17' }, // tomorrow
  ];
  const got = incomeAlerts(items).map((a) => [a.detail, a.title]);
  assert.deepEqual(got, [
    ['מחר', 'הכנסה צפויה מחר'],
    ['אזרח ותיק', 'הכנסה צפויה'],
    ['יום 14', 'הכנסה צפויה'],
  ]);
  assert.ok(!got.some(([d]) => d === 'יום 15'), 'income in 15 days does not alert yet');
});

test('income today or in the past is not a future alert', () => {
  const items = [
    { id: 1, type: 'income', title: 'היום', amount: 100, day: '16' },
    { id: 2, type: 'income', title: 'אתמול', amount: 200, day: '15' },
  ];
  assert.deepEqual(incomeAlerts(items), []);
});

test('one alert per income per date, and archived income never alerts', () => {
  const items = [
    { id: 1, type: 'income', title: 'אזרח ותיק', amount: 4200, day: '28' },
    { id: 2, type: 'income', title: 'בארכיון', amount: 999, day: '28', isArchived: true },
  ];
  const got = incomeAlerts(items);
  const keys = got.map((a) => `${String(a.itemId)}|${a.date === null ? '' : a.date.getTime()}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate alert for the same income/date');
  assert.deepEqual(got.map((a) => a.itemId), [1]);
});

test('the income alert flag still gates the rule, and income never enters "מה צפוי לרדת"', () => {
  const items = [{ id: 1, type: 'income', title: 'אזרח ותיק', amount: 4200, day: '28' }];
  const off = computeInAppAlerts({
    items,
    settings: { notifications: { ...settings.notifications, upcomingIncome: false } },
    now: NOW,
    categoryConfig: cc,
    lastAutoArchivedTitles: [],
  });
  assert.deepEqual(off, [], 'disabled flag = no income alerts');
  const alerts = computeInAppAlerts({ items, settings, now: NOW, categoryConfig: cc, lastAutoArchivedTitles: [] });
  assert.deepEqual(getUpcomingCharges({ items, now: NOW, categoryConfig: cc, alerts }), [], 'income is never an outgoing charge');
});

test('expense alerts are unchanged: a payment due tomorrow still alerts', () => {
  const items = [
    { id: 1, type: 'fixed', title: 'חשמל', amount: 320, day: '17', where: 'bank' },
    { id: 2, type: 'income', title: 'אזרח ותיק', amount: 4200, day: '28' },
  ];
  const all = computeInAppAlerts({ items, settings, now: NOW, categoryConfig: cc, lastAutoArchivedTitles: [] });
  assert.deepEqual(all.map((a) => [a.kind, a.detail]), [
    ['upcomingPayment', 'חשמל'],
    ['upcomingIncome', 'אזרח ותיק'],
  ]);
});
