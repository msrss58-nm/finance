// The monthly Goals reminder as a local OS notification: opt-in, generic, one owned id.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { err, ok } from '../../src/core/result.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { loadGoalsState, type GoalsState } from '../../src/domain/goals.ts';
import { nextGoalsReminderDateTime } from '../../src/notifications/goalsReminderSchedule.ts';
import { GoalsReminderScheduler, parseReminderPrefs } from '../../src/notifications/goalsReminderScheduler.ts';
import type {
  LocalNotificationRequest,
  NotificationGateway,
  NotificationPermission,
  NotificationTap,
  OwnedNotificationId,
} from '../../src/notifications/notificationGateway.ts';
import { goalRecord } from '../support/financeHarness.ts';
import { createNodeSqliteDriver } from '../support/nodeSqliteDriver.ts';

class FakeGateway implements NotificationGateway {
  permission: NotificationPermission = 'undetermined';
  answer: NotificationPermission = 'granted';
  requested = 0;
  failSchedule = false;
  readonly scheduled: LocalNotificationRequest[] = [];
  readonly cancelled: OwnedNotificationId[] = [];
  async initialize() {
    return ok(undefined);
  }
  async permissionStatus() {
    return ok(this.permission);
  }
  async requestPermission() {
    this.requested++;
    this.permission = this.answer;
    return ok(this.permission);
  }
  async schedule(r: LocalNotificationRequest) {
    if (this.failSchedule) return err({ kind: 'schedule' as const });
    this.scheduled.push(r);
    return ok(undefined);
  }
  async cancel(id: OwnedNotificationId) {
    this.cancelled.push(id);
    return ok(undefined);
  }
  async pendingOwnedIds() {
    return ok([] as OwnedNotificationId[]);
  }
  async launchTap(): Promise<NotificationTap | null> {
    return null;
  }
  onTap() {
    return () => undefined;
  }
}

const NOW = new Date(2026, 8, 14, 10, 0);

async function setup(goals: GoalsState | null = loadGoalsState(JSON.stringify([goalRecord()]))) {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  const gateway = new FakeGateway();
  const holder = { goals };
  const scheduler = new GoalsReminderScheduler({ gateway, kv, goalsState: () => holder.goals, clock: () => NOW });
  return { kv, gateway, scheduler, holder };
}

test('the reminder instant: the next 2nd at 09:00 strictly after now (month/year rollover)', () => {
  assert.deepEqual(nextGoalsReminderDateTime(NOW), new Date(2026, 9, 2, 9, 0));
  assert.deepEqual(nextGoalsReminderDateTime(new Date(2026, 8, 2, 8, 59)), new Date(2026, 8, 2, 9, 0));
  assert.deepEqual(nextGoalsReminderDateTime(new Date(2026, 8, 2, 9, 0)), new Date(2026, 9, 2, 9, 0));
  assert.deepEqual(nextGoalsReminderDateTime(new Date(2026, 11, 20)), new Date(2027, 0, 2, 9, 0));
});

test('off by default: nothing scheduled, no permission prompt, our own id cancelled', async () => {
  const { gateway, scheduler } = await setup();
  assert.equal(await scheduler.reconcile(), 'disabled');
  assert.equal(gateway.requested, 0);
  assert.deepEqual(gateway.scheduled, []);
  assert.deepEqual(gateway.cancelled, ['ff-goals-reminder']);
});

test('enable: asks once, schedules one generic local notification that routes to Goals', async () => {
  const { kv, gateway, scheduler } = await setup();
  assert.equal(await scheduler.enable(), 'scheduled');
  assert.equal(gateway.requested, 1);
  const r = gateway.scheduled[0];
  assert.ok(r);
  assert.equal(r.id, 'ff-goals-reminder');
  assert.deepEqual(r.at, new Date(2026, 9, 2, 9, 0));
  assert.deepEqual(r.payload, { ffRoute: 'goals' });
  assert.doesNotMatch(r.title + r.body, /\d|₪|חופשה/, 'no amount, no count, no goal name on the lock screen');
  assert.deepEqual(scheduler.status.get().scheduledFor, new Date(2026, 9, 2, 9, 0));
  assert.equal(await kv.get('ff_goals_reminder_v1'), '{"enabled":true,"permissionRequested":true}');
  assert.deepEqual(await kv.entriesWithPrefix('family_finance_'), [], 'never part of a backup');
  await scheduler.enable();
  assert.equal(gateway.requested, 1, 'the OS prompt is never re-requested');
});

test('nothing due, invalid goals, denied permission and disable all cancel; a failure is never reported as scheduled', async () => {
  const done = await setup(loadGoalsState(JSON.stringify([goalRecord({ savedAmount: 1000 })])));
  assert.equal(await done.scheduler.enable(), 'nothingToRemind');
  assert.deepEqual(done.gateway.scheduled, []);
  const bad = await setup(loadGoalsState('corrupt'));
  assert.equal(await bad.scheduler.enable(), 'goalsDataInvalid');
  const denied = await setup();
  denied.gateway.answer = 'denied';
  assert.equal(await denied.scheduler.enable(), 'permissionMissing');
  assert.deepEqual(denied.gateway.scheduled, []);
  const off = await setup();
  await off.scheduler.enable();
  assert.equal(await off.scheduler.disable(), 'disabled');
  assert.equal(off.gateway.cancelled.at(-1), 'ff-goals-reminder');
  const failing = await setup();
  failing.gateway.failSchedule = true;
  assert.equal(await failing.scheduler.enable(), 'failed');
  assert.equal(failing.scheduler.status.get().scheduledFor, null);
});

test('data not loaded yet: the OS schedule is left untouched; concurrent reconciles share one run', async () => {
  const { gateway, scheduler, holder } = await setup(null);
  await scheduler.enable();
  assert.deepEqual(gateway.scheduled, []);
  holder.goals = loadGoalsState(JSON.stringify([goalRecord()]));
  const a = scheduler.reconcile();
  const b = scheduler.reconcile();
  assert.equal(a, b);
  assert.equal(await a, 'scheduled');
  assert.equal(gateway.scheduled.length, 1);
});

test('a corrupt preference means off', () => {
  assert.deepEqual(parseReminderPrefs('x'), { enabled: false, permissionRequested: false });
  assert.deepEqual(parseReminderPrefs('[true]'), { enabled: false, permissionRequested: false });
  assert.deepEqual(parseReminderPrefs('{"enabled":"yes"}'), { enabled: false, permissionRequested: false });
});
