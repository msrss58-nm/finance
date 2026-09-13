import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_LOCK_STATE,
  allowsSensitiveContent,
  reduceLock,
  type LockState,
} from './lockMachine.ts';

test('initializing never allows sensitive content', () => {
  assert.equal(allowsSensitiveContent(INITIAL_LOCK_STATE), false);
});

test('configured PIN starts locked; none starts open', () => {
  assert.deepEqual(reduceLock(INITIAL_LOCK_STATE, { type: 'configLoaded', configured: true }), { kind: 'locked', failures: 0 });
  assert.deepEqual(reduceLock(INITIAL_LOCK_STATE, { type: 'configLoaded', configured: false }), { kind: 'notConfigured' });
});

test('storage error is unavailable, never open', () => {
  const s = reduceLock(INITIAL_LOCK_STATE, { type: 'configError', reason: 'read failed' });
  assert.equal(s.kind, 'unavailable');
  assert.equal(allowsSensitiveContent(s), false);
  // backgrounding/unlock cannot downgrade unavailable into an open state
  assert.equal(reduceLock(s, { type: 'unlockSucceeded' }).kind, 'unavailable');
  assert.equal(reduceLock(s, { type: 'pinRemoved' }).kind, 'unavailable');
});

test('background locks an unlocked session; inactive does not', () => {
  const open: LockState = { kind: 'unlocked' };
  assert.deepEqual(reduceLock(open, { type: 'appState', state: 'background' }), { kind: 'locked', failures: 0 });
  assert.deepEqual(reduceLock(open, { type: 'appState', state: 'inactive' }), open);
  assert.deepEqual(reduceLock(open, { type: 'appState', state: 'active' }), open);
});

test('no PIN: background keeps app open (nothing to lock)', () => {
  const s: LockState = { kind: 'notConfigured' };
  assert.deepEqual(reduceLock(s, { type: 'appState', state: 'background' }), s);
});

test('failed unlock counts, success opens', () => {
  const locked: LockState = { kind: 'locked', failures: 0 };
  const f1 = reduceLock(locked, { type: 'unlockFailed' });
  assert.deepEqual(f1, { kind: 'locked', failures: 1 });
  assert.equal(allowsSensitiveContent(f1), false);
  assert.deepEqual(reduceLock(f1, { type: 'unlockSucceeded' }), { kind: 'unlocked' });
});
