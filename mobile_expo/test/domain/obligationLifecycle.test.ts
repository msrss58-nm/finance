// End-of-obligation alerts — APPROVED 17/09/2026 (mobile-only; computeInAppAlerts stays Web-verbatim).
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getAutoArchiveCandidates } from '../../src/domain/aggregates.ts';
import { computeInAppAlerts } from '../../src/domain/alerts.ts';
import { generateCashflowEvents } from '../../src/domain/cashflow.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { computeObligationLifecycleAlerts, LIFECYCLE_TEXT, mergeObligationLifecycleAlerts } from '../../src/domain/obligationLifecycle.ts';
import { buildHomeView } from '../../src/presentation/homeView.ts';
import { formatAmount } from '../../src/presentation/format.ts';
import { snapshotOf } from '../support/financeHarness.ts';

const cc = resolveCategoryConfig(null);
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0);
const ON = { notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: true } };
const lifecycle = (items: object[], now: Date, settings: object | null = ON) =>
  computeObligationLifecycleAlerts({ items: items as never, settings: settings as never, now, categoryConfig: cc });
const homeAlerts = (items: object[], now: Date, settings: object = ON) =>
  mergeObligationLifecycleAlerts(
    computeInAppAlerts({ items: items as never, settings: settings as never, now, categoryConfig: cc, lastAutoArchivedTitles: [] }),
    lifecycle(items, now, settings),
  );

// 12 payments on the 2nd, the first on 2.12.2025 → the last on 2.11.2026.
const loan = (fields: object = {}) => ({ id: 1, type: 'loan', displayCategory: 'loan', title: 'הלוואה', amount: 835, day: '2', total: '12', start: '2025-11-26', where: 'בחשבון', isArchived: false, ...fields });

test('exactly one payment left → one "נשאר תשלום אחד" alert with the last billing date and the installment amount', () => {
  const got = lifecycle([loan()], at(2026, 10, 17));
  assert.deepEqual(got.map((a) => [a.kind, a.title, a.detail, a.amount, a.itemId]), [['lastPayment', 'נשאר תשלום אחד', 'הלוואה · התשלום האחרון ב־2.11', 835, 1]]);
  assert.equal(got[0]?.date?.getTime(), new Date(2026, 10, 2).getTime());
});

test('two or more payments left → no alert (no count-down flooding)', () => {
  assert.deepEqual(lifecycle([loan()], at(2026, 9, 17)), []);
  assert.deepEqual(lifecycle([loan()], at(2026, 10, 1)), [], 'the 2.10 payment has not happened yet: still 2 left');
  assert.equal(lifecycle([loan()], at(2026, 10, 2)).length, 1, 'once the 2.10 payment is today it counts as paid: 1 left');
});

test('the last billing day itself → "התחייבות הסתיימה"; the next day the existing sweep takes over with no lifecycle alert', () => {
  assert.deepEqual(lifecycle([loan()], at(2026, 11, 2)).map((a) => [a.kind, a.title, a.detail, a.amount]), [
    ['obligationEndsToday', 'התחייבות הסתיימה', 'הלוואה · התשלום האחרון היום', null],
  ]);
  assert.deepEqual(lifecycle([loan()], at(2026, 11, 3)), []);
  assert.equal(getAutoArchiveCandidates([loan()] as never, at(2026, 11, 3), cc).length, 1, 'the sweep archives it and raises its own alert');
});

test('one alert per obligation: "תשלום צפוי מחר" for the last payment is marked, not repeated', () => {
  const got = homeAlerts([loan()], at(2026, 11, 1));
  assert.deepEqual(got.map((a) => [a.kind, a.title, a.detail]), [['upcomingPayment', 'תשלום צפוי מחר', 'הלוואה · ' + LIFECYCLE_TEXT.lastMark]]);
  // With the payment reminder off, the lifecycle alert itself is shown instead.
  const noPayment = homeAlerts([loan()], at(2026, 11, 1), { notifications: { upcomingPayment: false, upcomingIncome: true, completedObligation: true } });
  assert.deepEqual(noPayment.map((a) => a.kind), ['lastPayment']);
});

