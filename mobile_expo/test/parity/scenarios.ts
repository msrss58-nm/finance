// Deterministic, seeded synthetic scenarios for the differential harness.
// Synthetic data only — no production or user data.

import { seededRandom } from '../support/fakes.ts';

export type Scenario = {
  readonly name: string;
  readonly nowMs: number;
  readonly storage: Record<string, string>;
  /** A backup to restore on top of `storage`, and the "delete goals" opt-in. */
  readonly restore: { readonly text: string; readonly deleteGoals: boolean };
};

const pad = (n: number): string => (n < 10 ? '0' : '') + n;
const fmt = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Edge "today" values: month ends, Feb 28/29, year boundaries, the 1st–5th, Israel DST switch days. */
export const EDGE_TODAYS: readonly [number, number, number][] = [
  [2026, 8, 13], [2026, 0, 31], [2026, 1, 28], [2028, 1, 29], [2028, 1, 28], [2026, 2, 31], [2026, 3, 30],
  [2026, 11, 31], [2027, 0, 1], [2026, 8, 1], [2026, 8, 2], [2026, 8, 4], [2026, 8, 5], [2026, 2, 27],
  [2026, 2, 28], [2026, 9, 24], [2026, 9, 25], [2025, 11, 5], [2029, 10, 30], [2024, 1, 29],
];

