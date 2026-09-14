// Screen view models: figures straight from the domain, approved Home/Forecast semantics.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmount, formatPeriodLabel, formatSignedAmount, relativeDaysText } from '../../src/presentation/format.ts';
import { buildForecastView } from '../../src/presentation/forecastView.ts';
import { buildGoalsView } from '../../src/presentation/goalsView.ts';
import { buildHomeView, HOME_TEXT } from '../../src/presentation/homeView.ts';
import { buildCategoryList, buildTransactionsView } from '../../src/presentation/transactionsView.ts';
import { buildActivityRows } from '../../src/presentation/settingsView.ts';
import { goalRecord, snapshotOf } from '../support/financeHarness.ts';

const NOW = new Date(2026, 8, 14, 10, 0);

const HOME_ITEMS = [
  { id: 1, type: 'income', displayCategory: 'income', title: 'משכורת', amount: 10000, day: '15', isArchived: false },
  { id: 2, type: 'fixed', displayCategory: 'fixed', title: 'שכירות', amount: 4000, day: '15', where: 'bank', isArchived: false },
  { id: 3, type: 'fixed', displayCategory: 'fixed', title: 'ועד', amount: 300, day: '20', where: 'bank', isArchived: false },
  { id: 4, type: 'fixed', displayCategory: 'fixed', title: 'Netflix', amount: 50, day: '18', where: 'credit', cardLast4: '1234', isArchived: false },
  { id: 5, type: 'loan', displayCategory: 'loan', title: 'רכב', amount: 1000, day: '17', total: '24', start: '2026-01-01', where: 'דרך תלוש השכר', isArchived: false },
  { id: 6, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 300, start: '2026-09-16', isArchived: false, notes: '' },
  { id: 7, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 200, start: '2026-09-10', isArchived: false, notes: 'כספומט' },
  { id: 8, type: 'dated', displayCategory: 'dated', title: 'ויזה', amount: 1500, start: '2026-09-25', where: 'bank', cardLast4: '4580', isArchived: false },
  { id: 9, type: 'dated', displayCategory: 'dated', title: 'ביטוח', amount: 700, start: '2026-09-24', where: 'bank', cardLast4: '4580', isArchived: false },
];
const OPENING = '{"projectedBalanceOpeningAmount":5000,"projectedBalanceOpeningDate":"2026-09-05","projectedBalanceOpeningIncludedWithdrawalIds":[]}';

test('Home: hero, expenses WITHOUT withdrawals, withdrawals shown apart, alerts, 10-day charges without duplicates', async () => {
  const s = await snapshotOf({ family_finance_data: JSON.stringify(HOME_ITEMS), family_finance_settings: OPENING }, NOW);
  const v = buildHomeView(s);
  assert.deepEqual(v.hero, { state: 'available', amountText: formatAmount(4800), tone: 'positive', status: HOME_TEXT.availableStatus });
  assert.equal(v.incomeText, formatAmount(10000));
  assert.equal(v.expensesText, formatAmount(6500), 'rent 4000 + committee 300 + card bills 1500 + 700; no withdrawals');
  assert.equal(v.withdrawalsText, formatAmount(500));
  assert.equal(v.periodText, '5.9–4.10');
  assert.deepEqual(v.alerts.map((a) => [a.title, a.detail]), [
    ['תשלום צפוי מחר', 'שכירות'],
    ['הכנסה צפויה מחר', 'משכורת'],
  ]);
  // Rent (tomorrow) is already an alert; withdrawals, the payroll loan and credit items are not bank charges;
  // the Sep 25 card bill is outside today+10; Sep 24 is the inclusive edge.
  assert.deepEqual(v.upcoming.map((c) => [c.title, c.dateText, c.amountText]), [
    ['ועד', '20.9.2026', formatSignedAmount(-300)],
    ['ביטוח', '24.9.2026', formatSignedAmount(-700)],
  ]);
  assert.deepEqual(v.withdrawalsThisMonth.map((w) => [w.dateText, w.amountText]), [
    ['10.9.2026', formatAmount(200)],
    ['16.9.2026', formatAmount(300)],
  ]);
  assert.deepEqual(v.tiles.map((t) => t.key), ['fixed', 'variable', 'variable-remaining', 'loan', 'loan-balance', 'dated']);
  const dated = v.tiles.find((t) => t.key === 'dated');
  assert.ok(dated && dated.kind === 'category');
  assert.equal(dated.amountText, formatAmount(2200));
  assert.equal(dated.updatedLine, 'עודכן: —');
  assert.equal(v.corruptBanner, null);
  assert.equal(JSON.stringify(v).includes('ההכנסה הבאה'), false, '"amount until next income" is not exposed');
});

test('Home hero is never a fabricated 0: unconfigured and future opening states', async () => {
  const none = buildHomeView(await snapshotOf({}, NOW));
  assert.deepEqual([none.hero.state, none.hero.amountText], ['unconfigured', 'לא הוגדרה']);
  const future = buildHomeView(
    await snapshotOf({ family_finance_settings: '{"projectedBalanceOpeningAmount":0,"projectedBalanceOpeningDate":"2026-10-01"}' }, NOW),
  );
  assert.deepEqual([future.hero.state, future.hero.amountText], ['future', '—']);
  assert.match(future.hero.status, /1\.10\.2026/);
  const corrupt = buildHomeView(await snapshotOf({ family_finance_data: '{oops' }, NOW));
  assert.equal(corrupt.corruptBanner, HOME_TEXT.corrupt);
});

