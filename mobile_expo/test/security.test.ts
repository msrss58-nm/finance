import assert from 'node:assert/strict';
import test from 'node:test';

import { FAMILY_FINANCE_PREFIX, DEVICE_LOCAL_KEYS, isFamilyFinanceKey } from '../src/data/storageKeys.ts';
import { AuthController } from '../src/security/authController.ts';
import { allowsSensitiveContent, backoffMs, INITIAL_AUTH_STATE, reduceAuth, type AuthState } from '../src/security/authMachine.ts';
import { shouldLockOnAppState } from '../src/security/lifecycle.ts';
import {
  constantTimeEqual,
  FOUNDATION_LOCK_RECORD,
  FOUNDATION_PLACEHOLDER_CODE,
  foundationPlaceholderVerifier,
} from '../src/security/lockVerifier.ts';
import { privacyModeFor } from '../src/security/privacyPolicy.ts';
import { ALL_SECRET_KEYS, SECRET_KEYS } from '../src/security/secretStore.ts';
import { ControlledVerifier, MemoryMarker, MemorySecretStore, RecordingPrivacy } from './support/fakes.ts';

const LOCKED: AuthState = { kind: 'locked', failures: 0, lastAttemptFailed: false, retryAllowedAt: null };
const ALL_STATES: AuthState[] = [
  INITIAL_AUTH_STATE,
  { kind: 'notConfigured' },
  LOCKED,
  { kind: 'unlocking', failures: 0 },
  { kind: 'unlocked' },
  { kind: 'unavailable', failure: { kind: 'secretRead' } },
];

// ---------- machine ----------

test('allowsSensitiveContent is a whitelist: only notConfigured and unlocked', () => {
  const allowed = ALL_STATES.filter(allowsSensitiveContent).map((s) => s.kind);
  assert.deepEqual(allowed, ['notConfigured', 'unlocked']);
});

test('startup resolves only from initializing', () => {
  assert.deepEqual(reduceAuth(INITIAL_AUTH_STATE, { type: 'configResolved', configured: true }), LOCKED);
  assert.deepEqual(reduceAuth(INITIAL_AUTH_STATE, { type: 'configResolved', configured: false }), { kind: 'notConfigured' });
  const unlocked: AuthState = { kind: 'unlocked' };
  assert.equal(reduceAuth(unlocked, { type: 'configResolved', configured: false }), unlocked);
});

test('backgrounding locks unlocked/unlocking and nothing else', () => {
  for (const s of ALL_STATES) {
    const next = reduceAuth(s, { type: 'backgrounded' });
    if (s.kind === 'unlocked' || s.kind === 'unlocking') assert.deepEqual(next, LOCKED);
    else assert.equal(next, s);
  }
});

test('a verification result that arrives after the app locked is ignored', () => {
  const unlocking = reduceAuth(LOCKED, { type: 'unlockStarted' });
  const relocked = reduceAuth(unlocking, { type: 'backgrounded' });
  assert.deepEqual(relocked, LOCKED);
  assert.equal(reduceAuth(relocked, { type: 'unlockResolved', matched: true, now: 0 }), relocked);
});

