// Final PIN / KDF: the ff_pin_v1 record contract, PIN set / verify / change /
// remove through AuthController, the fail-closed paths and backup isolation.
// The KDF here is the test-only Node oracle (test/support/nodePinKdf.ts); the
// shipped app uses only the native module (modules/ff-pin-kdf).
process.env.TZ = 'Asia/Jerusalem';

import { Buffer } from 'node:buffer';
import { pbkdf2Sync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBackupEnvelope, serializeBackup } from '../../src/domain/backup.ts';
import { AuthController } from '../../src/security/authController.ts';
import { allowsSensitiveContent } from '../../src/security/authMachine.ts';
import { foundationPlaceholderVerifier } from '../../src/security/lockVerifier.ts';
import { KDF_KNOWN_ANSWER } from '../../src/security/pinKdfSelfTest.ts';
import { base64ByteLength, decodePinRecord, encodePinRecord, isValidPinFormat, PIN_KDF_ITERATIONS } from '../../src/security/pinRecord.ts';
import { SECRET_KEYS } from '../../src/security/secretStore.ts';
import { financeHarness } from '../support/financeHarness.ts';
import { MemoryMarker, MemorySecretStore, RecordingPrivacy } from '../support/fakes.ts';
import { NodePinKdf } from '../support/nodePinKdf.ts';

const PIN = '2580';
const ROOT = new URL('../../', import.meta.url);

function env(kdf: NodePinKdf | null = new NodePinKdf()) {
  const secrets = new MemorySecretStore();
  const marker = new MemoryMarker();
  const privacy = new RecordingPrivacy();
  const clock = { now: 1_000_000 };
  const make = () => new AuthController({ secrets, marker, verifier: foundationPlaceholderVerifier, kdf: kdf ?? undefined, privacy, now: () => clock.now });
  return { secrets, marker, privacy, kdf, make, clock };
}

async function withPin(pin = PIN) {
  const e = env();
  const auth = e.make();
  await auth.initialize();
  const r = await auth.setPin(pin, pin);
  assert.ok(r.ok, 'setPin');
  return { ...e, auth };
}

const storedRecord = (secrets: MemorySecretStore) => secrets.values.get(SECRET_KEYS.pinRecord);

function parsedRecord(secrets: MemorySecretStore): Record<string, unknown> {
  const raw = storedRecord(secrets);
  assert.ok(raw !== undefined, 'record present');
  return JSON.parse(raw) as Record<string, unknown>;
}

test('PIN format is the Web rule: 4–6 ASCII digits only', () => {
  for (const ok of ['1234', '12345', '123456']) assert.equal(isValidPinFormat(ok), true, ok);
  for (const bad of ['', '123', '1234567', '12a4', ' 1234', '1234 ', '١٢٣٤', '12.4']) assert.equal(isValidPinFormat(bad), false, JSON.stringify(bad));
});

test('setting a PIN writes ONE ff_pin_v1 record of the exact contract (16-byte salt, 32-byte verifier, 100,000 iterations)', async () => {
  const { secrets, marker, privacy, auth } = await withPin();
  const r = parsedRecord(secrets);
  assert.deepEqual(Object.keys(r), ['v', 'kdf', 'iterations', 'saltB64', 'verifierB64']);
  assert.equal(r.v, 1);
  assert.equal(r.kdf, 'pbkdf2-hmac-sha256');
  assert.equal(r.iterations, 100_000);
  assert.equal(PIN_KDF_ITERATIONS, 100_000);
  assert.equal(base64ByteLength(r.saltB64 as string), 16);
  assert.equal(base64ByteLength(r.verifierB64 as string), 32);
  const expected = pbkdf2Sync(PIN, Buffer.from(r.saltB64 as string, 'base64'), 100_000, 32, 'sha256').toString('base64');
  assert.equal(r.verifierB64, expected, 'verifier = PBKDF2-HMAC-SHA256(pin, salt)');
  assert.doesNotMatch(storedRecord(secrets) ?? '', /"pin"|2580/, 'no plaintext PIN in the record');
  assert.deepEqual([...secrets.values.keys()], [SECRET_KEYS.pinRecord]);
  assert.equal(marker.configured, true);
  assert.equal(auth.state.get().kind, 'unlocked');
  assert.equal(auth.lockSource.get(), 'pin');
  assert.equal(privacy.applied.at(-1), 'protected');
});

