// Goals planning & reminder calculation — ported verbatim from app.js
// (goalTargetAmount … getGoalsDueForReminder), with `today` explicit.
//
// target = sum(components) or targetAmount; remaining = max(target − saved −
// confirmed, 0); the pooled saved+confirmed money is allocated FIFO to buckets
// by earliest due date; transfers are due on the 2nd of each month; the final
// eligible date is the 2nd of the due month (or of the previous month when the
// due day is the 1st); per-date amounts are ceil(remaining / dates) with the
// final date absorbing the remainder; overdue buckets are reported separately.
// No reminder UI here.

import { cashflowDateKey, cashflowDateOnly, parseLocalDateStr, todayStr } from './dates.ts';
import type { Goal, GoalComponent, GoalsState } from './goals.ts';
import { round2 } from './numbers.ts';

export function goalTargetAmount(goal: Goal): number {
  if (goal.components && goal.components.length > 0) {
    let sum = 0;
    for (const c of goal.components) sum += c.amount;
    return round2(sum);
  }
  return round2(goal.targetAmount || 0);
}

export function goalConfirmedTransfersTotal(goal: Goal): number {
  let sum = 0;
  for (const t of goal.confirmedTransfers || []) sum += t.amount || 0;
  return round2(sum);
}

export function goalRemainingAmount(goal: Goal): number {
  const target = goalTargetAmount(goal);
  const saved = round2(goal.savedAmount || 0);
  const confirmed = goalConfirmedTransfersTotal(goal);
  return Math.max(round2(target - saved - confirmed), 0);
}

export function goalProgressPercent(goal: Goal): number {
  const target = goalTargetAmount(goal);
  if (target <= 0) return 0;
  const saved = round2(goal.savedAmount || 0) + goalConfirmedTransfersTotal(goal);
  return Math.min(100, Math.max(0, Math.round((saved / target) * 100)));
}

export function resolveComponentEffectiveDueDate(component: GoalComponent, goal: Goal): string {
  return component.dueDate || goal.dueDate;
}

export function getLastEligibleTransferDate(dueDateStr: string): Date {
  const due = parseLocalDateStr(dueDateStr) as Date;
  const y = due.getFullYear();
  let m = due.getMonth();
  const d = due.getDate();
  if (d < 2) m -= 1;
  return new Date(y, m, 2);
}

export function getUpcomingEligibleTransferDates(dueDateStr: string, now: Date): Date[] {
  const last = getLastEligibleTransferDate(dueDateStr);
  const today = cashflowDateOnly(now);
  let firstCandidate = new Date(today.getFullYear(), today.getMonth(), 2);
  if (firstCandidate.getTime() < today.getTime()) firstCandidate = new Date(today.getFullYear(), today.getMonth() + 1, 2);
  const dates: Date[] = [];
  let cursor = firstCandidate;
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 2);
  }
  return dates;
}

export function getReminderEligibleTransferDates(dueDateStr: string, now: Date): Date[] {
  const last = getLastEligibleTransferDate(dueDateStr);
  const today = cashflowDateOnly(now);
  if (today.getTime() > last.getTime()) return [];
  if (today.getDate() < 2) return getUpcomingEligibleTransferDates(dueDateStr, now);
  const dates: Date[] = [today];
  let cursor = new Date(today.getFullYear(), today.getMonth() + 1, 2);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 2);
  }
  return dates;
}

export type PerDateAmount = { readonly date: Date; readonly amount: number };

export type DeadlineSchedule = {
  readonly remaining: number;
  readonly dueDate: string;
  readonly isCompleted: boolean;
  readonly isOverdue: boolean;
  readonly eligibleDates: readonly Date[];
  readonly suggestedMonthly: number | null;
  readonly perDateAmounts: readonly PerDateAmount[];
};

export function buildDeadlineScheduleFromDates(remaining: number, dueDateStr: string, eligibleDates: readonly Date[]): DeadlineSchedule {
  const isCompleted = remaining <= 0;
  const isOverdue = !isCompleted && eligibleDates.length === 0;
  let suggestedMonthly: number | null = null;
  const perDateAmounts: PerDateAmount[] = [];
  if (!isCompleted && !isOverdue) {
    suggestedMonthly = Math.ceil(remaining / eligibleDates.length);
    let runningRemaining = remaining;
    for (let i = 0; i < eligibleDates.length; i++) {
      const isLast = i === eligibleDates.length - 1;
      let amt = isLast ? runningRemaining : Math.min(suggestedMonthly, runningRemaining);
      amt = Math.max(round2(amt), 0);
      perDateAmounts.push({ date: eligibleDates[i] as Date, amount: amt });
      runningRemaining = round2(runningRemaining - amt);
    }
  }
  return { remaining, dueDate: dueDateStr, isCompleted, isOverdue, eligibleDates, suggestedMonthly, perDateAmounts };
}

