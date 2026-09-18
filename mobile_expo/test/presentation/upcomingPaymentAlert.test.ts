// "תשלום צפוי מחר" on Home = the real bank debit scheduled for tomorrow — APPROVED 18/09/2026.
//
// The alert is derived from the canonical charge list (the unified cash-flow engine), not from a
// day-of-month match. computeInAppAlerts stays Web-verbatim (decision C) and is NOT changed; the
// correction lives in the Home view model only, so no parity deviation is involved.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomeView } from '../../src/presentation/homeView.ts';
import { formatAmount } from '../../src/presentation/format.ts';
import { snapshotOf } from '../support/financeHarness.ts';

const ON = { notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: true } };
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0);

const homeView = async (items: object[], now: Date, settings: object = ON) =>
  buildHomeView(await snapshotOf({ family_finance_data: JSON.stringify(items), family_finance_settings: JSON.stringify(settings) }, now));

const paymentAlerts = async (items: object[], now: Date, settings: object = ON) =>
  (await homeView(items, now, settings)).alerts.filter((a) => a.title === 'תשלום צפוי מחר').map((a) => [a.detail, a.amountText]);

const fixed = (fields: object = {}) => ({ id: 1, type: 'fixed', displayCategory: 'fixed', title: 'קבוע', amount: 300, day: '18', where: 'bank', isArchived: false, ...fields });

test('a bank-paid expense due tomorrow still alerts, with the canonical amount', async () => {
  assert.deepEqual(await paymentAlerts([fixed()], at(2026, 9, 17)), [['קבוע', formatAmount(300)]]);
  // and not on any other day
  assert.deepEqual(await paymentAlerts([fixed()], at(2026, 9, 16)), []);
  assert.deepEqual(await paymentAlerts([fixed()], at(2026, 9, 18)), []);
});

test('a credit-paid fixed or variable item never alerts: the card settlement is the real debit', async () => {
  const creditFixed = fixed({ id: 2, title: 'Netflix', where: 'credit', cardLast4: '1234' });
  const creditVariable = { id: 3, type: 'variable', displayCategory: 'variable', title: 'משקפיים', amount: 127, day: '18', total: '12', start: '2026-08-26', where: 'credit', isArchived: false };
  assert.deepEqual(await paymentAlerts([creditFixed, creditVariable], at(2026, 9, 17)), []);
  // the bank item beside them is unaffected
  assert.deepEqual(await paymentAlerts([creditFixed, creditVariable, fixed()], at(2026, 9, 17)), [['קבוע', formatAmount(300)]]);
});

test('a payroll loan never alerts: nothing leaves the bank account', async () => {
  const payroll = { id: 4, type: 'loan', displayCategory: 'loan', title: 'הלוואה מהתלוש', amount: 653.99, day: '18', total: '24', start: '2026-04-21', where: 'דרך תלוש השכר', isArchived: false };
  assert.deepEqual(await paymentAlerts([payroll], at(2026, 9, 17)), []);
});

test('a tracking-only installment (no saved payment method) never alerts', async () => {
  const tracking = { id: 5, type: 'variable', displayCategory: 'variable', title: 'ללא אמצעי', amount: 200, day: '18', total: '10', start: '2026-05-01', isArchived: false };
  assert.deepEqual(await paymentAlerts([tracking], at(2026, 9, 17)), []);
});

test('a yearly fixed item alerts with its monthly debit, not the full annual amount', async () => {
  const yearly = fixed({ id: 6, title: 'ביטוח רכב', amount: 1200, period: 'שנתי' });
  assert.deepEqual(await paymentAlerts([yearly], at(2026, 9, 17)), [['ביטוח רכב', formatAmount(100)]]);
});

test('a bi-monthly item alerts only in a month it is actually charged', async () => {
  const bimonthly = fixed({ id: 7, title: 'ועד בית', amount: 480, bimonthly: true, bimonthlyStartMonth: 9 });
  assert.deepEqual(await paymentAlerts([bimonthly], at(2026, 9, 17)), [['ועד בית', formatAmount(480)]]);
  assert.deepEqual(await paymentAlerts([bimonthly], at(2026, 10, 17)), [], 'off month: no charge, no alert');
  assert.deepEqual(await paymentAlerts([bimonthly], at(2026, 11, 17)), [['ועד בית', formatAmount(480)]]);
});