test('wrong codes count up and back off from the third failure', () => {
  let s: AuthState = LOCKED;
  for (let i = 1; i <= 3; i++) {
    s = reduceAuth(reduceAuth(s, { type: 'unlockStarted' }), { type: 'unlockResolved', matched: false, now: 1000 });
  }
  assert.deepEqual(s, { kind: 'locked', failures: 3, lastAttemptFailed: true, retryAllowedAt: 1000 + 5000 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(backoffMs), [0, 0, 0, 5000, 10000, 20000, 30000, 30000]);
});

test('failure is terminal: unavailable is never left for an open state', () => {
  const unavailable = reduceAuth(LOCKED, { type: 'failed', failure: { kind: 'secretRead' } });
  assert.equal(unavailable.kind, 'unavailable');
  for (const e of [
    { type: 'configResolved', configured: false },
    { type: 'lockConfigured' },
    { type: 'lockRemoved' },
    { type: 'backgrounded' },
    { type: 'unlockResolved', matched: true, now: 0 },
  ] as const) {
    assert.equal(reduceAuth(unavailable, e), unavailable);
  }
});

test('privacy: protected whenever a lock is (or may be) configured; open only when none', () => {
  assert.deepEqual(
    ALL_STATES.map((s) => privacyModeFor(s)),
    [null, 'open', 'protected', 'protected', 'protected', 'protected'],
  );
});

test('lifecycle: lock on background only (not on iOS inactive)', () => {
  assert.deepEqual(['active', 'background', 'inactive', 'unknown', 'extension'].map(shouldLockOnAppState), [false, true, false, false, false]);
});

// ---------- controller ----------

function setup(opts: { lock?: boolean; marker?: boolean } = {}) {
  const secrets = new MemorySecretStore();
  const marker = new MemoryMarker();
  const privacy = new RecordingPrivacy();
  let clock = 1_000_000;
  if (opts.lock) secrets.values.set(SECRET_KEYS.foundationLock, FOUNDATION_LOCK_RECORD);
  if (opts.marker ?? opts.lock) marker.configured = true;
  const make = (verifier = foundationPlaceholderVerifier) =>
    new AuthController({ secrets, marker, verifier, privacy, now: () => clock });
  return { secrets, marker, privacy, make, advance: (ms: number) => (clock += ms) };
}

test('startup without a lock: notConfigured, privacy open', async () => {
  const { make, privacy } = setup();
  const auth = make();
  assert.equal(auth.state.get().kind, 'initializing');
  await auth.initialize();
  assert.equal(auth.state.get().kind, 'notConfigured');
  assert.deepEqual(privacy.applied, ['open']);
});

test('startup with a lock: locked, privacy protected; correct code unlocks, wrong code does not', async () => {
  const { make, privacy } = setup({ lock: true });
  const auth = make();
  await auth.initialize();
  assert.equal(auth.state.get().kind, 'locked');
  assert.deepEqual(privacy.applied, ['protected']);
  assert.equal(await auth.submit('0000'), false);
  assert.deepEqual(auth.state.get(), { kind: 'locked', failures: 1, lastAttemptFailed: true, retryAllowedAt: null });
  assert.equal(await auth.submit(FOUNDATION_PLACEHOLDER_CODE), true);
  assert.equal(auth.state.get().kind, 'unlocked');
});

test('secure-storage read failure fails CLOSED (unavailable), never notConfigured', async () => {
  const { make, secrets, privacy } = setup();
  secrets.failRead = { kind: 'read', causeType: 'Error' };
  const auth = make();
  await auth.initialize();
  assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'secretRead', causeType: 'Error' } });
  assert.equal(allowsSensitiveContent(auth.state.get()), false);
  assert.deepEqual(privacy.applied, ['protected']);
});

test('secure storage unavailable fails closed', async () => {
  const { make, secrets } = setup();
  secrets.failRead = { kind: 'unavailable' };
  const auth = make();
  await auth.initialize();
  assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'secretStoreUnavailable' } });
});

test('marker present but secret gone (Android Keystore invalidation) fails closed: secretMissing', async () => {
  const { make } = setup({ marker: true });
  const auth = make();
  await auth.initialize();
  assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'secretMissing' } });
});

test('marker read failure fails closed', async () => {
  const { make, marker } = setup();
  marker.failRead = { kind: 'markerRead' };
  const auth = make();
  await auth.initialize();
  assert.equal(auth.state.get().kind, 'unavailable');
});

test('an incomplete ff_pin_v1 record is unusable: fail closed (never "no PIN")', async () => {
  const { make, secrets } = setup();
  secrets.values.set(SECRET_KEYS.pinRecord, '{"v":1,"kdf":"pbkdf2-hmac-sha256"}');
  const auth = make();
  await auth.initialize();
  assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'unsupportedRecord' } });
});

test('a malformed lock record never unlocks', async () => {
  const { make, secrets } = setup({ lock: true });
  secrets.values.set(SECRET_KEYS.foundationLock, '{"v":0,"kind":"something-else"}');
  const auth = make();
  await auth.initialize();
  assert.equal(await auth.submit(FOUNDATION_PLACEHOLDER_CODE), false);
  assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'unsupportedRecord' } });
});

test('backgrounding during a slow verification: the late "correct" result does NOT unlock', async () => {
  const { make } = setup({ lock: true });
  const verifier = new ControlledVerifier();
  const auth = make(verifier);
  await auth.initialize();
  const submitted = auth.submit(FOUNDATION_PLACEHOLDER_CODE);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(auth.state.get().kind, 'unlocking');
  auth.handleAppState('background');
  assert.equal(auth.state.get().kind, 'locked');
  verifier.pending?.resolve({ ok: true, value: true });
  assert.equal(await submitted, false);
  assert.equal(auth.state.get().kind, 'locked');
});

test('a second submit while one is in flight is refused (no double failure count)', async () => {
  const { make } = setup({ lock: true });
  const verifier = new ControlledVerifier();
  const auth = make(verifier);
  await auth.initialize();
  const first = auth.submit('1111');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await auth.submit('2222'), false);
  assert.equal(verifier.calls, 1);
  verifier.pending?.resolve({ ok: true, value: false });
  await first;
  assert.equal(auth.state.get().kind === 'locked' && auth.state.get(), auth.state.get());
});