test('Forecast: the 5th→4th period only, unavailable before the opening, withdrawals apart from expenses', async () => {
  const items = [
    { id: 1, type: 'fixed', displayCategory: 'fixed', title: 'חשמל', amount: 100, day: '12', where: 'bank', isArchived: false },
    { id: 2, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 300, start: '2026-09-12', isArchived: false, notes: '' },
  ];
  const s = await snapshotOf(
    {
      family_finance_data: JSON.stringify(items),
      family_finance_settings: '{"projectedBalanceOpeningAmount":1000,"projectedBalanceOpeningDate":"2026-09-10","projectedBalanceOpeningIncludedWithdrawalIds":[]}',
    },
    NOW,
  );
  const v = buildForecastView(s);
  assert.equal(v.periodLabel, '5 בספטמבר – 4 באוקטובר 2026');
  assert.equal(v.rows.length, 30, 'exactly the period — no hidden 6-month horizon');
  assert.deepEqual(v.rows.slice(0, 5).map((r) => [r.availability, r.balanceText, r.withdrawalsText]), Array(5).fill(['unavailable', '—', null]));
  assert.equal(v.rows[5]?.dateText, '10.9 · יתרת התחלה');
  const sep12 = v.rows[7];
  assert.ok(sep12);
  assert.equal(sep12.expensesText, formatSignedAmount(-100));
  assert.equal(sep12.withdrawalsText, formatSignedAmount(-300));
  assert.deepEqual(sep12.events.map((e) => e.kind), ['expense', 'withdrawal']);
  assert.equal(sep12.balanceText, formatAmount(600));
  assert.equal(v.rows.find((r) => r.isToday)?.key, '2026-09-14');
  assert.ok(v.chart && v.chart.kind === 'bars');
  assert.equal(v.chart.points.length, 25);
  assert.equal(v.chart.totalDays, 30);
  const none = buildForecastView(await snapshotOf({}, NOW));
  assert.deepEqual([none.configured, none.rows.length, none.chart], [false, 0, null]);
});

test('Goals: FIFO funding plan, overdue money and badges come from the domain', async () => {
  const goals = [goalRecord(), goalRecord({ id: 'g2', title: 'מתנה', dueDate: '2026-08-01', targetAmount: 1000, savedAmount: 200 }), goalRecord({ id: 'g3', isArchived: true })];
  const v = buildGoalsView(await snapshotOf({ family_finance_goals: JSON.stringify(goals) }, NOW));
  assert.equal(v.valid, true);
  assert.deepEqual(v.active.map((g) => g.id), ['g1', 'g2']);
  assert.deepEqual(v.archived.map((g) => g.id), ['g3']);
  const g1 = v.active[0];
  assert.ok(g1);
  assert.deepEqual(g1.plan.map((p) => [p.dateText, p.amountText]), [
    ['2.10.2026', formatAmount(334)],
    ['2.11.2026', formatAmount(334)],
    ['2.12.2026', formatAmount(332)],
  ]);
  assert.match(g1.nextTransferNote ?? '', /2\.10\.2026/);
  const g2 = v.active[1];
  assert.ok(g2);
  assert.equal(g2.badge, 'overdue');
  assert.equal(g2.overdueAmountText, formatAmount(800));
  assert.equal(g2.plan.length, 0);
  assert.equal(buildGoalsView(await snapshotOf({ family_finance_goals: 'corrupt' }, NOW)).valid, false);
});

test('Transactions: category filter, newest first, archive filter, installment summary; category counts', async () => {
  const items = [
    { id: 10, type: 'loan', displayCategory: 'loan', title: 'רכב', amount: 1000, day: '17', total: '24', start: '2026-01-01', where: 'חשבון בנק', isArchived: false },
    { id: 11, type: 'loan', displayCategory: 'loan', title: 'ישנה', amount: 50, day: '1', total: '2', start: '2020-01-01', isArchived: true },
    { id: 12, type: 'fixed', displayCategory: 'fixed', title: 'חשמל', amount: 100, day: '12', where: 'bank', isArchived: false },
  ];
  const s = await snapshotOf({ family_finance_data: JSON.stringify(items) }, NOW);
  const loans = buildTransactionsView(s, 'loan', false);
  assert.deepEqual(loans.rows.map((r) => r.title), ['רכב']);
  assert.deepEqual(loans.rows[0]?.installment, ['תשלום 8/24', 'יתרה ' + formatAmount(16000)]);
  assert.deepEqual([loans.activeCount, loans.archivedCount, loans.canAdd, loans.canDelete], [1, 1, true, false]);
  assert.deepEqual(buildTransactionsView(s, 'loan', true).rows.map((r) => [r.title, r.editable]), [['ישנה', false]]);
  const all = buildTransactionsView(s, null, false);
  assert.deepEqual(all.rows.map((r) => r.id), [12, 10], 'newest (highest id) first');
  assert.equal(all.canAdd, false);
  const list = buildCategoryList(s);
  assert.deepEqual(list.rows.map((r) => [r.key, r.activeCount, r.archivedCount]), [
    ['income', 0, 0],
    ['fixed', 1, 0],
    ['variable', 0, 0],
    ['loan', 1, 1],
    ['dated', 0, 0],
  ]);
  assert.equal(buildTransactionsView(s, 'gone', false).exists, false);
});

test('format helpers and activity rows', () => {
  assert.equal(formatPeriodLabel(new Date(2026, 11, 5), new Date(2027, 0, 4)), '5 בדצמבר 2026 – 4 בינואר 2027');
  assert.equal(relativeDaysText(new Date(2026, 8, 15), NOW), 'מחר');
  assert.equal(relativeDaysText(new Date(2026, 8, 24), NOW), 'בעוד 10 ימים');
  assert.deepEqual(buildActivityRows([{ ts: 'a', action: 'backup', detail: 'x' }, 'garbage']).map((r) => r.label), ['undefined', 'גיבוי נתונים']);
});
