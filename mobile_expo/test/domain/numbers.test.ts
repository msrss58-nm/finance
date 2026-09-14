// JavaScript Math.round / round2 semantics (approved decision F). The same
// inputs are also compared against app.js itself in test/parity/primitiveGrids.ts.
import assert from 'node:assert/strict';
import test from 'node:test';

import { roundLoanSplitForDisplay, round2 } from '../../src/domain/numbers.ts';

test('Math.round: positive halves round up, negative halves round toward +∞, -0.5 gives -0', () => {
  assert.deepEqual([0.5, 1.5, 2.5].map(Math.round), [1, 2, 3]);
  assert.deepEqual([-1.5, -2.5].map(Math.round), [-1, -2]);
  assert.ok(Object.is(Math.round(-0.5), -0), 'Math.round(-0.5) is -0');
});

test('round2 boundaries (EPSILON nudge, half-up, negative halves)', () => {
  const cases: [number, number][] = [
    [1.005, 1.01],
    [2.675, 2.68],
    [-1.005, -1],
    [1.115, 1.12],
    [1234.565, 1234.57],
    [-1234.565, -1234.56],
    [0.1 + 0.2, 0.3],
    [4.35, 4.35],
    [8.345, 8.35],
    [99.995, 100],
    [0.015, 0.02],
    [-0.015, -0.01],
  ];
  for (const [input, expected] of cases) assert.equal(round2(input), expected, String(input));
});

test('round2 of tiny negatives yields -0 (identical to the Web; displays as ₪0)', () => {
  assert.ok(Object.is(round2(-0.004), -0));
  assert.ok(Object.is(round2(-0.005), -0));
});

test('roundLoanSplitForDisplay: the two lines always sum to the rounded total', () => {
  assert.deepEqual(roundLoanSplitForDisplay(3990.5, 2791.5), { bank: 3991, payroll: 2791, total: 6782 });
  assert.deepEqual(roundLoanSplitForDisplay(100.4, 200.4), { bank: 101, payroll: 200, total: 301 });
  assert.deepEqual(roundLoanSplitForDisplay(0, 0), { bank: 0, payroll: 0, total: 0 });
  for (let b = 0; b < 50; b += 0.37) {
    for (let p = 0; p < 50; p += 0.41) {
      const d = roundLoanSplitForDisplay(b, p);
      assert.equal(d.bank + d.payroll, d.total);
    }
  }
});
