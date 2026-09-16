// Approved rule (16/09/2026): an updated balance is authoritative AT THE UPDATE POINT.
// The entered amount is the balance for that day; activity before it is already reflected in
// the amount and is never re-applied, and only later activity moves the balance forward.
// Same-day handling reuses the existing Opening Balance snapshot — no schema change.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getProjectedBalanceToday } from '../../src/domain/forecast.ts';
import { getProjectedBalanceOpeningConfig } from '../../src/domain/settings.ts';
import { formatAmount } from '../../src/presentation/format.ts';
import { buildHomeView } from '../../src/presentation/homeView.ts';
import { financeHarness, form, ready } from '../support/financeHarness.ts';

const TODAY = new Date(2026, 8, 14, 10, 0); // 2026-09-14
const TODAY_STR = '2026-09-14';

/** Activity that already happened before the update point, plus one withdrawal on the update day. */
const HISTORY = [
  { id: 1, type: 'income', displayCategory: 'income', title: 'משכורת', amount: 8000, day: '1', isArchived: false },
  { id: 2, type: 'fixed', displayCategory: 'fixed', title: 'שכירות', amount: 4000, day: '5', where: 'bank', isArchived: false },
  { id: 3, type: 'dated', displayCategory: 'dated', title: 'ביטוח', amount: 200, start: '2026-09-08', where: 'bank', cardLast4: '4580', isArchived: false },
  { id: 4, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 300, start: '2026-09-10', isArchived: false, notes: '' },
  { id: 5, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 150, start: TODAY_STR, isArchived: false, notes: '' },
];

const displayedBalance = (h: Awaited<ReturnType<typeof financeHarness>>): string => buildHomeView(ready(h.finance)).hero.amountText;

test('balance update is the authoritative anchor: exactly the entered amount, no past activity re-applied', async () => {
  const h = await financeHarness({ family_finance_data: JSON.stringify(HISTORY) }, TODAY);
  await h.finance.load();

  // 1. the history exists and is material (an anchor dated earlier would NOT show 10,000).
  const before = ready(h.finance);
  assert.equal(before.data.items.length, 5, 'historical activity exists');
  const wrongAnchor = getProjectedBalanceToday(
    before.data.items,
    TODAY,
    { amount: 10000, dateStr: '2026-09-01', includedWithdrawalIds: [] },
    before.data.categoryConfig,
  );
  assert.equal(wrongAnchor.configured && wrongAnchor.state === 'available' && wrongAnchor.projectedBalance !== 10000, true, 'the pre-anchor activity really moves the balance');

  const storedItemsBefore = await h.kv.get('family_finance_data');

  // 2. the user updates the balance to 10,000 at the update point (today).
  assert.ok((await h.finance.saveOpeningBalance(10000, TODAY_STR)).ok);

  // 3. + 4. the displayed balance is exactly 10,000; nothing from before is re-applied.
  assert.equal(displayedBalance(h), formatAmount(10000));

  // 7. the historical transactions themselves are untouched.
  assert.equal(await h.kv.get('family_finance_data'), storedItemsBefore, 'no item was deleted or modified');

  // 8. the same-day withdrawal is captured in the snapshot, so it is not counted a second time.
  const opening = getProjectedBalanceOpeningConfig(ready(h.finance).data.settings);
  assert.deepEqual(opening?.includedWithdrawalIds, [5], 'the update-day withdrawal is marked as already included');
  assert.equal(displayedBalance(h), formatAmount(10000), 'no cash-withdrawal double counting');
});

test('only activity after the new anchor moves the balance: -500 then +1,000', async () => {
  const h = await financeHarness({ family_finance_data: JSON.stringify(HISTORY) }, TODAY);
  await h.finance.load();
  assert.ok((await h.finance.saveOpeningBalance(10000, TODAY_STR)).ok);
  assert.equal(displayedBalance(h), formatAmount(10000));

  // 5. a later outgoing event of 500 -> 9,500.
  assert.ok((await h.finance.createItem('dated', 'dated', form({ title: 'מקרר', amount: '500', start: '2026-09-15', where: 'bank', cardLast4: '4580' }))).ok);
  h.clock.now = new Date(2026, 8, 15, 10, 0);
  await h.finance.load();
  assert.equal(displayedBalance(h), formatAmount(9500), 'only the later outflow applies');

  // 6. a later income of 1,000 -> 10,500.
  assert.ok((await h.finance.createItem('income', 'income', form({ title: 'בונוס', amount: '1000', day: '16' }))).ok);
  h.clock.now = new Date(2026, 8, 16, 10, 0);
  await h.finance.load();
  assert.equal(displayedBalance(h), formatAmount(10500), 'the later income applies once');

  // the historical items are still stored alongside the new ones.
  const ids = ready(h.finance).data.items.map((it) => it.id);
  for (const id of [1, 2, 3, 4, 5]) assert.ok(ids.includes(id), 'history kept: ' + id);
});

test('a withdrawal recorded after the update, dated on the update day, still counts (it is not in the snapshot)', async () => {
  const h = await financeHarness({ family_finance_data: JSON.stringify(HISTORY) }, TODAY);
  await h.finance.load();
  assert.ok((await h.finance.saveOpeningBalance(10000, TODAY_STR)).ok);
  assert.equal(displayedBalance(h), formatAmount(10000));

  assert.ok((await h.finance.createItem('cashWithdrawal', null, form({ amount: '400', start: TODAY_STR }))).ok);
  await h.finance.load();
  assert.equal(displayedBalance(h), formatAmount(9600), 'a new withdrawal after the anchor is a real movement');
});
