// Goals: strict validation + FIFO funding + reminder calculation (hand-derived).
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { cashflowDateKey } from '../../src/domain/dates.ts';
import { isValidGoalsArrayStrict, loadGoalsState, normalizeGoal, type Goal } from '../../src/domain/goals.ts';
import {
  buildDeadlineScheduleFromDates,
  buildGoalReminderInfo,
  buildGoalScheduleInfo,
  getLastEligibleTransferDate,
  isGoalDueForReminderNow,
  isGoalHandledForPeriod,
} from '../../src/domain/goalsPlanning.ts';

const ISO = '2026-01-01T00:00:00.000Z';
const rawGoal = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'g1',
  title: 'יעד',
  dueDate: '2026-12-31',
  targetAmount: 3500,
  savedAmount: 1200,
  components: [
    { id: 'c1', name: 'ריהוט', amount: 1000, dueDate: '2026-06-15' },
    { id: 'c2', name: 'טיסה', amount: 1500, dueDate: '2026-08-10' },
    { id: 'c3', name: 'ביטוח', amount: 1000, dueDate: '2026-12-15' },
  ],
  isArchived: false,
  createdAt: ISO,
  updatedAt: ISO,
  confirmedTransfers: [],
  ...over,
});
const goal = (over: Record<string, unknown> = {}): Goal => normalizeGoal(rawGoal(over)) as Goal;
const now = new Date(2026, 3, 10, 9, 0);
const perDate = (list: readonly { date: Date; amount: number }[]) => list.map((p) => `${cashflowDateKey(p.date)}=${p.amount}`);

test('strict validation: numeric strings, stale totals, partial hybrids, duplicates and time travel are all rejected', () => {
  assert.ok(normalizeGoal(rawGoal()));
  assert.equal(normalizeGoal(rawGoal({ savedAmount: '1200' })), null);
  assert.equal(normalizeGoal(rawGoal({ targetAmount: 3600 })), null, 'stale stored total vs component sum');
  assert.equal(normalizeGoal(rawGoal({ updatedAt: '2025-12-31T00:00:00.000Z' })), null);
  assert.equal(normalizeGoal(rawGoal({ confirmedTransfers: [{ date: '2026-04-02', amount: 10, id: 'x' }] })), null, 'partial hybrid');
  assert.equal(isValidGoalsArrayStrict([rawGoal(), rawGoal()]), null, 'duplicate goal ids');
  const tiny = normalizeGoal(rawGoal({ components: [{ id: 'a', name: 'a', amount: 0.1 }, { id: 'b', name: 'b', amount: 0.2 }], targetAmount: 0.3 }));
  assert.equal(tiny?.targetAmount, 0.3);
});

test('loadGoalsState: absent = valid empty; corrupt = invalid with the raw string kept byte-for-byte', () => {
  assert.deepEqual(loadGoalsState(null), { valid: true, raw: null, goals: [] });
  assert.deepEqual(loadGoalsState('not json'), { valid: false, raw: 'not json', goals: [] });
});

test('final eligible transfer date: that month\'s 2nd, or the previous month\'s when due on the 1st', () => {
  assert.equal(cashflowDateKey(getLastEligibleTransferDate('2026-06-02')), '2026-06-02');
  assert.equal(cashflowDateKey(getLastEligibleTransferDate('2026-06-01')), '2026-05-02');
  assert.equal(cashflowDateKey(getLastEligibleTransferDate('2026-01-01')), '2025-12-02');
});

test('FIFO: the pool funds the earliest deadline first; ceil per date, merged per calendar date', () => {
  const info = buildGoalScheduleInfo(goal(), now);
  assert.deepEqual(info.buckets.map((b) => [b.key, b.saved, b.remaining]), [['c1', 1000, 0], ['c2', 200, 1300], ['c3', 0, 1000]]);
  assert.equal(info.buckets[0]?.isCompleted, true);
  // c2: May–Aug (4 × 325); c3: May–Dec (8 × 125).
  assert.deepEqual(perDate(info.mergedPerDateAmounts), [
    '2026-05-02=450', '2026-06-02=450', '2026-07-02=450', '2026-08-02=450',
    '2026-09-02=125', '2026-10-02=125', '2026-11-02=125', '2026-12-02=125',
  ]);
  assert.equal(info.remaining, 2300);
  assert.equal(info.effectiveDueDate, '2026-08-10');
});

test('the final date absorbs the remainder; never negative', () => {
  const dates = [new Date(2026, 3, 2), new Date(2026, 4, 2), new Date(2026, 5, 2)];
  assert.deepEqual(buildDeadlineScheduleFromDates(1000, '2026-06-15', dates).perDateAmounts.map((p) => p.amount), [334, 334, 332]);
});

test('reminder: today is immediate; overdue is separated from today\'s contribution', () => {
  const info = buildGoalReminderInfo(goal(), now);
  // c2: [Apr10, May2, Jun2, Jul2, Aug2] -> 260; c3: [Apr10, May2 … Dec2] -> ceil(1000/9) = 112.
  assert.deepEqual([info.overdueAmount, info.todayContribution, info.suggestedTotal, info.remainingAfterSuggested], [0, 372, 372, 1928]);

  const overdue = goal({ components: [], targetAmount: 900, savedAmount: 0, dueDate: '2026-03-01' });
  const o = buildGoalReminderInfo(overdue, now);
  assert.deepEqual([o.overdueAmount, o.todayContribution, o.suggestedTotal], [900, 0, 900]);
  assert.equal(buildGoalScheduleInfo(overdue, now).isOverdue, true);
});

test('treated period YYYY-MM: any positive transfer in the period marks the goal handled', () => {
  const handled = goal({ confirmedTransfers: [{ date: '2026-04-05', amount: 50 }] });
  assert.equal(isGoalHandledForPeriod(handled, '2026-04'), true);
  assert.equal(isGoalHandledForPeriod(handled, '2026-05'), false);
  assert.equal(isGoalDueForReminderNow(handled, now), false);
  assert.equal(isGoalDueForReminderNow(goal(), now), true);
  assert.equal(isGoalDueForReminderNow(goal({ isArchived: true }), now), false);
});
