// Differential parity: Web app.js (unmodified, in a vm) vs the Expo domain,
// Asia/Jerusalem local time (the product's real time zone, incl. DST days).
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { getMonthSnapshot } from '../../src/domain/aggregates.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { getHomePeriodOutflows } from '../../src/domain/homeTotals.ts';
import { compareScenario, newStats } from './paritySuite.ts';
import { runPrimitiveGrids } from './primitiveGrids.ts';
import { makeScenarios } from './scenarios.ts';
import { canon, loadWebApp } from './webHarness.ts';

test('Web ↔ Expo parity: 240 seeded scenarios (Asia/Jerusalem)', async () => {
  const stats = newStats();
  for (const s of makeScenarios(20260914, 240)) {
    await compareScenario(s, stats);
    stats.scenarios++;
  }
  console.log(`PARITY[Asia/Jerusalem] ${JSON.stringify(stats)}`);
  assert.equal(stats.mismatches, 0);
  for (const key of ['openingConfigured', 'openingSnapshotNull', 'openingSnapshotArray', 'periodWithdrawals', 'sweepArchived', 'alertsNonEmpty', 'goalsValidNonEmpty', 'goalsInvalid', 'restoreAccepted', 'restoreRejected', 'upcomingNonEmpty', 'legacyStringAmount', 'unknownFields', 'payrollLoanActive']) {
    assert.ok((stats.coverage[key] ?? 0) > 0, `scenario coverage never reached: ${key}`);
  }
});

test('Web ↔ Expo parity: date/number primitive grids (Asia/Jerusalem)', () => {
  const stats = runPrimitiveGrids();
  console.log(`GRIDS[Asia/Jerusalem] ${JSON.stringify(stats)}`);
  assert.equal(stats.mismatches, 0);
});

test('harness sensitivity: a deliberate divergence is detected, and correction A is visible against the Web', () => {
  const now = new Date(2026, 8, 10, 10);
  const items = [
    { id: 1, type: 'fixed', title: 'rent', amount: 1000, day: 15, where: 'bank' },
    { id: 2, type: 'cashWithdrawal', title: 'משיכת מזומן', amount: 500, start: '2026-09-20', isArchived: false },
  ];
  const web = loadWebApp({ nowMs: now.getTime(), storage: { family_finance_data: JSON.stringify(items) } });
  const webSnapshot = web.call('getMonthSnapshot', web.g.items);
  assert.deepEqual(canon(getMonthSnapshot(items, now)), canon(webSnapshot));
  assert.notDeepEqual(canon(getMonthSnapshot([{ ...items[0], amount: 1001 }, items[1] as Record<string, unknown>], now)), canon(webSnapshot));
  // The Web counts the withdrawal as an expense (1500); Expo reports 1000 expenses + 500 withdrawals.
  const webTotal = web.call('getHomeTotalExpensesForCurrentPeriod', web.g.items, web.date(2026, 8, 10));
  assert.equal(webTotal, 1500);
  assert.deepEqual(getHomePeriodOutflows(items, now, resolveCategoryConfig(null)), { expenses: 1000, withdrawals: 500, totalOutflow: 1500 });
});
