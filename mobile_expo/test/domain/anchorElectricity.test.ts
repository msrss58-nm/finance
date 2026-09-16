// Balance-anchor semantics for a scheduled bank charge ("חשמל"), verified against the
// approved rule: activity BEFORE the anchor is already inside the entered amount and is
// never re-applied; activity AFTER it reduces the balance exactly once; the anchor day
// itself keeps the existing withdrawal-snapshot semantics.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { getProjectedBalanceToday } from '../../src/domain/forecast.ts';

const cc = resolveCategoryConfig(null);
const ELECTRICITY = { id: 1, type: 'fixed', displayCategory: 'fixed', title: 'חשמל', amount: 320, day: '15', where: 'bank', isArchived: false };

const balanceOn = (now: Date, openingDate: string, items: Record<string, unknown>[] = [ELECTRICITY], includedWithdrawalIds: readonly number[] = []) => {
  const p = getProjectedBalanceToday(items, now, { amount: 10000, dateStr: openingDate, includedWithdrawalIds }, cc);
  assert.ok(p.configured && p.state === 'available');
  return p.state === 'available' ? p.projectedBalance : NaN;
};

test('anchor AFTER the electricity date: the charge is already included and is never re-applied', () => {
  // The device case: anchor 10,000 on 16.9, electricity due 15.9 -> displayed balance stays 10,000.
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-16'), 10000);
  assert.equal(balanceOn(new Date(2026, 8, 20, 10, 0), '2026-09-16'), 10000, 'still not re-applied on later days');
});

test('anchor BEFORE the electricity date: the charge reduces the balance exactly once', () => {
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-14'), 9680, '10,000 - 320');
  assert.equal(balanceOn(new Date(2026, 8, 30, 10, 0), '2026-09-14'), 9680, 'one September charge only, not once per day');
});

test('anchor ON the electricity date: the day\'s own charge counts as already included', () => {
  assert.equal(balanceOn(new Date(2026, 8, 15, 10, 0), '2026-09-15'), 10000);
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-15'), 10000, 'and it is not applied the next day either');
});

test('an event scheduled for TODAY (after the anchor) reduces the balance on that same day', () => {
  // Scenario D: anchor 15.9 = 10,000, bank expense 320 on 16.9, today 16.9 -> 9,680 today,
  // not only from 17.9 onwards.
  const onThe16th = [{ id: 1, type: 'fixed', displayCategory: 'fixed', title: 'חשמל', amount: 320, day: '16', where: 'bank', isArchived: false }];
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-15', onThe16th), 9680, 'applied on its own scheduled date');
  assert.equal(balanceOn(new Date(2026, 8, 17, 10, 0), '2026-09-15', onThe16th), 9680, 'and exactly once afterwards');
  // A one-off dated bank charge behaves the same on its own day.
  const datedToday = [{ id: 2, type: 'dated', displayCategory: 'dated', title: 'חיוב', amount: 500, start: '2026-09-16', where: 'bank', cardLast4: '4580', isArchived: false }];
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-15', datedToday), 9500);
});

test('no double counting across months: two charges after the anchor subtract twice, once each', () => {
  assert.equal(balanceOn(new Date(2026, 9, 16, 10, 0), '2026-09-14'), 9360, '15.9 and 15.10 = 10,000 - 640');
});

test('a cash withdrawal on the anchor day stays covered by the existing snapshot rule', () => {
  const items = [ELECTRICITY, { id: 2, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 150, start: '2026-09-16', isArchived: false }];
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-16', items, [2]), 10000, 'snapshotted withdrawal not counted again');
  assert.equal(balanceOn(new Date(2026, 8, 16, 10, 0), '2026-09-16', items, []), 9850, 'a withdrawal added after the anchor does count');
});