test('the salt is fresh for every set and every change', async () => {
  const a = await withPin();
  const b = await withPin();
  assert.notEqual(parsedRecord(a.secrets).saltB64, parsedRecord(b.secrets).saltB64);
  assert.notEqual(parsedRecord(a.secrets).verifierB64, parsedRecord(b.secrets).verifierB64);
  const before = parsedRecord(a.secrets).saltB64;
  assert.ok((await a.auth.changePin(PIN, PIN, PIN)).ok);
  assert.notEqual(parsedRecord(a.secrets).saltB64, before);
});

test('relaunch locks; a wrong PIN is rejected, the correct PIN unlocks', async () => {
  const { make } = await withPin();
  const relaunched = make();
  await relaunched.initialize();
  assert.equal(relaunched.state.get().kind, 'locked');
  assert.equal(allowsSensitiveContent(relaunched.state.get()), false);
  assert.equal(await relaunched.submit('1111'), false);
  assert.deepEqual(relaunched.state.get(), { kind: 'locked', failures: 1, lastAttemptFailed: true, retryAllowedAt: null });
  assert.equal(await relaunched.submit(PIN), true);
  assert.equal(relaunched.state.get().kind, 'unlocked');
});

test('backgrounding an unlocked PIN session locks it', async () => {
  const { auth } = await withPin();
  auth.handleAppState('background');
  assert.equal(auth.state.get().kind, 'locked');
  assert.equal(allowsSensitiveContent(auth.state.get()), false);
});

