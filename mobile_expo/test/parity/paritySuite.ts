// Web (app.js in a vm) ↔ Expo (TypeScript domain) differential comparisons.
// Every comparison is exact (deep strict equality on canonical values) except
// where an APPROVED product correction intentionally changes the output; those
// are checked by their exact reconciliation rule, never by tolerance.
// Coverage counters prove which situations the random scenarios exercised.

import assert from 'node:assert/strict';

import { computeInAppAlerts } from '../../src/domain/alerts.ts';
import {
  getAutoArchiveCandidates,
  applyAutoArchive,
  getCategoryMonthlyTotals,
  getDatedMonthOverMonthChange,
  getFixedBankVsCreditSplit,
  getFixedCreditCardTotals,
  getLoanBankVsPayrollSplit,
  getLoanRemainingBalance,
  getLoansBalanceSummary,
  getLoansRemainingSummary,
  getMonthSnapshot,
  getRecentActivity,
  getTotalFixedCommitments,
  getVariableItemRemainingBalance,
  getVariableRemainingBalance,
} from '../../src/domain/aggregates.ts';
import { buildBackupEnvelope, isValidBackupShape, serializeBackup } from '../../src/domain/backup.ts';
import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { generateCashflowEvents } from '../../src/domain/cashflow.ts';
import { getBillingRange, parseDatesAndGetLeft } from '../../src/domain/dates.ts';
import {
  buildProjectedBalanceMonthView,
  buildProjectedBalanceSeries,
  getForecastPeriodBounds,
  getNextCashflowEvent,
  getProjectedBalanceToday,
} from '../../src/domain/forecast.ts';
import { loadGoalsState } from '../../src/domain/goals.ts';
import { buildGoalReminderInfo, buildGoalScheduleInfo, getGoalsDueForReminder, isGoalDueForReminderNow } from '../../src/domain/goalsPlanning.ts';
import { getHomePeriodOutflows } from '../../src/domain/homeTotals.ts';
import { roundLoanSplitForDisplay, round2 } from '../../src/domain/numbers.ts';
import { parseItemsRaw, type RawItem } from '../../src/domain/raw.ts';
import { getProjectedBalanceOpeningConfig, mergeAppSettings } from '../../src/domain/settings.ts';
import { getUpcomingCharges } from '../../src/domain/upcomingCharges.ts';
import { FamilyFinanceRepository } from '../../src/data/familyFinanceRepository.ts';
import { openKeyValueStore } from '../../src/data/sqliteKeyValueStore.ts';
import { createNodeSqliteDriver } from '../support/nodeSqliteDriver.ts';
import { canon, loadWebApp, type WebWorld } from './webHarness.ts';
import type { Scenario } from './scenarios.ts';

export type ParityStats = {
  scenarios: number;
  comparisons: number;
  mismatches: number;
  approvedDeviationChecks: number;
  coverage: Record<string, number>;
};

export function newStats(): ParityStats {
  return { scenarios: 0, comparisons: 0, mismatches: 0, approvedDeviationChecks: 0, coverage: {} };
}

type Ctx = { stats: ParityStats; scenario: string };

function same(ctx: Ctx, label: string, web: unknown, expo: unknown): void {
  ctx.stats.comparisons++;
  try {
    assert.deepEqual(canon(expo), canon(web));
  } catch (e) {
    ctx.stats.mismatches++;
    throw new Error(`PARITY MISMATCH [${ctx.scenario}] ${label}\n${(e as Error).message}`);
  }
}

function deviation(ctx: Ctx, label: string, ok: boolean, detail: string): void {
  ctx.stats.comparisons++;
  ctx.stats.approvedDeviationChecks++;
  if (!ok) {
    ctx.stats.mismatches++;
    throw new Error(`APPROVED-DEVIATION RULE BROKEN [${ctx.scenario}] ${label}: ${detail}`);
  }
}

function cover(ctx: Ctx, key: string, when = true): void {
  if (when) ctx.stats.coverage[key] = (ctx.stats.coverage[key] ?? 0) + 1;
}

const fns = (w: WebWorld) => ({
  call: (name: string, ...args: unknown[]) => w.call(name, ...args),
  get: (name: string) => w.g[name],
});

