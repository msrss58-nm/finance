// A real FinanceController over node:sqlite, with an adjustable clock and an
// armable storage fault. Synthetic data only.

import { FamilyFinanceRepository } from '../../src/data/familyFinanceRepository.ts';
import type { KeyValueStore } from '../../src/data/keyValueStore.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { GoalIdGenerator } from '../../src/domain/ids.ts';
import type { ItemFormValues } from '../../src/domain/itemWrites.ts';
import { FinanceController, type FinanceSnapshot } from '../../src/state/financeController.ts';
import { createNodeSqliteDriver } from './nodeSqliteDriver.ts';

export type Harness = {
  readonly kv: KeyValueStore;
  readonly repository: FamilyFinanceRepository;
  readonly finance: FinanceController;
  readonly clock: { now: Date };
  /** While set, every SQL statement for which it returns true fails. */
  fault: ((sql: string) => boolean) | null;
};

export async function financeHarness(entries: Readonly<Record<string, string>> = {}, now: Date = new Date(2026, 8, 14, 10, 0)): Promise<Harness> {
  const holder: { fault: ((sql: string) => boolean) | null } = { fault: null };
  const kv = await openKeyValueStore(createNodeSqliteDriver(':memory:', { failWhen: (sql) => holder.fault?.(sql) ?? false }));
  for (const [k, v] of Object.entries(entries)) await kv.set(k, v);
  const repository = new FamilyFinanceRepository(kv);
  const clock = { now };
  const finance = new FinanceController({ repository, clock: () => clock.now, goalIds: new GoalIdGenerator() });
  const h: Harness = {
    kv,
    repository,
    finance,
    clock,
    get fault() {
      return holder.fault;
    },
    set fault(f) {
      holder.fault = f;
    },
  };
  return h;
}

export function ready(finance: FinanceController): FinanceSnapshot {
  const s = finance.state.get();
  if (s.status !== 'ready') throw new Error('finance not ready: ' + s.status);
  return s;
}

/** A snapshot for presentation tests, loaded through the real repository. */
export async function snapshotOf(entries: Readonly<Record<string, string>>, now: Date, lastAutoArchivedTitles: readonly string[] = []): Promise<FinanceSnapshot> {
  const kv = await openKeyValueStore(createNodeSqliteDriver());
  for (const [k, v] of Object.entries(entries)) await kv.set(k, v);
  const loaded = await new FamilyFinanceRepository(kv).loadDataSet();
  if (!loaded.ok) throw new Error('load failed');
  return { data: loaded.value, now, revision: 1, lastAutoArchivedTitles };
}

export const BLANK_FORM: ItemFormValues = {
  title: '',
  amount: '',
  day: '',
  where: '',
  cardLast4: '',
  notes: '',
  frequency: 'monthly',
  bimonthlyStartMonth: '1',
  originalAmount: '',
  total: '',
  start: '',
  interest: '',
};

export const form = (patch: Partial<ItemFormValues>): ItemFormValues => ({ ...BLANK_FORM, ...patch });

export const goalRecord = (patch: Record<string, unknown> = {}) => ({
  id: 'g1',
  title: 'חופשה',
  dueDate: '2027-01-01',
  targetAmount: 1000,
  savedAmount: 0,
  components: [],
  isArchived: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  confirmedTransfers: [],
  ...patch,
});
