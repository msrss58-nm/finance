// Stage 3 goal write flows over the raw stored goals.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidGoalsArrayStrict, normalizeGoal } from '../../src/domain/goals.ts';
import { isGoalHandledForPeriod } from '../../src/domain/goalsPlanning.ts';
import {
  addComponent,
  commitConfirmedTransfers,
  createGoal,
  editComponent,
  editGoal,
  GOAL_MESSAGES,
  parseReminderAllocations,
  removeComponent,
  toggleGoalArchived,
} from '../../src/domain/goalWrites.ts';
import { GoalIdGenerator } from '../../src/domain/ids.ts';

const now = new Date(2026, 8, 14, 10, 0);
const ISO = now.toISOString();
const stamp = '2026-09-01T00:00:00.000Z';
const goal = (patch: Record<string, unknown> = {}) => ({
  id: 'g1',
  title: 'חופשה',
  dueDate: '2027-01-01',
  targetAmount: 1000,
  savedAmount: 0,
  components: [],
  isArchived: false,
  createdAt: stamp,
  updatedAt: stamp,
  confirmedTransfers: [],
  ...patch,
});

test('create: the Web goal record; the result passes the strict validator', () => {
  const r = createGoal([], { title: ' חופשה ', targetAmount: '5000', dueDate: '2027-03-01', savedAmount: '' }, new GoalIdGenerator(), now);
  assert.ok(r.ok);
  assert.deepEqual(r.goals[0], {
    id: `goal_${now.getTime()}_1`,
    title: 'חופשה',
    dueDate: '2027-03-01',
    targetAmount: 5000,
    savedAmount: 0,
    components: [],
    isArchived: false,
    createdAt: ISO,
    updatedAt: ISO,
    confirmedTransfers: [],
  });
  assert.notEqual(isValidGoalsArrayStrict(r.goals), null);
});

test('create: every field error is reported at once (Web inline validation)', () => {
  const r = createGoal([], { title: '', targetAmount: '0', dueDate: '2027-02-30', savedAmount: '-1' }, new GoalIdGenerator(), now);
  assert.deepEqual(r, {
    ok: false,
    errors: { title: GOAL_MESSAGES.title, dueDate: GOAL_MESSAGES.dueDate, targetAmount: GOAL_MESSAGES.targetAmount, savedAmount: GOAL_MESSAGES.savedAmount },
    message: null,
  });
});

test('edit: untouched goals stay the same stored objects; unknown goal fields survive', () => {
  const other = goal({ id: 'g2', futureField: { keep: true } });
  const raw = [goal({ futureField: 'x' }), other];
  const r = editGoal(raw, 'g1', { title: 'חופשה גדולה', targetAmount: '1500', dueDate: '2027-02-01', savedAmount: '100' }, now);
  assert.ok(r.ok);
  assert.equal(r.goals[1], other, 'byte-identical raw object');
  assert.deepEqual(r.goals[0], { ...goal({ futureField: 'x' }), title: 'חופשה גדולה', targetAmount: 1500, dueDate: '2027-02-01', savedAmount: 100, updatedAt: ISO });
  assert.notEqual(isValidGoalsArrayStrict(r.goals), null);
});

