// Goals screen view model (pure) — app.js buildGoalCardHtml() semantics.
// Funding, FIFO allocation, overdue buckets and the transfer plan come from
// buildGoalScheduleInfo() (Stage 2); nothing is recalculated here.

import { parseLocalDateStr } from '../domain/dates.ts';
import type { Goal } from '../domain/goals.ts';
import {
  buildGoalScheduleInfo,
  goalConfirmedTransfersTotal,
  goalProgressPercent,
  goalRemainingAmount,
  goalTargetAmount,
  resolveComponentEffectiveDueDate,
} from '../domain/goalsPlanning.ts';
import { round2 } from '../domain/numbers.ts';
import type { FinanceSnapshot } from '../state/financeController.ts';
import { formatAmount, formatDate } from './format.ts';

export type GoalComponentRow = {
  readonly id: string;
  readonly name: string;
  readonly dateText: string;
  readonly inherited: boolean;
  readonly early: boolean;
  readonly funding: 'funded' | 'overdue' | null;
  readonly remainingText: string | null;
  readonly amountText: string;
};

export type GoalCardView = {
  readonly id: string;
  readonly title: string;
  readonly badge: 'completed' | 'overdue' | null;
  readonly targetText: string;
  readonly remainingText: string;
  readonly savedText: string;
  readonly dueText: string;
  readonly progress: number;
  readonly isArchived: boolean;
  readonly hasComponents: boolean;
  readonly components: readonly GoalComponentRow[];
  readonly componentsTotalText: string | null;
  readonly completedNote: string | null;
  readonly overdueNotes: readonly string[];
  readonly nextTransferNote: string | null;
  readonly noScheduleNote: string | null;
  /** The whole remaining transfer plan (every eligible 2nd of the month), merged across components. */
  readonly plan: readonly { readonly key: string; readonly dateText: string; readonly amountText: string }[];
  /** Overdue money (buckets past their last eligible transfer date); null when none. */
  readonly overdueAmountText: string | null;
  readonly confirmedTotalText: string | null;
  readonly confirmedTransfers: readonly { readonly key: string; readonly dateText: string; readonly amountText: string }[];
};

export type GoalsView = { readonly valid: boolean; readonly active: readonly GoalCardView[]; readonly archived: readonly GoalCardView[] };

const dateLabel = (dateStr: string): string => {
  const d = parseLocalDateStr(dateStr);
  return d ? formatDate(d) : '';
};

export function buildGoalCard(goal: Goal, now: Date): GoalCardView {
  const target = goalTargetAmount(goal);
  const confirmed = goalConfirmedTransfersTotal(goal);
  const saved = round2(goal.savedAmount || 0) + confirmed;
  const remaining = goalRemainingAmount(goal);
  const schedule = buildGoalScheduleInfo(goal, now);
  const hasRealComponents = goal.components.length > 1;

  const components: GoalComponentRow[] = goal.components.map((c) => {
    const inherited = !c.dueDate;
    const bucket = schedule.buckets.find((b) => b.key === c.id) ?? null;
    let funding: GoalComponentRow['funding'] = null;
    let remainingText: string | null = null;
    if (bucket) {
      if (bucket.isCompleted) funding = 'funded';
      else if (bucket.isOverdue) {
        funding = 'overdue';
        remainingText = 'נותר: ' + formatAmount(bucket.remaining);
      } else if (bucket.saved > 0) remainingText = 'נותר: ' + formatAmount(bucket.remaining);
    }
    return {
      id: c.id,
      name: c.name,
      dateText: dateLabel(resolveComponentEffectiveDueDate(c, goal)),
      inherited,
      early: !inherited && (c.dueDate as string) < goal.dueDate,
      funding,
      remainingText,
      amountText: formatAmount(c.amount),
    };
  });

  const overdueNotes: string[] = [];
  let nextTransferNote: string | null = null;
  let overdueAmount = 0;
  if (!schedule.isCompleted) {
    for (const b of schedule.buckets) {
      if (!b.isOverdue) continue;
      overdueAmount = round2(overdueAmount + b.remaining);
      overdueNotes.push(
        '⚠️ ' + (hasRealComponents ? b.label + ' — ' : '') + 'באיחור (' + formatAmount(b.remaining) + ' נדרש עד ' + dateLabel(b.dueDate) + ', לא נותרו מועדי העברה).',
      );
    }
    if (schedule.nextTransferAmount !== null && schedule.nextTransferAmount > 0 && schedule.nextTransferDate) {
      nextTransferNote = '💡 העברה קרובה מומלצת: ' + formatAmount(schedule.nextTransferAmount) + ' ב-' + formatDate(schedule.nextTransferDate) + '.';
    }
  }

  return {
    id: goal.id,
    title: goal.title,
    badge: schedule.isCompleted ? 'completed' : schedule.isOverdue ? 'overdue' : null,
    targetText: formatAmount(target),
    remainingText: formatAmount(remaining),
    savedText: formatAmount(saved),
    dueText: dateLabel(goal.dueDate),
    progress: goalProgressPercent(goal),
    isArchived: goal.isArchived,
    hasComponents: goal.components.length > 0,
    components,
    componentsTotalText: goal.components.length > 0 ? formatAmount(target) : null,
    completedNote: schedule.isCompleted ? '✅ היעד הושלם — לא נדרשת העברה נוספת.' : null,
    overdueNotes,
    nextTransferNote,
    noScheduleNote: !schedule.isCompleted && overdueNotes.length === 0 && nextTransferNote === null ? 'אין מידע תזמון להצגה.' : null,
    plan: schedule.mergedPerDateAmounts.map((p) => ({ key: String(p.date.getTime()), dateText: formatDate(p.date), amountText: formatAmount(p.amount) })),
    overdueAmountText: overdueAmount > 0 ? formatAmount(overdueAmount) : null,
    confirmedTotalText: confirmed > 0 ? formatAmount(confirmed) : null,
    confirmedTransfers: goal.confirmedTransfers.map((t, i) => ({ key: String(i), dateText: dateLabel(t.date), amountText: formatAmount(t.amount) })),
  };
}

export function buildGoalsView(s: FinanceSnapshot): GoalsView {
  const state = s.data.goalsState;
  if (!state.valid) return { valid: false, active: [], archived: [] };
  const cards = state.goals.map((g) => buildGoalCard(g, s.now));
  return { valid: true, active: cards.filter((c) => !c.isArchived), archived: cards.filter((c) => c.isArchived) };
}