test('final-payment date follows the stored billing day, clamped only for the calendar (31 → 30.11)', () => {
  const it = loan({ day: '31', total: '3', start: '2026-09-01' }); // 30.9, 31.10, 30.11
  assert.deepEqual(lifecycle([it], at(2026, 11, 1)).map((a) => a.detail), ['הלוואה · התשלום האחרון ב־30.11']);
  assert.deepEqual(lifecycle([it], at(2026, 11, 30)).map((a) => a.kind), ['obligationEndsToday'], 'the clamped last day is the end day');
  assert.equal(it.day, '31', 'the stored day is untouched');
});

test('non-loan installments: bank, credit and tracking-only variable items share the same lifecycle', () => {
  const base = { type: 'variable', displayCategory: 'variable', amount: 200, day: '2', total: '5', start: '2026-07-29', isArchived: false };
  const items = [
    { ...base, id: 11, title: 'בנק', where: 'bank' },
    { ...base, id: 12, title: 'אשראי', where: 'credit' },
    { ...base, id: 13, title: 'מעקב' },
  ];
  assert.deepEqual(lifecycle(items, at(2026, 11, 10)).map((a) => [a.itemId, a.detail]), [
    [11, 'בנק · התשלום האחרון ב־2.12'],
    [12, 'אשראי · התשלום האחרון ב־2.12'],
    [13, 'מעקב · התשלום האחרון ב־2.12'],
  ]);
});

test('archived / completed items, items without a lifecycle, and other types never alert', () => {
  const items = [
    loan({ id: 2, isArchived: true }),
    loan({ id: 3, archiveReason: 'completed' }),
    loan({ id: 4, total: '' }),
    loan({ id: 5, start: '' }),
    loan({ id: 6, total: '0' }),
    { id: 7, type: 'fixed', displayCategory: 'fixed', title: 'קבוע', amount: 100, day: '2', where: 'bank', isArchived: false },
  ];
  assert.deepEqual(lifecycle(items, at(2026, 10, 17)), []);
});

test('a payroll loan alerts like any loan (lifecycle), is marked as payroll, and still creates no cash-flow event', () => {
  const payroll = loan({ id: 8, where: 'דרך תלוש השכר', amount: 362 });
  assert.deepEqual(lifecycle([payroll], at(2026, 10, 17)).map((a) => a.detail), ['הלוואה · התשלום האחרון ב־2.11 · דרך תלוש השכר']);
  const titled = loan({ id: 9, where: 'דרך תלוש השכר', title: 'יהב שיפוצים- יורד דרך התלוש' });
  assert.deepEqual(lifecycle([titled], at(2026, 10, 17)).map((a) => a.detail), ['יהב שיפוצים- יורד דרך התלוש · התשלום האחרון ב־2.11'], 'no repeated payroll wording');
  assert.deepEqual(generateCashflowEvents([payroll] as never, new Date(2026, 10, 1), 1, cc), []);
});

test('notifications.completedObligation off → no lifecycle alert; the base list is returned unchanged', () => {
  const off = { notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: false } };
  assert.deepEqual(lifecycle([loan()], at(2026, 10, 17), off), []);
  assert.deepEqual(lifecycle([loan()], at(2026, 10, 17), null), []);
  const base = computeInAppAlerts({ items: [loan()] as never, settings: off as never, now: at(2026, 11, 1), categoryConfig: cc, lastAutoArchivedTitles: [] });
  assert.deepEqual(mergeObligationLifecycleAlerts(base, []), base);
});