export type DeadlineScheduler = (remaining: number, dueDateStr: string) => DeadlineSchedule;

export function buildDeadlineSchedule(remaining: number, dueDateStr: string, now: Date): DeadlineSchedule {
  const isCompleted = remaining <= 0;
  const eligibleDates = isCompleted ? [] : getUpcomingEligibleTransferDates(dueDateStr, now);
  return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
}

export function buildReminderDeadlineSchedule(remaining: number, dueDateStr: string, now: Date): DeadlineSchedule {
  const isCompleted = remaining <= 0;
  const eligibleDates = isCompleted ? [] : getReminderEligibleTransferDates(dueDateStr, now);
  return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
}

export type FundingBucket = {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
  readonly saved: number;
  readonly remaining: number;
  readonly dueDate: string;
  readonly isCompleted: boolean;
  readonly isOverdue: boolean;
  readonly eligibleDates: readonly Date[];
  readonly suggestedMonthly: number | null;
  readonly perDateAmounts: readonly PerDateAmount[];
};

export type GoalFunding = {
  readonly target: number;
  readonly saved: number;
  readonly confirmed: number;
  readonly remaining: number;
  readonly isCompleted: boolean;
  readonly isOverdue: boolean;
  readonly effectiveDueDate: string;
  readonly buckets: readonly FundingBucket[];
  readonly mergedPerDateAmounts: readonly PerDateAmount[];
  readonly nextTransferDate: Date | null;
  readonly nextTransferAmount: number | null;
};

export function buildGoalFundingBuckets(goal: Goal, deadlineScheduler: DeadlineScheduler): GoalFunding {
  const target = goalTargetAmount(goal);
  const saved = round2(goal.savedAmount || 0);
  const confirmed = goalConfirmedTransfersTotal(goal);
  const remaining = goalRemainingAmount(goal);
  const pool = round2(saved + confirmed);

  const rawBuckets: { key: string; label: string; amount: number; dueDate: string }[] = [];
  if (goal.components && goal.components.length > 0) {
    for (const c of goal.components) {
      rawBuckets.push({ key: c.id, label: c.name, amount: c.amount, dueDate: resolveComponentEffectiveDueDate(c, goal) });
    }
  } else {
    rawBuckets.push({ key: 'goal', label: goal.title, amount: target, dueDate: goal.dueDate });
  }
  rawBuckets.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  let poolRemaining = pool;
  const buckets: FundingBucket[] = [];
  for (const rb of rawBuckets) {
    const allocated = round2(Math.max(0, Math.min(rb.amount, poolRemaining)));
    poolRemaining = round2(poolRemaining - allocated);
    const bucketRemaining = Math.max(round2(rb.amount - allocated), 0);
    const sched = deadlineScheduler(bucketRemaining, rb.dueDate);
    buckets.push({
      key: rb.key,
      label: rb.label,
      amount: rb.amount,
      saved: allocated,
      remaining: sched.remaining,
      dueDate: rb.dueDate,
      isCompleted: sched.isCompleted,
      isOverdue: sched.isOverdue,
      eligibleDates: sched.eligibleDates,
      suggestedMonthly: sched.suggestedMonthly,
      perDateAmounts: sched.perDateAmounts,
    });
  }

  const isCompleted = remaining <= 0;
  const isOverdue = buckets.some((b) => b.isOverdue);

  const mergedMap: Record<string, { date: Date; amount: number }> = {};
  const mergedKeys: string[] = [];
  for (const b of buckets) {
    for (const pd of b.perDateAmounts) {
      const dk = cashflowDateKey(pd.date);
      if (!(dk in mergedMap)) {
        mergedMap[dk] = { date: pd.date, amount: 0 };
        mergedKeys.push(dk);
      }
      const entry = mergedMap[dk] as { date: Date; amount: number };
      entry.amount = round2(entry.amount + pd.amount);
    }
  }
  mergedKeys.sort();
  const mergedPerDateAmounts = mergedKeys.map((k) => mergedMap[k] as PerDateAmount);

  let effectiveDueDate = goal.dueDate;
  for (const b of buckets) {
    if (b.remaining > 0) {
      effectiveDueDate = b.dueDate;
      break;
    }
  }

  return {
    target,
    saved,
    confirmed,
    remaining,
    isCompleted,
    isOverdue,
    effectiveDueDate,
    buckets,
    mergedPerDateAmounts,
    nextTransferDate: mergedPerDateAmounts.length ? (mergedPerDateAmounts[0] as PerDateAmount).date : null,
    nextTransferAmount: mergedPerDateAmounts.length ? (mergedPerDateAmounts[0] as PerDateAmount).amount : null,
  };
}

