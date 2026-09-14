import assert from 'node:assert/strict';
import test from 'node:test';

import { PendingNavigation } from '../src/navigation/pendingNavigation.ts';
import { intentFromNotificationData, NotificationTapRouter } from '../src/notifications/notificationRouting.ts';
import { ALL_OWNED_NOTIFICATION_IDS } from '../src/notifications/notificationGateway.ts';

test('notification data is whitelisted: only a known tab route navigates', () => {
  assert.deepEqual(intentFromNotificationData({ ffRoute: 'goals' }), { screen: 'goals', source: 'notification' });
  for (const bad of [null, undefined, 'goals', 42, {}, { ffRoute: 'admin' }, { ffRoute: '../settings' }, { route: 'goals' }, { ffRoute: ['goals'] }]) {
    assert.equal(intentFromNotificationData(bad), null);
  }
});

test('a tap while locked is deferred and consumed exactly once after unlock', () => {
  const nav = new PendingNavigation();
  const router = new NotificationTapRouter(nav);
  assert.equal(router.handle({ key: 't1', data: { ffRoute: 'goals' } }), true);
  assert.equal(nav.take(false), null, 'locked: nothing is taken');
  assert.deepEqual(nav.pending.get(), { screen: 'goals', source: 'notification' });
  assert.deepEqual(nav.take(true), { screen: 'goals', source: 'notification' });
  assert.equal(nav.take(true), null, 'taken, never peeked: one tap navigates once');
});

test('the same tap delivered twice (cold-start response + listener) routes once', () => {
  const nav = new PendingNavigation();
  const router = new NotificationTapRouter(nav);
  assert.equal(router.handle({ key: 'k', data: { ffRoute: 'goals' } }), true);
  nav.take(true);
  assert.equal(router.handle({ key: 'k', data: { ffRoute: 'goals' } }), false);
  assert.equal(nav.pending.get(), null);
});

test('a pending file-operation return outranks a notification tap, not vice versa', () => {
  const nav = new PendingNavigation();
  nav.offer({ screen: 'settings', source: 'fileOperation' });
  nav.offer({ screen: 'goals', source: 'notification' });
  assert.deepEqual(nav.pending.get(), { screen: 'settings', source: 'fileOperation' });
  nav.take(true);
  nav.offer({ screen: 'goals', source: 'notification' });
  nav.offer({ screen: 'settings', source: 'fileOperation' });
  assert.deepEqual(nav.pending.get(), { screen: 'settings', source: 'fileOperation' });
});

test('owned notification ids are an explicit closed set', () => {
  assert.deepEqual([...ALL_OWNED_NOTIFICATION_IDS], ['ff-foundation-test']);
});