test('backoff: attempts during the wait are refused without verifying', async () => {
  const { make, advance } = setup({ lock: true });
  const auth = make();
  await auth.initialize();
  for (let i = 0; i < 3; i++) await auth.submit('0000');
  const s = auth.state.get();
  assert.ok(s.kind === 'locked' && s.retryAllowedAt !== null);
  assert.equal(await auth.submit(FOUNDATION_PLACEHOLDER_CODE), false);
  assert.equal(auth.state.get(), s, 'refused attempt changes nothing');
  advance(5000);
  assert.equal(await auth.submit(FOUNDATION_PLACEHOLDER_CODE), true);
});

test('iOS inactive does not lock; background does', async () => {
  const { make } = setup({ lock: true });
  const auth = make();
  await auth.initialize();
  await auth.submit(FOUNDATION_PLACEHOLDER_CODE);
  auth.handleAppState('inactive');
  assert.equal(auth.state.get().kind, 'unlocked');
  auth.handleAppState('background');
  assert.equal(auth.state.get().kind, 'locked');
});

test('configure: secret then marker; stays unlocked; privacy switches to protected', async () => {
  const { make, secrets, marker, privacy } = setup();
  const auth = make();
  await auth.initialize();
  const r = await auth.configureFoundationLock();
  assert.ok(r.ok);
  assert.equal(auth.state.get().kind, 'unlocked');
  assert.equal(secrets.values.get(SECRET_KEYS.foundationLock), FOUNDATION_LOCK_RECORD);
  assert.equal(marker.configured, true);
  assert.deepEqual([...secrets.log.filter((l) => l.startsWith('write')), ...marker.log.filter((l) => l.startsWith('marker:write'))], [
    'write:ff_foundation_lock_v0',
    'marker:write:true',
  ]);
  assert.deepEqual(privacy.applied, ['open', 'protected']);
});

test('configure: a failed marker write rolls the secret back; state unchanged', async () => {
  const { make, secrets, marker } = setup();
  const auth = make();
  await auth.initialize();
  marker.failWrite = { kind: 'markerWrite' };
  const r = await auth.configureFoundationLock();
  assert.equal(r.ok, false);
  assert.equal(secrets.values.has(SECRET_KEYS.foundationLock), false);
  assert.equal(auth.state.get().kind, 'notConfigured');
});

test('remove: a failed secret delete restores the marker, reports failure, stays locked-configured', async () => {
  const { make, secrets, marker } = setup({ lock: true });
  const auth = make();
  await auth.initialize();
  await auth.submit(FOUNDATION_PLACEHOLDER_CODE);
  secrets.failDelete = { kind: 'delete' };
  const r = await auth.removeLock();
  assert.equal(r.ok, false);
  assert.equal(marker.configured, true);
  assert.equal(secrets.values.has(SECRET_KEYS.foundationLock), true);
  assert.equal(auth.state.get().kind, 'unlocked');
  // A fresh start still sees the lock.
  const again = make();
  await again.initialize();
  assert.equal(again.state.get().kind, 'locked');
});

test('remove succeeds: notConfigured, privacy open, next start is open', async () => {
  const { make, privacy } = setup({ lock: true });
  const auth = make();
  await auth.initialize();
  await auth.submit(FOUNDATION_PLACEHOLDER_CODE);
  assert.ok((await auth.removeLock()).ok);
  assert.equal(auth.state.get().kind, 'notConfigured');
  assert.equal(privacy.applied.at(-1), 'open');
  const again = make();
  await again.initialize();
  assert.equal(again.state.get().kind, 'notConfigured');
});

test('a privacy apply failure never blocks locking, and is surfaced', async () => {
  const { make, privacy } = setup({ lock: true });
  privacy.fail = true;
  const auth = make();
  await auth.initialize();
  assert.equal(auth.state.get().kind, 'locked');
  assert.deepEqual(auth.privacyStatus.get(), { mode: 'protected', lastApplyFailed: true });
});

// ---------- key isolation ----------

test('secrets can never enter a backup sweep: no secret key uses the family_finance_ prefix', () => {
  assert.ok(ALL_SECRET_KEYS.length >= 2);
  for (const k of ALL_SECRET_KEYS) assert.equal(isFamilyFinanceKey(k), false, k);
  for (const k of Object.values(DEVICE_LOCAL_KEYS)) assert.equal(k.startsWith(FAMILY_FINANCE_PREFIX), false, k);
});

test('constant-time comparison is exact', () => {
  assert.equal(constantTimeEqual('2468', '2468'), true);
  assert.equal(constantTimeEqual('2468', '2469'), false);
  assert.equal(constantTimeEqual('2468', '24680'), false);
  assert.equal(constantTimeEqual('', ''), true);
});