// Anonymized equivalent of every active loan / variable item in the real A54 data (17/09/2026).
const REAL_INSTALLMENTS = [
  loan({ id: 21, amount: 835 }),
  loan({ id: 22, amount: 835 }),
  loan({ id: 23, amount: 1090.64, where: 'דרך תלוש השכר', total: '24', start: '2026-06-15' }),
  loan({ id: 24, amount: 685.04, where: 'דרך תלוש השכר', total: '12', start: '2026-04-22' }),
  loan({ id: 25, amount: 653.99, where: 'דרך תלוש השכר', total: '24', start: '2026-04-21' }),
  loan({ id: 26, title: 'שיפוצים- יורד דרך התלוש', amount: 362, where: 'דרך תלוש השכר', day: '1', total: '120', start: '2016-10-26' }),
  loan({ id: 27, amount: 788, total: '24', start: '2026-03-23' }),
  loan({ id: 28, amount: 1532.6, where: 'חשבון בנק', day: '10', total: '36', start: '2026-04-29' }),
  { id: 31, type: 'variable', displayCategory: 'variable', title: 'ביטוח', amount: 200, day: '2', total: '5', start: '2026-07-29', isArchived: false },
  { id: 32, type: 'variable', displayCategory: 'variable', title: 'תמי', amount: 58, day: '2', total: '12', start: '2026-02-18', isArchived: false },
  { id: 33, type: 'variable', displayCategory: 'variable', title: 'רכב', amount: 509, day: '1', total: '5', start: '2026-08-31', isArchived: false },
  { id: 34, type: 'variable', displayCategory: 'variable', title: 'משקפיים', amount: 127, day: '2', total: '12', start: '2026-08-26', where: 'credit', isArchived: false },
];

test('real-data equivalent: on 17.9 only the payroll loan ending 1.10 alerts; the ₪835 loans end 2.11 (2 left), not 2.10', () => {
  assert.deepEqual(lifecycle(REAL_INSTALLMENTS, at(2026, 9, 17)).map((a) => [a.kind, a.itemId, a.detail, a.amount]), [
    ['lastPayment', 26, 'שיפוצים- יורד דרך התלוש · התשלום האחרון ב־1.10', 362],
  ]);
  // 30.9: the existing "תשלום צפוי מחר" names it and is marked, no second alert.
  const sep30 = homeAlerts(REAL_INSTALLMENTS, at(2026, 9, 30)).filter((a) => a.itemId === 26);
  assert.deepEqual(sep30.map((a) => [a.kind, a.detail]), [['upcomingPayment', 'שיפוצים- יורד דרך התלוש · התשלום האחרון']]);
  assert.deepEqual(lifecycle(REAL_INSTALLMENTS, at(2026, 10, 1)).map((a) => [a.kind, a.itemId]), [['obligationEndsToday', 26]]);
  // 2.10: the ₪835 loans' 2.10 payment is today, so it counts as paid → 1 left, the last on 2.11.
  assert.deepEqual(lifecycle(REAL_INSTALLMENTS, at(2026, 10, 2)).map((a) => [a.kind, a.itemId, a.detail]), [
    ['lastPayment', 21, 'הלוואה · התשלום האחרון ב־2.11'],
    ['lastPayment', 22, 'הלוואה · התשלום האחרון ב־2.11'],
  ]);
});

test('Home: existing alerts keep order and content; the lifecycle alert follows the payment alerts', async () => {
  const items = [
    ...REAL_INSTALLMENTS,
    { id: 41, type: 'income', displayCategory: 'income', title: 'משכורת', amount: 2760, day: '28', isArchived: false },
    { id: 42, type: 'fixed', displayCategory: 'fixed', title: 'קבוע', amount: 74, day: '18', where: 'bank', isArchived: false },
  ];
  const now = at(2026, 9, 17);
  const base = computeInAppAlerts({ items: items as never, settings: ON as never, now, categoryConfig: cc, lastAutoArchivedTitles: [] });
  const merged = homeAlerts(items, now);
  assert.deepEqual(merged.map((a) => a.kind), ['upcomingPayment', 'lastPayment', 'upcomingIncome']);
  assert.deepEqual(merged.filter((a) => a.kind !== 'lastPayment'), base, 'the existing alerts are untouched');
  const v = buildHomeView(await snapshotOf({ family_finance_data: JSON.stringify(items), family_finance_settings: JSON.stringify(ON) }, now));
  assert.deepEqual(v.alerts.map((a) => [a.title, a.detail, a.amountText]), [
    ['תשלום צפוי מחר', 'קבוע', formatAmount(74)],
    ['נשאר תשלום אחד', 'שיפוצים- יורד דרך התלוש · התשלום האחרון ב־1.10', formatAmount(362)],
  ]);
  // APPROVED 17/09/2026: the recurring income still alerts in the domain (base above) but not on Home.
  assert.equal(base.filter((a) => a.kind === 'upcomingIncome').length, 1);
  assert.equal(v.alerts.some((a) => a.title.startsWith('הכנסה צפויה')), false);
});