export function makeScenarios(seed: number, count: number): Scenario[] {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const chance = (p: number): boolean => rand() < p;
  const scenarios: Scenario[] = [];

  for (let n = 0; n < count; n++) {
    const base: [number, number, number] = n < EDGE_TODAYS.length ? (EDGE_TODAYS[n] as [number, number, number]) : [int(2024, 2029), int(0, 11), int(1, 31)];
    const today = new Date(base[0], base[1], base[2], pick([0, 1, 9, 12, 23]), pick([0, 30, 59]));
    const nowMs = today.getTime();
    const dayOffset = (lo: number, hi: number): string => fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + int(lo, hi)));
    const monthOnly = (): string => {
      const d = new Date(today.getFullYear(), today.getMonth() + int(-30, 12), 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    };

    const amount = (): unknown =>
      pick<unknown>([100, 250, 1234.56, 99.99, 0.005, 1000.005, 1.005, 2.675, 3500, 12000, 0.1, 0.2, 49.9, 5000, 333.33, chance(0.1) ? '300' : 700]);
    const day = (): unknown => pick<unknown>([1, 2, 4, 5, 10, 15, 28, 29, 30, 31, 31, '5', '31', undefined, 0, 32, '', null]);
    const total = (): unknown => pick<unknown>([1, 2, 3, 6, 12, 24, 36, '12', 0, undefined]);
    const start = (): unknown => (chance(0.1) ? monthOnly() : chance(0.05) ? undefined : dayOffset(-900, 200));

    const items: Record<string, unknown>[] = [];
    const itemCount = int(0, 14);
    const withdrawalDates: { id: number; date: string }[] = [];
    for (let i = 0; i < itemCount; i++) {
      const id = 1_700_000_000_000 + n * 100 + i;
      const type = pick(['income', 'income', 'fixed', 'fixed', 'loan', 'variable', 'dated', 'dated', 'cashWithdrawal', 'cashWithdrawal']);
      const it: Record<string, unknown> = { id, type, title: pick(['משכורת', 'ארנונה', 'Netflix', 'הלוואת רכב', 'מקרר', 'חיוב כרטיס', 'Visa 4580 — חיוב']), amount: amount(), isArchived: chance(0.08) };
      if (type !== 'cashWithdrawal') it.displayCategory = pick<unknown>([type, type, undefined, 'custom_fixed', 'creditPurchase']);
      if (type === 'income') it.day = day();
      if (type === 'fixed') {
        Object.assign(it, { day: day(), where: pick<unknown>(['bank', 'credit', undefined, 'Leumi']), period: pick<unknown>(['חודשי', 'שנתי', undefined]), cardLast4: '1234', notes: '' });
        if (chance(0.25)) Object.assign(it, { bimonthly: true, bimonthlyStartMonth: pick<unknown>([1, 2, 3, 6, 9, 12, '3', 0, 13, undefined]) });
      }
      if (type === 'loan') {
        Object.assign(it, { day: day(), total: total(), start: start(), where: pick<unknown>(['bank', 'דרך תלוש השכר', undefined, 'Leumi']), originalAmount: pick<unknown>([24000, 6000, undefined, '5000']), interest: pick<unknown>([0, 3.5, '4.2', undefined, -1, 12]) });
      }
      if (type === 'variable') {
        Object.assign(it, { day: day(), total: total(), start: start(), where: pick<unknown>(['bank', 'credit', undefined]), originalAmount: pick<unknown>([3500, undefined]) });
      }
      if (type === 'dated') {
        Object.assign(it, { start: chance(0.9) ? dayOffset(-70, 80) : undefined, where: pick<unknown>(['credit', 'bank', undefined]), displayCategory: pick<unknown>(['dated', 'dated', 'creditPurchase', undefined]), notes: 'הערה' });
      }
      if (type === 'cashWithdrawal') {
        const date = dayOffset(-40, 40);
        Object.assign(it, { title: 'משיכת מזומן', start: date, notes: '' });
        withdrawalDates.push({ id, date });
      }
      if (chance(0.15)) it.customFields = { note: 'unknown field', n: 1 };
      if (chance(0.05)) it.futureField = [1, 'x', null];
      items.push(it);
    }

    const storage: Record<string, string> = {};
    if (itemCount > 0 || chance(0.5)) storage.family_finance_data = JSON.stringify(items);

    const cfgMode = rand();
    if (cfgMode < 0.35) {
      // absent -> defaults
    } else if (cfgMode < 0.85) {
      const cfg: Record<string, unknown> = {
        income: { label: '💰 הכנסות', baseType: 'income', defaultDayOfMonth: pick<unknown>([undefined, 10, '1', 0]) },
        fixed: { label: '🏡 הוצאות קבועות', baseType: 'fixed' },
        variable: { label: '🛒 תשלומים שונים', baseType: 'variable', defaultDayOfMonth: pick<unknown>([undefined, 15, 31]) },
        loan: { label: '🏦 הלוואות', baseType: 'loan' },
        custom_fixed: { label: '🧾 מנויים', baseType: 'fixed', defaultDayOfMonth: pick<unknown>([3, '12', 31, 0, undefined]) },
        creditPurchase: { label: '💳 רכישות', baseType: 'dated' },
      };
      if (chance(0.7)) cfg.dated = { label: '💳 חיוב כרטיס אשראי', baseType: 'dated' };
      storage.family_finance_cat_config = JSON.stringify(cfg);
    } else {
      storage.family_finance_cat_config = pick(['{bad json', '[]', 'null', '"x"']);
    }

    if (chance(0.75)) {
      const opening = pick(['none', 'valid', 'valid', 'valid', 'bad']);
      const settings: Record<string, unknown> = {
        theme: 'dark',
        pinHash: 'legacy-web-sha256-hash',
        pinEnabled: chance(0.3),
        notifications: { upcomingPayment: chance(0.8), upcomingIncome: chance(0.8), completedObligation: chance(0.8) },
        futureSetting: { kept: true },
        anchorBalance: 1234,
        anchorDate: '2025-01-01',
        currentBalance: 50,
      };
      if (opening === 'valid') {
        const openDate = withdrawalDates.length && chance(0.5) ? (pick(withdrawalDates).date as string) : dayOffset(-60, 20);
        settings.projectedBalanceOpeningAmount = pick<unknown>([0, 1500.5, -300, 25000, 0.015]);
        settings.projectedBalanceOpeningDate = openDate;
        settings.projectedBalanceOpeningIncludedWithdrawalIds = pick<unknown>([
          null,
          [],
          withdrawalDates.filter((w) => w.date === openDate).map((w) => w.id),
          ['x', 5, null],
        ]);
      } else if (opening === 'bad') {
        settings.projectedBalanceOpeningAmount = pick<unknown>(['100', null, 'abc']);
        settings.projectedBalanceOpeningDate = pick<unknown>(['2026-02-30', '2026-9-1', undefined]);
      }
      storage.family_finance_settings = JSON.stringify(settings);
    }

    const goalsMode = rand();
    if (goalsMode < 0.35) {
      // absent
    } else if (goalsMode < 0.9) {
      const goals: Record<string, unknown>[] = [];
      for (let gi = 0; gi < int(0, 3); gi++) {
        const components: Record<string, unknown>[] = [];
        for (let ci = 0; ci < int(0, 3); ci++) {
          components.push({ id: `c_${n}_${gi}_${ci}`, name: pick(['מזגן', 'טיסה', 'Laptop']), amount: pick([500, 1200.5, 99.99, 3000]), dueDate: pick<unknown>([null, undefined, dayOffset(-40, 420)]) });
        }
        let target = pick([1000, 5000, 12345.67]);
        if (components.length) {
          let s = 0;
          for (const c of components) s = Math.round((s + (c.amount as number) + Number.EPSILON) * 100) / 100;
          target = s;
        }
        const transfers: Record<string, unknown>[] = [];
        for (let ti = 0; ti < int(0, 2); ti++) {
          const date = dayOffset(-90, 0);
          transfers.push(
            chance(0.5)
              ? { date, amount: pick([100, 250.5]) }
              : { date, amount: pick([100, 250.5]), id: `t_${n}_${gi}_${ti}`, confirmedAt: '2026-01-02T08:00:00.000Z', reminderPeriod: date.slice(0, 7), source: 'goals_reminder' },
          );
        }
        goals.push({
          id: `goal_${n}_${gi}`,
          title: pick(['חופשה', 'רכב', 'Emergency']),
          dueDate: dayOffset(-60, 500),
          targetAmount: target,
          savedAmount: pick([0, 150, 999.99, 20000]),
          components,
          isArchived: chance(0.15),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-05T10:00:00.000Z',
          confirmedTransfers: transfers,
        });
      }
      storage.family_finance_goals = JSON.stringify(goals);
    } else {
      storage.family_finance_goals = pick(['not json', '[{"id":1}]', '{}']);
    }

    if (chance(0.5)) storage.family_finance_activity_log = JSON.stringify([{ ts: '2026-01-01 10:00', action: 'x', detail: 'synthetic' }]);
    if (chance(0.3)) storage.family_finance_loan_balance_view = pick(['"principal"', '"total"', 'principal', 'total']);
    if (chance(0.3)) storage.family_finance_category_tile_order = JSON.stringify(['income', 'fixed']);
    storage.ff_goals_reminder_v1 = '{"enabled":true}';

    // A backup to restore on top of this state.
    const backupData: Record<string, string> = {
      family_finance_data: JSON.stringify(items.slice(0, int(0, items.length))),
      family_finance_settings: JSON.stringify({ theme: 'light', pinHash: 'other-legacy-hash' }),
    };
    const version = pick<unknown>([2, 2, 1, undefined, '2']);
    if (version === 2 || chance(0.3)) backupData.family_finance_goals = chance(0.8) ? '[]' : 'not json';
    if (chance(0.2)) backupData.family_finance_loan_balance_view = pick(['principal', '"total"', 'bogus']);
    if (chance(0.1)) backupData.not_ours = '1';
    const envelope: Record<string, unknown> = { exportedAt: '2026-01-01 10:00', data: backupData };
    if (version !== undefined) envelope.schemaVersion = version;
    scenarios.push({
      name: `s${seed}-${n} today=${fmt(today)}`,
      nowMs,
      storage,
      restore: { text: JSON.stringify(envelope), deleteGoals: chance(0.5) },
    });
  }
  return scenarios;
}