/** Runs every comparison for one scenario; throws on the first mismatch. */
export async function compareScenario(s: Scenario, stats: ParityStats): Promise<void> {
  const ctx: Ctx = { stats, scenario: s.name };
  const now = new Date(s.nowMs);
  const web = loadWebApp({ nowMs: s.nowMs, storage: s.storage });
  const W = fns(web);

  // ---- raw loading ----
  const cc = resolveCategoryConfig(s.storage.family_finance_cat_config ?? null);
  same(ctx, 'categoryConfig', W.get('categoryConfig'), cc);
  const settings = mergeAppSettings(s.storage.family_finance_settings ?? null);
  same(ctx, 'appSettings', W.get('appSettings'), settings);
  const goalsState = loadGoalsState(s.storage.family_finance_goals ?? null);
  same(ctx, 'goalsState', W.get('goalsState'), goalsState);

  // ---- auto-archive sweep (runs at Web load) ----
  const originalItems = parseItemsRaw(s.storage.family_finance_data ?? null);
  const webCandidates = W.call('getAutoArchiveCandidates', web.toVm(originalItems)) as { id: unknown }[];
  same(ctx, 'getAutoArchiveCandidates', Array.from(webCandidates, (c) => c.id), getAutoArchiveCandidates(originalItems, now, cc).map((c) => c.id));
  const sweep = applyAutoArchive(originalItems, now, cc);
  const items: RawItem[] = sweep.items;
  same(ctx, 'items after sweep', W.get('items'), items);
  if (sweep.archivedCount > 0) same(ctx, 'stored items after sweep (raw string)', web.storage.getItem('family_finance_data'), JSON.stringify(items));
  same(ctx, 'lastAutoArchivedTitles', W.get('lastAutoArchivedTitles'), sweep.archivedTitles);
  const webItems = W.get('items');
  cover(ctx, 'withItems', items.length > 0);
  cover(ctx, 'sweepArchived', sweep.archivedCount > 0);
  cover(ctx, 'goalsValidNonEmpty', goalsState.valid && goalsState.goals.length > 0);
  cover(ctx, 'goalsInvalid', !goalsState.valid);
  cover(ctx, 'legacyStringAmount', items.some((it) => typeof it.amount === 'string'));
  cover(ctx, 'unknownFields', items.some((it) => 'customFields' in it || 'futureField' in it));

  // ---- engine ----
  for (const [mOff, months] of [[0, 1], [0, 6], [-2, 3], [1, 2], [-13, 14]] as const) {
    const start = new Date(now.getFullYear(), now.getMonth() + mOff, 1);
    same(
      ctx,
      `generateCashflowEvents(${mOff},${months})`,
      W.call('generateCashflowEvents', webItems, web.date(start.getFullYear(), start.getMonth(), 1), months),
      generateCashflowEvents(items, start, months, cc),
    );
  }
  same(
    ctx,
    'generateCashflowEvents(default horizon)',
    W.call('generateCashflowEvents', webItems, web.date(now.getFullYear(), now.getMonth(), 1)),
    generateCashflowEvents(items, new Date(now.getFullYear(), now.getMonth(), 1), undefined, cc),
  );

  for (const off of [0, 1, -1, 3]) {
    const ref = new Date(now.getFullYear(), now.getMonth() + off, now.getDate());
    const webRef = web.date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    same(ctx, `getForecastPeriodBounds(${off})`, W.call('getForecastPeriodBounds', webRef), getForecastPeriodBounds(ref));

    // Home total expenses — APPROVED CORRECTION A.
    const webTotal = W.call('getHomeTotalExpensesForCurrentPeriod', webItems, webRef) as number;
    const expo = getHomePeriodOutflows(items, ref, cc);
    same(ctx, `home totalOutflow == Web total (${off})`, webTotal, expo.totalOutflow);
    const b = W.call('getForecastPeriodBounds', webRef) as { periodStart: Date; periodEnd: Date };
    const monthsCount = (b.periodEnd.getFullYear() - b.periodStart.getFullYear()) * 12 + (b.periodEnd.getMonth() - b.periodStart.getMonth()) + 1;
    const webEvents = W.call('generateCashflowEvents', webItems, web.date(b.periodStart.getFullYear(), b.periodStart.getMonth(), 1), monthsCount) as {
      date: Date;
      amount: number;
      type: string;
    }[];
    let wd = 0;
    for (const ev of Array.from(webEvents)) {
      const d = new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate()).getTime();
      if (ev.type === 'cashWithdrawal' && ev.amount < 0 && d >= b.periodStart.getTime() && d <= b.periodEnd.getTime()) wd += -ev.amount;
    }
    deviation(ctx, `home withdrawals == Web withdrawal events (${off})`, expo.withdrawals === round2(wd), `${expo.withdrawals} vs ${round2(wd)}`);
    deviation(
      ctx,
      `home expenses == Web total − withdrawals (${off})`,
      expo.expenses === round2(webTotal - round2(wd)) && round2(expo.expenses + expo.withdrawals) === webTotal,
      `${expo.expenses} + ${expo.withdrawals} vs ${webTotal}`,
    );
    cover(ctx, 'periodWithdrawals', expo.withdrawals > 0);
  }

  same(ctx, 'getNextCashflowEvent', W.call('getNextCashflowEvent', webItems), getNextCashflowEvent(items, now, cc));

  // ---- Opening balance / Forecast ----
  const opening = getProjectedBalanceOpeningConfig(settings);
  same(ctx, 'getProjectedBalanceOpeningConfig', W.call('getProjectedBalanceOpeningConfig'), opening);
  cover(ctx, 'openingConfigured', opening !== null);
  cover(ctx, 'openingSnapshotNull', opening !== null && opening.includedWithdrawalIds === null);
  cover(ctx, 'openingSnapshotArray', opening !== null && Array.isArray(opening.includedWithdrawalIds));
  if (opening) {
    const through = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45);
    const webSeries = W.call(
      'buildProjectedBalanceSeries',
      opening.amount,
      opening.dateStr,
      web.date(through.getFullYear(), through.getMonth(), through.getDate()),
      webItems,
      web.toVm(opening.includedWithdrawalIds),
    );
    const expoSeries = buildProjectedBalanceSeries(opening.amount, opening.dateStr, through, items, opening.includedWithdrawalIds, cc);
    compareSeries(ctx, 'buildProjectedBalanceSeries', webSeries, expoSeries);
    cover(ctx, 'openingDayWithdrawalDeducted', !!expoSeries?.days[0]?.events.some((e) => e.type === 'cashWithdrawal' && !e.alreadyIncludedInOpeningSnapshot));

    for (const off of [0, 1, -1]) {
      const ref = new Date(now.getFullYear(), now.getMonth() + off, 10);
      const webView = W.call('buildProjectedBalanceMonthView', web.date(ref.getFullYear(), ref.getMonth(), ref.getDate()), webItems);
      const expoView = buildProjectedBalanceMonthView(ref, items, opening, cc);
      compareSeries(ctx, `buildProjectedBalanceMonthView(${off})`, webView, expoView);
      cover(ctx, 'viewWithUnavailableDays', expoView.days.some((d) => d.availability === 'unavailable'));
    }
  } else {
    const ref = new Date(now.getFullYear(), now.getMonth(), 10);
    same(
      ctx,
      'buildProjectedBalanceMonthView (unconfigured)',
      W.call('buildProjectedBalanceMonthView', web.date(ref.getFullYear(), ref.getMonth(), 10), webItems),
      buildProjectedBalanceMonthView(ref, items, opening, cc),
    );
  }
  same(ctx, 'getProjectedBalanceToday', W.call('getProjectedBalanceToday', webItems), getProjectedBalanceToday(items, now, opening, cc));

  // ---- Home / categories / loans ----
  same(ctx, 'getMonthSnapshot', W.call('getMonthSnapshot', webItems), getMonthSnapshot(items, now));
  same(ctx, 'getCategoryMonthlyTotals', W.call('getCategoryMonthlyTotals', webItems, W.get('categoryConfig')), getCategoryMonthlyTotals(items, cc, now));
  same(ctx, 'getFixedCreditCardTotals', W.call('getFixedCreditCardTotals', webItems), getFixedCreditCardTotals(items, now));
  same(ctx, 'getFixedBankVsCreditSplit', W.call('getFixedBankVsCreditSplit', webItems), getFixedBankVsCreditSplit(items, now));
  same(ctx, 'getTotalFixedCommitments', W.call('getTotalFixedCommitments', webItems), getTotalFixedCommitments(items, now));
  const split = getLoanBankVsPayrollSplit(items, now);
  same(ctx, 'getLoanBankVsPayrollSplit', W.call('getLoanBankVsPayrollSplit', webItems), split);
  same(ctx, 'roundLoanSplitForDisplay', W.call('roundLoanSplitForDisplay', split.bank, split.payroll), roundLoanSplitForDisplay(split.bank, split.payroll));
  cover(ctx, 'payrollLoanActive', split.payroll > 0);
  same(ctx, 'getLoansRemainingSummary', W.call('getLoansRemainingSummary', webItems), getLoansRemainingSummary(items, now));
  same(ctx, 'getLoansBalanceSummary', W.call('getLoansBalanceSummary', webItems), getLoansBalanceSummary(items, now));
  same(ctx, 'getVariableRemainingBalance', W.call('getVariableRemainingBalance', webItems), getVariableRemainingBalance(items, cc, now));
  same(ctx, 'getDatedMonthOverMonthChange', W.call('getDatedMonthOverMonthChange', webItems), getDatedMonthOverMonthChange(items, now));
  same(ctx, 'getRecentActivity', Array.from(W.call('getRecentActivity', webItems, 4) as { id: unknown }[], (x) => x.id), getRecentActivity(items, 4).map((x) => x.id));
  const webItemList = webItems as Record<string, unknown>[];
  items.forEach((it, idx) => {
    const wi = webItemList[idx];
    if (it.type === 'loan') {
      same(ctx, `getLoanRemainingBalance[${idx}]`, W.call('getLoanRemainingBalance', wi), getLoanRemainingBalance(it, now));
      same(ctx, `parseDatesAndGetLeft loan[${idx}]`, W.call('parseDatesAndGetLeft', wi?.start, wi?.total, wi?.day), parseDatesAndGetLeft(it.start, it.total, it.day, now));
      same(ctx, `getBillingRange loan[${idx}]`, W.call('getBillingRange', wi?.start, wi?.total, wi?.day), getBillingRange(it.start, it.total, it.day));
    }
    if (it.type === 'variable') same(ctx, `getVariableItemRemainingBalance[${idx}]`, W.call('getVariableItemRemainingBalance', wi), getVariableItemRemainingBalance(it, cc, now));
  });

  // ---- in-app alerts + "מה צפוי לרדת" ----
  const alerts = computeInAppAlerts({ items, settings, now, categoryConfig: cc, lastAutoArchivedTitles: sweep.archivedTitles });
  same(ctx, 'computeHomeNotifications', W.call('computeHomeNotifications'), alerts.map((a) => ({ title: a.title, detail: a.detail, amount: a.amount })));
  cover(ctx, 'alertsNonEmpty', alerts.length > 0);
  const upcoming = getUpcomingCharges({ items, now, categoryConfig: cc, alerts });
  const alertedKeys = new Set(alerts.filter((a) => a.kind === 'upcomingPayment').map((a) => `${String(a.itemType)}|${String(a.itemId)}`));
  const tomorrowKey = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  deviation(
    ctx,
    'upcoming never repeats an alerted (type,item,date)',
    upcoming.every((c) => !(alertedKeys.has(`${c.type}|${String(c.itemId)}`) && c.date.getTime() === tomorrowKey)),
    'duplicate between alerts and upcoming',
  );
  deviation(ctx, 'upcoming contains no cash withdrawal', upcoming.every((c) => c.type !== 'cashWithdrawal'), 'withdrawal listed as a charge');
  cover(ctx, 'upcomingNonEmpty', upcoming.length > 0);

  // ---- goals ----
  if (goalsState.valid) {
    const webGoals = W.get('goals') as unknown[];
    goalsState.goals.forEach((g, i) => {
      same(ctx, `buildGoalScheduleInfo[${i}]`, W.call('buildGoalScheduleInfo', webGoals[i]), buildGoalScheduleInfo(g, now));
      same(ctx, `buildGoalReminderInfo[${i}]`, W.call('buildGoalReminderInfo', webGoals[i]), buildGoalReminderInfo(g, now));
      same(ctx, `isGoalDueForReminderNow[${i}]`, W.call('isGoalDueForReminderNow', webGoals[i]), isGoalDueForReminderNow(g, now));
    });
  }
  const due = getGoalsDueForReminder(goalsState, now);
  same(ctx, 'getGoalsDueForReminder', W.call('getGoalsDueForReminder'), due);
  cover(ctx, 'goalsDueForReminder', due.length > 0);

  // ---- backup export ----
  const webBackup = W.call('collectAppLocalStorageBackup');
  const entries = Object.entries(web.storage.snapshot()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const expoBackup = buildBackupEnvelope(entries, goalsState.valid, now);
  same(ctx, 'collectAppLocalStorageBackup', webBackup, expoBackup);
  cover(ctx, 'backupRefused', expoBackup === null);
  if (expoBackup) {
    assert.doesNotMatch(serializeBackup(expoBackup), /"ff_/);
    assert.match(expoBackup.exportedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  }

  // ---- restore ----
  const backupObj = JSON.parse(s.restore.text) as unknown;
  same(ctx, 'isValidBackupShape', W.call('isValidBackupShape', web.toVm(backupObj)), isValidBackupShape(backupObj));
  const preRestore = web.storage.snapshot();
  const localGoalsRawPresent = preRestore.family_finance_goals !== undefined;
  const restoreWorld = loadWebApp({ nowMs: s.nowMs, storage: preRestore, restoreCheckbox: { present: localGoalsRawPresent, checked: s.restore.deleteGoals } });
  const restoreSnapshotBefore = restoreWorld.storage.snapshot();
  restoreWorld.g.pendingRestoreBackup = restoreWorld.toVm(backupObj);
  restoreWorld.call('confirmRestoreBackup');
  const webAfter = restoreWorld.storage.snapshot();

  const driver = createNodeSqliteDriver();
  const kv = await openKeyValueStore(driver);
  for (const [k, v] of Object.entries(restoreSnapshotBefore)) await kv.set(k, v);
  const repo = new FamilyFinanceRepository(kv);
  const result = await repo.restoreBackup(backupObj, { deleteExistingGoals: s.restore.deleteGoals, now });
  const expoAfter: Record<string, string> = {};
  for (const k of await kv.keys()) expoAfter[k] = (await kv.get(k)) as string;
  await driver.close();
  same(ctx, 'restore result state', sortKeys(webAfter), sortKeys(expoAfter));
  same(ctx, 'restore accepted', restoreWorld.reloads.count > 0, result.ok);
  cover(ctx, result.ok ? 'restoreAccepted' : 'restoreRejected');
  cover(ctx, 'restoreV1GoalsDeleteOptIn', result.ok && s.restore.deleteGoals && localGoalsRawPresent && (backupObj as { schemaVersion?: unknown }).schemaVersion !== 2);
}

function sortKeys(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

type WebDay = Record<string, unknown> & { events?: { type: string; amount: number }[] };

function compareSeries(ctx: Ctx, label: string, web: unknown, expo: unknown): void {
  if (web === null || expo === null) return same(ctx, label, web, expo);
  const w = web as Record<string, unknown> & { days?: WebDay[] };
  const e = expo as Record<string, unknown> & { days?: Record<string, unknown>[] };
  const { days: wDaysRaw = [], ...wRest } = w;
  const { days: eDays = [], ...eRest } = e;
  const wDays = Array.from(wDaysRaw);
  same(ctx, `${label} header`, wRest, eRest);
  same(ctx, `${label} day count`, wDays.length, eDays.length);
  wDays.forEach((wd, i) => {
    const ed = eDays[i] as Record<string, unknown>;
    const { expenses: wExpenses, ...wOther } = wd;
    const { expenses: eExpenses, withdrawals: eWithdrawals, totalOutflow: eTotal, ...eOther } = ed;
    same(ctx, `${label} day ${String(wd.dateKey)} (all fields except the expense split)`, wOther, eOther);
    // APPROVED CORRECTION A: the Web "expenses" figure = Expo totalOutflow;
    // Expo expenses excludes the day's cash withdrawals.
    if (wExpenses === null) {
      deviation(ctx, `${label} day ${String(wd.dateKey)} unavailable stays null`, eExpenses === null && eWithdrawals === null && eTotal === null, 'null figures');
      return;
    }
    let wdSum = 0;
    for (const ev of Array.from(wd.events ?? [])) if (ev.type === 'cashWithdrawal' && ev.amount < 0) wdSum += -ev.amount;
    deviation(ctx, `${label} day ${String(wd.dateKey)} totalOutflow == Web expenses`, eTotal === wExpenses, `${String(eTotal)} vs ${String(wExpenses)}`);
    deviation(ctx, `${label} day ${String(wd.dateKey)} withdrawals`, eWithdrawals === round2(wdSum), `${String(eWithdrawals)} vs ${round2(wdSum)}`);
    deviation(ctx, `${label} day ${String(wd.dateKey)} expenses == Web expenses − withdrawals`, eExpenses === round2((wExpenses as number) - round2(wdSum)), `${String(eExpenses)}`);
  });
}