test('a malformed or weaker ff_pin_v1 record fails CLOSED (unsupportedRecord), never "no PIN"', async () => {
  const good = JSON.parse(encodePinRecord('AAECAwQFBgcICQoLDA0ODw==', KDF_KNOWN_ANSWER.verifierB64)) as Record<string, unknown>;
  const variant = (patch: Record<string, unknown>) => JSON.stringify({ ...good, ...patch });
  const bad = [
    'not json',
    '[]',
    '{}',
    'null',
    variant({ v: 2 }),
    variant({ kdf: 'pbkdf2-hmac-sha1' }),
    variant({ iterations: 99_999 }),
    variant({ iterations: '100000' }),
    variant({ iterations: 100_000.5 }),
    variant({ saltB64: Buffer.from('000102030405060708090a0b0c0d0e', 'base64').toString('base64').slice(0, 20) }),
    variant({ saltB64: 'AAECAwQFBgcICQoLDA0O' }),
    variant({ verifierB64: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg==' }),
    variant({ verifierB64: '!!!!' }),
    variant({ saltB64: undefined }),
  ];
  assert.ok(decodePinRecord(JSON.stringify(good)).ok, 'the unmodified record is valid');
  for (const raw of bad) {
    assert.deepEqual(decodePinRecord(raw), { ok: false, error: { kind: 'unsupportedRecord' } }, raw);
    const e = env();
    e.secrets.values.set(SECRET_KEYS.pinRecord, raw);
    const auth = e.make();
    await auth.initialize();
    assert.deepEqual(auth.state.get(), { kind: 'unavailable', failure: { kind: 'unsupportedRecord' } }, raw);
    assert.equal(allowsSensitiveContent(auth.state.get()), false);
  }
});

test('record gone while the marker says a lock exists: fail closed (secretMissing)', async () => {
  const { secrets, make } = await withPin();
  secrets.values.delete(SECRET_KEYS.pinRecord);
  const relaunched = make();
  await relaunched.initialize();
  assert.deepEqual(relaunched.state.get(), { kind: 'unavailable', failure: { kind: 'secretMissing' } });
});

test('no native KDF in the build: a PIN cannot be set, and a stored PIN never unlocks', async () => {
  const none = env(null);
  const auth = none.make();
  await auth.initialize();
  assert.deepEqual(await auth.setPin(PIN, PIN), { ok: false, error: { kind: 'kdfUnavailable' } });
  assert.equal(none.secrets.values.size, 0);
  assert.equal(none.marker.configured, false);
  assert.equal(auth.state.get().kind, 'notConfigured');

  const { secrets, marker } = await withPin();
  const noKdf = new AuthController({ secrets, marker, verifier: foundationPlaceholderVerifier, privacy: new RecordingPrivacy(), now: () => 0 });
  await noKdf.initialize();
  assert.equal(noKdf.state.get().kind, 'locked');
  assert.equal(await noKdf.submit(PIN), false);
  assert.deepEqual(noKdf.state.get(), { kind: 'unavailable', failure: { kind: 'kdfUnavailable' } });
  assert.equal(allowsSensitiveContent(noKdf.state.get()), false);
});

test('a KDF failure during unlock fails closed', async () => {
  const { kdf, make } = await withPin();
  const relaunched = make();
  await relaunched.initialize();
  assert.ok(kdf);
  kdf.failWith = 'kdfFailed';
  assert.equal(await relaunched.submit(PIN), false);
  assert.deepEqual(relaunched.state.get(), { kind: 'unavailable', failure: { kind: 'kdfFailed' } });
});

test('set PIN: validates before any derivation and refuses to overwrite a configured PIN', async () => {
  const e = env();
  const auth = e.make();
  await auth.initialize();
  assert.deepEqual(await auth.setPin('123', '123'), { ok: false, error: { kind: 'invalidPinFormat' } });
  assert.deepEqual(await auth.setPin('1234', '1235'), { ok: false, error: { kind: 'pinMismatch' } });
  assert.equal(e.kdf?.calls.derive, 0);
  assert.equal(e.secrets.values.size, 0);
  assert.ok((await auth.setPin(PIN, PIN)).ok);
  const record = storedRecord(e.secrets);
  assert.deepEqual(await auth.setPin('9999', '9999'), { ok: false, error: { kind: 'alreadyConfigured' } });
  assert.equal(storedRecord(e.secrets), record);
});

test('change PIN: the current PIN is required; the new record replaces the old in one write', async () => {
  const { secrets, marker, auth, make } = await withPin();
  const before = storedRecord(secrets);
  assert.deepEqual(await auth.changePin('0000', '4321', '4321'), { ok: false, error: { kind: 'wrongCurrentPin' } });
  assert.deepEqual(await auth.changePin(PIN, '43', '43'), { ok: false, error: { kind: 'invalidPinFormat' } });
  assert.deepEqual(await auth.changePin(PIN, '4321', '4320'), { ok: false, error: { kind: 'pinMismatch' } });
  assert.equal(storedRecord(secrets), before);
  secrets.log.length = 0;
  assert.ok((await auth.changePin(PIN, '4321', '4321')).ok);
  assert.deepEqual(secrets.log.filter((l) => l.startsWith('write')), [`write:${SECRET_KEYS.pinRecord}`]);
  assert.notEqual(storedRecord(secrets), before);
  assert.equal(marker.configured, true);
  const relaunched = make();
  await relaunched.initialize();
  assert.equal(await relaunched.submit(PIN), false);
  assert.equal(await relaunched.submit('4321'), true);
});

test('remove PIN: the current PIN is required; afterwards there is no lock, also after relaunch', async () => {
  const { secrets, marker, privacy, auth, make } = await withPin();
  assert.deepEqual(await auth.removePin('0000'), { ok: false, error: { kind: 'wrongCurrentPin' } });
  assert.ok(storedRecord(secrets) !== undefined);
  assert.equal(auth.state.get().kind, 'unlocked');
  assert.ok((await auth.removePin(PIN)).ok);
  assert.equal(storedRecord(secrets), undefined);
  assert.equal(marker.configured, false);
  assert.equal(auth.state.get().kind, 'notConfigured');
  assert.equal(auth.lockSource.get(), null);
  assert.equal(privacy.applied.at(-1), 'open');
  const relaunched = make();
  await relaunched.initialize();
  assert.equal(relaunched.state.get().kind, 'notConfigured');
});

test('a failed marker write rolls the new PIN record back', async () => {
  const e = env();
  const auth = e.make();
  await auth.initialize();
  e.marker.failWrite = { kind: 'markerWrite' };
  assert.deepEqual(await auth.setPin(PIN, PIN), { ok: false, error: { kind: 'markerWrite' } });
  assert.equal(storedRecord(e.secrets), undefined);
  assert.equal(auth.state.get().kind, 'notConfigured');
});

test('the development foundation-lock removal can never remove a real PIN', async () => {
  const { secrets, auth } = await withPin();
  assert.equal((await auth.removeLock()).ok, false);
  assert.ok(storedRecord(secrets) !== undefined);
  assert.equal(auth.lockSource.get(), 'pin');
});

test('backups never contain the PIN record, its salt or verifier — even if one sat in the key-value store', async () => {
  const { secrets } = await withPin();
  const record = storedRecord(secrets) ?? '';
  const r = parsedRecord(secrets);
  const h = await financeHarness({ family_finance_data: '[]' });
  await h.kv.set('ff_pin_v1', record);
  const entries = await h.repository.readBackupEntries();
  assert.ok(entries.ok);
  assert.ok(entries.value.every(([k]) => k.startsWith('family_finance_')));
  const envelope = buildBackupEnvelope(entries.value, true, new Date(2026, 8, 14, 10, 0));
  assert.ok(envelope);
  const text = serializeBackup(envelope);
  assert.doesNotMatch(text, /ff_pin_v1|verifierB64|saltB64|pbkdf2/);
  assert.equal(text.includes(r.saltB64 as string), false);
  assert.equal(text.includes(r.verifierB64 as string), false);
});

test('known-answer vector: the Node oracle agrees with the vector the device self-test checks', async () => {
  const v = KDF_KNOWN_ANSWER;
  assert.equal(pbkdf2Sync(v.pin, Buffer.from(v.saltB64, 'base64'), v.iterations, 32, 'sha256').toString('base64'), v.verifierB64);
  const kdf = new NodePinKdf();
  assert.deepEqual(await kdf.verifyPin(v.pin, v.saltB64, v.iterations, v.verifierB64), { ok: true, value: true });
  assert.deepEqual(await kdf.verifyPin('2581', v.saltB64, v.iterations, v.verifierB64), { ok: true, value: false });
});

test('native module: platform PBKDF2 + SecureRandom, contract minimums enforced natively; no JS crypto anywhere', () => {
  const kt = readFileSync(new URL('modules/ff-pin-kdf/android/src/main/java/expo/modules/ffpinkdf/FfPinKdfModule.kt', ROOT), 'utf8');
  for (const needle of ['"PBKDF2WithHmacSHA256"', 'SecureRandom()', 'MessageDigest.isEqual', 'MIN_ITERATIONS = 100_000', 'SALT_BYTES = 16', 'VERIFIER_BYTES = 32', 'clearPassword()']) {
    assert.ok(kt.includes(needle), needle);
  }
  assert.doesNotMatch(kt, /Log\.|println|printStackTrace/, 'nothing is logged');
  const config = JSON.parse(readFileSync(new URL('modules/ff-pin-kdf/expo-module.config.json', ROOT), 'utf8')) as { android: { modules: string[] } };
  assert.deepEqual(config.android.modules, ['expo.modules.ffpinkdf.FfPinKdfModule']);

  const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as Record<string, Record<string, string>>;
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((d) => /noble|quick-crypto|crypto-js|pbkdf2|bcrypt|scrypt|sjcl|forge/.test(d)), []);

  const src = new URL('src/', ROOT);
  for (const p of readdirSync(src, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(f))) {
    const text = readFileSync(new URL(p.replace(/\\/g, '/'), src), 'utf8');
    assert.doesNotMatch(text, /from ['"](@noble\/|react-native-quick-crypto|crypto-js|pbkdf2|node:crypto|crypto['"])/, p);
  }
  const binding = readFileSync(new URL('src/platform/expoPinKdf.ts', ROOT), 'utf8');
  assert.match(binding, /requireOptionalNativeModule<NativePinKdf>\('FfPinKdf'\)/);
  assert.match(binding, /if \(native === null\) return err\(\{ kind: 'kdfUnavailable' \}\)/);
});
