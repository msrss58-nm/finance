// The in-app monthly Goals reminder dialog (session state + ledger writes).
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGoal } from '../../src/domain/goals.ts';
import { GOAL_MESSAGES } from '../../src/domain/goalWrites.ts';
import { buildReminderCustom, buildReminderSummary } from '../../src/presentation/reminderView.ts';
import { formatAmount } from '../../src/presentation/format.ts';
import { GoalsReminderSession } from '../../src/state/goalsReminderSession.ts';
import { financeHarness, goalRecord } from '../support/financeHarness.ts';

async function setup() {
  const h = await financeHarness({ family_finance_goals: JSON.stringify([goalRecord()]) });
  await h.finance.load();
  const session = new GoalsReminderSession(h.finance, () => h.clock.now);
  return { h, session };
}

test('opens once at startup with the domain amount; postpone writes nothing and suppresses for the session', async () => {
  const { h, session } = await setup();
  session.checkAtStartup();
  const s = session.state.get();
  assert.ok(s.open);
  assert.equal(s.due.length, 1);
  assert.equal(s.due[0]?.info.suggestedTotal, 250, '1000 over 4 eligible 2nds (today, Oct, Nov, Dec)');
  assert.equal(buildReminderSummary(s.due).totalText, formatAmount(250));
  session.postpone();
  assert.equal(session.state.get().open, false);
  session.check();
  session.checkAtStartup();
  assert.equal(session.state.get().open, false, 'never reopens during the session');
  assert.equal((normalizeGoal((JSON.parse((await h.kv.get('family_finance_goals')) as string) as unknown[])[0])?.confirmedTransfers.length), 0);
});

test('"העברתי את הסכום המומלץ" records exactly the suggested amount and closes', async () => {
  const { h, session } = await setup();
  session.checkAtStartup();
  await session.confirmFull();
  assert.equal(session.state.get().open, false);
  const g = normalizeGoal((JSON.parse((await h.kv.get('family_finance_goals')) as string) as unknown[])[0]);
  assert.ok(g);
  assert.deepEqual(
    g.confirmedTransfers.map((t) => [t.amount, t.date, (t as { reminderPeriod?: string }).reminderPeriod]),
    [[250, '2026-09-14', '2026-09']],
  );
  session.check();
  assert.equal(session.state.get().open, false, 'handled for the period');
});

test('custom amounts: validated per goal; 0 everywhere is refused; a positive amount is recorded', async () => {
  const { h, session } = await setup();
  session.checkAtStartup();
  session.switchToCustom();
  const s1 = session.state.get();
  assert.ok(s1.open && s1.mode === 'custom');
  assert.deepEqual(s1.custom, { g1: '250' });
  session.setCustomAmount('g1', '-5');
  await session.confirmCustom();
  const s2 = session.state.get();
  assert.ok(s2.open);
  assert.equal(s2.error, GOAL_MESSAGES.reminderInvalidAmount);
  session.setCustomAmount('g1', '0');
  await session.confirmCustom();
  const s3 = session.state.get();
  assert.ok(s3.open);
  assert.equal(s3.error, GOAL_MESSAGES.reminderAllZero);
  const view = buildReminderCustom(s3.due, { g1: '900' });
  assert.equal(view.rows[0]?.overRemaining, false);
  assert.equal(buildReminderCustom(s3.due, { g1: '2000' }).rows[0]?.overRemaining, true, 'warning only');
  session.setCustomAmount('g1', '100');
  await session.confirmCustom();
  assert.equal(session.state.get().open, false);
  const g = normalizeGoal((JSON.parse((await h.kv.get('family_finance_goals')) as string) as unknown[])[0]);
  assert.deepEqual(g?.confirmedTransfers.map((t) => t.amount), [100]);
});

test('a failed write keeps the dialog open with the reason (nothing half-written)', async () => {
  const { h, session } = await setup();
  session.checkAtStartup();
  await h.kv.set('family_finance_goals', 'corrupt');
  await session.confirmFull();
  const s = session.state.get();
  assert.ok(s.open);
  assert.equal(s.writing, false);
  assert.equal(s.error, GOAL_MESSAGES.invalid);
  assert.equal(await h.kv.get('family_finance_goals'), 'corrupt');
});

test('a newly created goal can open the reminder in the same session (app.js saveNewGoal)', async () => {
  const h = await financeHarness();
  await h.finance.load();
  const session = new GoalsReminderSession(h.finance, () => h.clock.now);
  session.checkAtStartup();
  assert.equal(session.state.get().open, false, 'nothing due yet');
  assert.ok((await h.finance.createGoal({ title: 'רכב', targetAmount: '400', dueDate: '2026-12-15', savedAmount: '' })).ok);
  session.check();
  assert.equal(session.state.get().open, true);
});