test('an obligation that has not started yet, or has already ended, does not alert', async () => {
  // 6 payments on the 18th, the first on 18.1.2027 → nothing is due before that.
  const future = { id: 8, type: 'loan', displayCategory: 'loan', title: 'עתידית', amount: 500, day: '18', total: '6', start: '2026-12-20', where: 'bank', isArchived: false };
  assert.deepEqual(await paymentAlerts([future], at(2026, 9, 17)), []);
  assert.deepEqual(await paymentAlerts([future], at(2027, 1, 17)), [['עתידית', formatAmount(500)]], 'the first real charge does alert');
  // 3 payments on the 18th from 1.1.2026 → the last on 18.3.2026; by September it is over.
  const ended = { id: 9, type: 'loan', displayCategory: 'loan', title: 'הסתיימה', amount: 500, day: '18', total: '3', start: '2026-01-01', where: 'bank', isArchived: false };
  assert.deepEqual(await paymentAlerts([ended], at(2026, 9, 17)), []);
});

test('a stored day of 31 alerts on the clamped date the charge really falls on', async () => {
  const day31 = fixed({ id: 10, title: 'יום 31', day: '31' });
  // February: the charge is clamped to 28.2, so the alert is on 27.2 — and not on the 30th, which
  // does not exist. The stored day is never rewritten.
  assert.deepEqual(await paymentAlerts([day31], at(2026, 2, 27)), [['יום 31', formatAmount(300)]]);
  // April (30 days): clamped to 30.4 → alerts on 29.4.
  assert.deepEqual(await paymentAlerts([day31], at(2026, 4, 29)), [['יום 31', formatAmount(300)]]);
  // A long month behaves as before: 31.3 → alerts on 30.3.
  assert.deepEqual(await paymentAlerts([day31], at(2026, 3, 30)), [['יום 31', formatAmount(300)]]);
  assert.deepEqual(await paymentAlerts([day31], at(2026, 3, 29)), []);
});

test('the notification toggle still governs the alert', async () => {
  const off = { notifications: { upcomingPayment: false, upcomingIncome: true, completedObligation: true } };
  assert.deepEqual(await paymentAlerts([fixed()], at(2026, 9, 17), off), []);
  // the charge list is independent of the toggle
  const v = await homeView([fixed()], at(2026, 9, 17), off);
  assert.equal(v.upcoming.some((c) => c.title === 'קבוע'), true);
});

test('lifecycle alerts are untouched: a payroll loan keeps "נשאר תשלום אחד" without a payment alert', async () => {
  // 120 payments on the 1st from 26.10.2016 → the last on 1.10.2026. On 30.9 one payment is left.
  const payroll = { id: 11, type: 'loan', displayCategory: 'loan', title: 'שיפוצים', amount: 362, day: '1', total: '120', start: '2016-10-26', where: 'דרך תלוש השכר', isArchived: false };
  const v = await homeView([payroll], at(2026, 9, 30));
  assert.deepEqual(
    v.alerts.map((a) => [a.title, a.detail]),
    [['נשאר תשלום אחד', 'שיפוצים · התשלום האחרון ב־1.10 · דרך תלוש השכר']],
    'the lifecycle alert stands on its own now that the payroll loan raises no payment alert',
  );
  // On its last day the obligation still reports that it ended.
  const end = await homeView([payroll], at(2026, 10, 1));
  assert.deepEqual(end.alerts.map((a) => a.title), ['התחייבות הסתיימה']);
});

test('a bank obligation on its last payment day keeps the merged single alert', async () => {
  // The start day (26) is past the billing day (18), so the first charge is 18.12.2025 and the
  // twelfth — the last — is 18.11.2026.
  const loan = { id: 12, type: 'loan', displayCategory: 'loan', title: 'הלוואה', amount: 835, day: '18', total: '12', start: '2025-11-26', where: 'בחשבון', isArchived: false };
  const v = await homeView([loan], at(2026, 11, 17));
  assert.deepEqual(v.alerts.map((a) => [a.title, a.detail]), [['תשלום צפוי מחר', 'הלוואה · התשלום האחרון']]);
});

test('the alert and "מה צפוי לרדת" can no longer disagree about tomorrow', async () => {
  const items = [
    fixed(),
    fixed({ id: 21, title: 'אשראי', where: 'credit', cardLast4: '9999' }),
    { id: 22, type: 'loan', displayCategory: 'loan', title: 'תלוש', amount: 500, day: '18', total: '24', start: '2026-04-21', where: 'דרך תלוש השכר', isArchived: false },
  ];
  const v = await homeView(items, at(2026, 9, 17));
  const alerted = v.alerts.filter((a) => a.title === 'תשלום צפוי מחר').map((a) => a.detail).sort();
  const tomorrow = v.upcoming.filter((c) => c.dateText === '18.9.2026').map((c) => c.title).sort();
  assert.deepEqual(alerted, tomorrow);
  assert.deepEqual(alerted, ['קבוע']);
});
