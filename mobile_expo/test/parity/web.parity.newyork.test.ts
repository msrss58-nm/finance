// The same differential suite in a negative-UTC-offset zone, where the Web
// app's legacy `new Date('YYYY-MM-DD')` (UTC) parsing lands on the PREVIOUS
// local day. Proves the Expo port preserves that legacy behavior exactly.
process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import test from 'node:test';

import { compareScenario, newStats } from './paritySuite.ts';
import { runPrimitiveGrids } from './primitiveGrids.ts';
import { makeScenarios } from './scenarios.ts';

test('Web ↔ Expo parity: 80 seeded scenarios (America/New_York)', async () => {
  const stats = newStats();
  for (const s of makeScenarios(777, 80)) {
    await compareScenario(s, stats);
    stats.scenarios++;
  }
  console.log(`PARITY[America/New_York] ${JSON.stringify(stats)}`);
  assert.equal(stats.mismatches, 0);
});

test('Web ↔ Expo parity: primitive grids (America/New_York)', () => {
  const stats = runPrimitiveGrids();
  console.log(`GRIDS[America/New_York] ${JSON.stringify(stats)}`);
  assert.equal(stats.mismatches, 0);
});
