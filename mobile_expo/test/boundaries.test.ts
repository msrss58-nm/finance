// Structural guarantees of the Stage 3 product layer, checked on the source.
process.env.TZ = 'Asia/Jerusalem';

import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSyntheticBackup } from '../src/composition/syntheticDataset.ts';
import { isValidBackupShape } from '../src/domain/backup.ts';
import { financeHarness, ready } from './support/financeHarness.ts';

const ROOT = new URL('../', import.meta.url);

function sources(dir: string): { path: string; text: string }[] {
  const base = new URL(dir, ROOT);
  return readdirSync(base, { recursive: true })
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .map((p) => {
      const rel = p.replace(/\\/g, '/');
      return { path: dir + rel, text: readFileSync(new URL(rel, base), 'utf8') };
    });
}

test('screens never touch storage or native persistence directly (repository/controller only)', () => {
  for (const f of [...sources('app/'), ...sources('src/ui/'), ...sources('src/presentation/')]) {
    assert.doesNotMatch(f.text, /sqliteKeyValueStore|familyFinanceRepository|expo-sqlite|expoSqliteDriver|expo-secure-store/, f.path);
  }
});

test('"amount until next income" is not exposed in any UI (separate approval required)', () => {
  for (const f of [...sources('app/'), ...sources('src/ui/'), ...sources('src/presentation/')]) {
    assert.doesNotMatch(f.text, /getNextIncomeOutlook|expensesBeforeNextIncome/, f.path);
  }
});

test('the synthetic QA dataset is reachable only from the development diagnostics route', () => {
  const users = [...sources('app/'), ...sources('src/')].filter((f) => f.text.includes('syntheticDataset'));
  assert.deepEqual(
    users.map((f) => f.path),
    ['app/diagnostics.tsx'],
  );
  assert.match(readFileSync(new URL('app/_layout.tsx', ROOT), 'utf8'), /guard=\{__DEV__\}>\s*<Stack\.Screen\s+name="diagnostics"/);
});

test('the synthetic dataset is a valid backup and exercises the auto-archive sweep', async () => {
  const env = buildSyntheticBackup(new Date(2026, 8, 14, 10, 0));
  assert.equal(isValidBackupShape(env), true);
  const h = await financeHarness();
  await h.finance.load();
  assert.ok((await h.finance.restoreBackup(env, false)).ok);
  const h2 = await financeHarness(env.data);
  await h2.finance.load();
  assert.deepEqual(ready(h2.finance).lastAutoArchivedTitles, ['הלוואה שהסתיימה']);
});