/** Goals card view ("next upcoming 2nd" cadence). */
export function buildGoalScheduleInfo(goal: Goal, now: Date): GoalFunding {
  return buildGoalFundingBuckets(goal, (r, d) => buildDeadlineSchedule(r, d, now));
}

/** Reminder view ("today is immediate" cadence). */
export function buildGoalReminderScheduleInfo(goal: Goal, now: Date): GoalFunding {
  return buildGoalFundingBuckets(goal, (r, d) => buildReminderDeadlineSchedule(r, d, now));
}

/** Treated period: the calendar month of today, 'YYYY-MM'. */
export function getCurrentReminderPeriod(now: Date): string {
  return todayStr(now).slice(0, 7);
}

export function isGoalHandledForPeriod(goal: Goal, period: string): boolean {
  for (const rec of goal.confirmedTransfers || []) {
    if (!(rec.amount > 0)) continue;
    const rp = (rec as { reminderPeriod?: unknown }).reminderPeriod;
    const recPeriod = typeof rp === 'string' && rp ? rp : (rec.date || '').slice(0, 7);
    if (recPeriod === period) return true;
  }
  return false;
}

export type GoalReminderInfo = {
  readonly goal: Goal;
  readonly target: number;
  readonly saved: number;
  readonly confirmed: number;
  readonly remaining: number;
  readonly buckets: readonly FundingBucket[];
  /** Overdue buckets' remaining money — kept separate from today's regular contribution. */
  readonly overdueAmount: number;
  readonly todayContribution: number;
  readonly suggestedTotal: number;
  readonly remainingAfterSuggested: number;
};

export function buildGoalReminderInfo(goal: Goal, now: Date): GoalReminderInfo {
  const funding = buildGoalReminderScheduleInfo(goal, now);
  const todayKey = cashflowDateKey(cashflowDateOnly(now));
  let overdueAmount = 0;
  let todayContribution = 0;
  for (const b of funding.buckets) {
    if (b.isCompleted) continue;
    if (b.isOverdue) overdueAmount = round2(overdueAmount + b.remaining);
    else if (b.perDateAmounts.length && cashflowDateKey((b.perDateAmounts[0] as PerDateAmount).date) === todayKey) {
      todayContribution = round2(todayContribution + (b.perDateAmounts[0] as PerDateAmount).amount);
    }
  }
  const suggestedTotal = round2(overdueAmount + todayContribution);
  return {
    goal,
    target: funding.target,
    saved: funding.saved,
    confirmed: funding.confirmed,
    remaining: funding.remaining,
    buckets: funding.buckets,
    overdueAmount,
    todayContribution,
    suggestedTotal,
    remainingAfterSuggested: Math.max(round2(funding.remaining - suggestedTotal), 0),
  };
}

export function isGoalDueForReminderNow(goal: Goal, now: Date): boolean {
  if (goal.isArchived) return false;
  const info = buildGoalReminderInfo(goal, now);
  if (info.suggestedTotal <= 0) return false;
  if (isGoalHandledForPeriod(goal, getCurrentReminderPeriod(now))) return false;
  return true;
}

/** Every active, due, not-yet-handled goal; [] when the local dataset is invalid. */
export function getGoalsDueForReminder(goalsState: GoalsState, now: Date): { goal: Goal; info: GoalReminderInfo }[] {
  if (!goalsState.valid) return [];
  const due: { goal: Goal; info: GoalReminderInfo }[] = [];
  for (const g of goalsState.goals) {
    if (g.isArchived) continue;
    const info = buildGoalReminderInfo(g, now);
    if (info.suggestedTotal <= 0) continue;
    if (isGoalHandledForPeriod(g, getCurrentReminderPeriod(now))) continue;
    due.push({ goal: g, info });
  }
  return due;
}
