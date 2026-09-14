// Exhaustive grids for the date/number primitives: every combination is run
// through app.js (in the vm) and through the Expo port and compared exactly.

import assert from 'node:assert/strict';

import { getBillingRange, getClampedBillingDate, isValidDateStr, parseDatesAndGetLeft, parseLocalDateStr } from '../../src/domain/dates.ts';
import { round2 } from '../../src/domain/numbers.ts';
import { canon, loadWebApp } from './webHarness.ts';

export type GridStats = { comparisons: number; mismatches: number; todays: number };

const TODAYS: readonly [number, number, number][] = [
  [2026, 8, 13], [2026, 0, 31], [2026, 1, 28], [2028, 1, 29], [2026, 2, 31], [2026, 11, 31], [2027, 0, 1],
  [2026, 8, 1], [2026, 8, 5], [2026, 2, 27], [2026, 9, 25], [2024, 1, 29], [2030, 5, 30],
];
const STARTS = ['2025-01-31', '2025-12-31', '2026-01-29', '2026-02-28', '2028-02-29', '2026-03-15', '2026-09-13', '2026-09-30', '2026-10', '2027-01-01', '', 'garbage'];
const TOTALS: unknown[] = [1, 2, 3, 12, 24, '6', 0, undefined, 'x'];
const DAYS: unknown[] = [1, 13, 15, 28, 29, 30, 31, '31', undefined, 0];
const ROUND_INPUTS = [
  0, -0, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 1.005, 2.675, -1.005, 1.115, 1234.565, -1234.565, 0.1 + 0.2, 1e21, -1e-7, 4.35, 8.345, 99.995, 0.015, -0.015,
];

export function runPrimitiveGrids(): GridStats {
  const stats: GridStats = { comparisons: 0, mismatches: 0, todays: 0 };
  const eq = (label: string, web: unknown, expo: unknown): void => {
    stats.comparisons++;
    try {
      assert.deepEqual(canon(expo), canon(web));
    } catch (e) {
      stats.mismatches++;
      throw new Error(`GRID MISMATCH ${label}: ${(e as Error).message}`);
    }
  };

  for (const [y, m, d] of TODAYS) {
    const now = new Date(y, m, d, 10, 0);
    const web = loadWebApp({ nowMs: now.getTime(), storage: {} });
    stats.todays++;
    for (const start of STARTS) {
      for (const total of TOTALS) {
        for (const day of DAYS) {
          const label = `${y}-${m + 1}-${d} start=${start} total=${String(total)} day=${String(day)}`;
          eq(`parseDatesAndGetLeft ${label}`, web.call('parseDatesAndGetLeft', start, total, day), parseDatesAndGetLeft(start, total, day, now));
          if (y === 2026 && m === 8 && d === 13) eq(`getBillingRange ${label}`, web.call('getBillingRange', start, total, day), getBillingRange(start, total, day));
        }
      }
    }
  }

  const web = loadWebApp({ nowMs: new Date(2026, 8, 13, 10).getTime(), storage: {} });
  for (let year = 2024; year <= 2029; year++) {
    for (let month = -2; month <= 13; month++) {
      for (const day of [1, 28, 29, 30, 31]) eq(`getClampedBillingDate ${year}/${month}/${day}`, web.call('getClampedBillingDate', year, month, day), getClampedBillingDate(year, month, day));
    }
  }
  for (const str of ['2026-02-29', '2028-02-29', '2026-02-30', '2026-13-01', '2026-9-1', '2026-09-01', '', null, 20260901, '2026-04-31', '0099-01-01']) {
    eq(`isValidDateStr ${String(str)}`, web.call('isValidDateStr', str), isValidDateStr(str));
    if (typeof str === 'string' || str === null) eq(`parseLocalDateStr ${String(str)}`, web.call('parseLocalDateStr', str), parseLocalDateStr(str));
  }
  for (const n of ROUND_INPUTS) {
    eq(`round2 ${n}`, web.call('round2', n), round2(n));
    const literal = Object.is(n, -0) ? '-0' : String(n);
    eq(`Math.round ${literal}`, web.evaluate(`Math.round(${literal})`), Math.round(n));
  }
  return stats;
}