test('components drive the stored target; removing the last one keeps the last target (never 0)', () => {
  const ids = new GoalIdGenerator();
  const a = addComponent([goal()], 'g1', { name: 'טיסות', amount: '4000', dueDate: '2026-12-01' }, ids, now);
  assert.ok(a.ok);
  const b = addComponent(a.goals, 'g1', { name: 'מלון', amount: '2500.5', dueDate: '' }, ids, now);
  assert.ok(b.ok);
  const g = b.goals[0] as { targetAmount: number; components: { id: string; dueDate: string | null }[] };
  assert.equal(g.targetAmount, 6500.5);
  assert.equal(g.components[1]?.dueDate, null, 'inherits the goal date');
  assert.notEqual(isValidGoalsArrayStrict(b.goals), null);
  const firstId = g.components[0]?.id as string;
  const e = editComponent(b.goals, 'g1', firstId, { name: 'טיסות', amount: '3000', dueDate: '2026-12-01' }, now);
  assert.ok(e.ok);
  assert.equal((e.goals[0] as { targetAmount: number }).targetAmount, 5500.5);
  const r1 = removeComponent(e.goals, 'g1', firstId, now);
  assert.ok(r1.ok);
  const lastId = (r1.goals[0] as { components: { id: string }[] }).components[0]?.id as string;
  const r2 = removeComponent(r1.goals, 'g1', lastId, now);
  assert.ok(r2.ok);
  assert.equal((r2.goals[0] as { targetAmount: number }).targetAmount, 2500.5, 'last known target kept');
  assert.notEqual(isValidGoalsArrayStrict(r2.goals), null);
  assert.deepEqual(addComponent([goal()], 'g1', { name: '', amount: 'x', dueDate: '2026-13-01' }, ids, now), {
    ok: false,
    errors: { name: GOAL_MESSAGES.componentName, amount: GOAL_MESSAGES.componentAmount, dueDate: GOAL_MESSAGES.componentDate },
    message: null,
  });
});

test('edit with components: the target is not editable (only title/date/saved change)', () => {
  const raw = [goal({ targetAmount: 300, components: [{ id: 'c1', name: 'x', amount: 300, dueDate: null }] })];
  const r = editGoal(raw, 'g1', { title: 't', targetAmount: '999', dueDate: '2027-01-01', savedAmount: '' }, now);
  assert.ok(r.ok);
  assert.equal((r.goals[0] as { targetAmount: number }).targetAmount, 300);
});

test('archive toggle, confirmed-transfer ledger and the reminder period', () => {
  const t = toggleGoalArchived([goal()], 'g1', now);
  assert.ok(t.ok);
  assert.equal((t.goals[0] as { isArchived: boolean }).isArchived, true);
  const c = commitConfirmedTransfers([goal()], [{ goalId: 'g1', amount: 250.004 }, { goalId: 'nope', amount: 5 }], new GoalIdGenerator(), now);
  assert.ok(c.ok);
  const g = normalizeGoal(c.goals[0]);
  assert.ok(g, 'the ledger record passes the strict validator');
  assert.deepEqual(g.confirmedTransfers, [
    { date: '2026-09-14', amount: 250, id: `ct_${now.getTime()}_1`, confirmedAt: ISO, reminderPeriod: '2026-09', source: 'goals_reminder' },
  ]);
  assert.equal(isGoalHandledForPeriod(g, '2026-09'), true);
  assert.deepEqual(commitConfirmedTransfers([goal()], [{ goalId: 'g1', amount: 0 }], new GoalIdGenerator(), now), {
    ok: false,
    errors: {},
    message: GOAL_MESSAGES.noPositiveAmount,
  });
});

test('a clock set backwards never produces updatedAt < createdAt (the goal stays valid)', () => {
  const future = '2030-01-01T00:00:00.000Z';
  const r = editGoal([goal({ createdAt: future, updatedAt: future })], 'g1', { title: 'x', targetAmount: '5', dueDate: '2027-01-01', savedAmount: '' }, now);
  assert.ok(r.ok);
  assert.equal((r.goals[0] as { updatedAt: string }).updatedAt, future);
  assert.notEqual(isValidGoalsArrayStrict(r.goals), null);
});

test('reminder custom allocation: >= 0 each, at least one positive (Web messages)', () => {
  assert.deepEqual(parseReminderAllocations([{ goalId: 'a', text: '-5' }]), { ok: false, message: GOAL_MESSAGES.reminderInvalidAmount });
  assert.deepEqual(parseReminderAllocations([{ goalId: 'a', text: '' }]), { ok: false, message: GOAL_MESSAGES.reminderInvalidAmount });
  assert.deepEqual(parseReminderAllocations([{ goalId: 'a', text: '0' }]), { ok: false, message: GOAL_MESSAGES.reminderAllZero });
  assert.deepEqual(parseReminderAllocations([{ goalId: 'a', text: '0' }, { goalId: 'b', text: '10.555' }]), {
    ok: true,
    allocations: [{ goalId: 'b', amount: 10.56 }],
  });
});
