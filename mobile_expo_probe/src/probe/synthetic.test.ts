import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_LOCAL_KEYS,
  RAW_FIXTURES,
  addCalendarDays,
  buildProbeEnvelope,
  clampedDate,
  dateKey,
  nextMonthlyInstant,
  round2,
} from './synthetic.ts';

test('round2 removes float drift', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-2.675), -2.67);
});

test('clamped billing-style dates: short months, leap years, rollover', () => {
  assert.equal(dateKey(clampedDate(2026, 1, 31)), '2026-02-28');
  assert.equal(dateKey(clampedDate(2024, 1, 31)), '2024-02-29');
  assert.equal(dateKey(clampedDate(2026, 3, 31)), '2026-04-30');
  assert.equal(dateKey(clampedDate(2026, 12, 15)), '2027-01-15');
});

test('calendar day stepping crosses month/year boundaries', () => {
  assert.equal(dateKey(addCalendarDays(new Date(2026, 11, 31), 1)), '2027-01-01');
  assert.equal(dateKey(addCalendarDays(new Date(2026, 2, 26), 1)), '2026-03-27');
});

test('next monthly instant is strictly after now', () => {
  assert.equal(nextMonthlyInstant(new Date(2026, 8, 1, 12)).getTime(), new Date(2026, 8, 2, 9, 0).getTime());
  assert.equal(nextMonthlyInstant(new Date(2026, 8, 2, 9, 0)).getTime(), new Date(2026, 9, 2, 9, 0).getTime());
  assert.equal(nextMonthlyInstant(new Date(2026, 11, 20)).getTime(), new Date(2027, 0, 2, 9, 0).getTime());
});

test('raw fixtures are NOT stable under JSON.parse/stringify (so exact storage matters)', () => {
  const changed = RAW_FIXTURES.filter(([, v]) => {
    try {
      return JSON.stringify(JSON.parse(v)) !== v;
    } catch {
      return true; // legacy non-JSON value
    }
  });
  assert.ok(changed.length >= 4);
});

test('backup envelope keeps only family_finance_* raw strings', () => {
  const entries = [...RAW_FIXTURES, ...DEVICE_LOCAL_KEYS.map((k) => [k, 'SECRET-SHOULD-NOT-LEAK'] as const)];
  const env = buildProbeEnvelope(entries, '2026-09-13T00:00:00.000Z');
  assert.equal(env.schemaVersion, 2);
  for (const k of DEVICE_LOCAL_KEYS) assert.equal(k in env.data, false);
  assert.equal(JSON.stringify(env).includes('SECRET-SHOULD-NOT-LEAK'), false);
  for (const [k, v] of RAW_FIXTURES) assert.equal(env.data[k], v);
  // round trip of the envelope file itself (UTF-8 JSON, 2-space indent)
  const text = JSON.stringify(env, null, 2);
  const back = JSON.parse(new TextDecoder().decode(new TextEncoder().encode(text))) as typeof env;
  for (const [k, v] of RAW_FIXTURES) assert.equal(back.data[k], v);
});
