// Goals write flows — app.js saveNewGoal(), saveGoalEdit(),
// saveNewComponent(), saveComponentEdit(), confirmRemoveComponent(),
// confirmArchiveToggle(), commitConfirmedTransfers() and the reminder's
// custom-allocation validation, over the RAW stored goals array.
//
// Untouched goals and components stay the exact stored objects; a changed one
// is the stored object with only the Web's fields overwritten. The candidate
// array must still pass isValidGoalsArrayStrict() before it may be written
// (the repository enforces this) — the same all-or-nothing rule the Web
// applies when it loads goals.

import { isValidCanonicalIsoTimestamp, isValidDateStr, todayStr } from './dates.ts';
import { numberInputValue, sanitizeNonNegativeAmount, sanitizePositiveAmount } from './formInput.ts';
import { normalizeComponent, normalizeGoal } from './goals.ts';
import type { GoalIdGenerator } from './ids.ts';
import { round2 } from './numbers.ts';
import { isPlainObject } from './raw.ts';

export type GoalFormValues = { readonly title: string; readonly targetAmount: string; readonly dueDate: string; readonly savedAmount: string };
export type ComponentFormValues = { readonly name: string; readonly amount: string; readonly dueDate: string };

export const GOAL_MESSAGES = {
  title: 'נא להזין שם ליעד.',
  dueDate: 'נא לבחור תאריך יעד תקין.',
  targetAmount: 'נא להזין סכום יעד תקין (גדול מאפס).',
  savedAmount: 'נא להזין סכום שנחסך תקין (0 ומעלה).',
  componentName: 'נא להזין שם לרכיב.',
  componentAmount: 'נא להזין סכום תקין (גדול מאפס).',
  componentDate: 'תאריך לא תקין.',
  notFound: 'היעד לא נמצא',
  componentNotFound: 'הרכיב לא נמצא',
  invalid: 'לא ניתן לעדכן יעדים בעוד הנתונים המקומיים פגומים.',
  noPositiveAmount: 'לא נמצא סכום חיובי לרישום.',
  reminderInvalidAmount: 'נא להזין סכום תקין (0 ומעלה) עבור כל יעד.',
  reminderAllZero:
    'כל הסכומים שהוזנו הם אפס — לא נרשמה אף העברה. ניתן להזין סכום חיובי לפחות עבור יעד אחד, או לסגור ולנסות שוב מאוחר יותר.',
} as const;

export type GoalWriteResult =
  | { readonly ok: true; readonly goals: unknown[]; readonly goalId: string }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>>; readonly message: string | null };

type Loose = Record<string, unknown>;

const failFields = (errors: Record<string, string>): GoalWriteResult => ({ ok: false, errors, message: null });
const failMessage = (message: string): GoalWriteResult => ({ ok: false, errors: {}, message });

/** "Now" as a canonical ISO timestamp, never earlier than `createdAt` (a clock set backwards must not invalidate the goal). */
function updatedTimestamp(now: Date, createdAt: unknown): string {
  const iso = now.toISOString();
  if (isValidCanonicalIsoTimestamp(createdAt) && new Date(createdAt as string).getTime() > now.getTime()) return createdAt as string;
  return iso;
}

function goalIndex(rawGoals: readonly unknown[], goalId: string): number {
  return rawGoals.findIndex((g) => isPlainObject(g) && g.id === goalId);
}

/** app.js goalTargetAmount() over stored components: the plain sum, rounded once. null if any component is invalid. */
function componentsTarget(rawComponents: readonly unknown[]): number | null {
  let sum = 0;
  for (const rc of rawComponents) {
    const c = normalizeComponent(rc);
    if (!c) return null;
    sum += c.amount;
  }
  return round2(sum);
}

function goalFieldErrors(values: GoalFormValues, requireAmount: boolean): { errors: Record<string, string>; amount: number | null; saved: number | null } {
  const errors: Record<string, string> = {};
  if (!values.title.trim()) errors.title = GOAL_MESSAGES.title;
  if (!isValidDateStr(values.dueDate)) errors.dueDate = GOAL_MESSAGES.dueDate;
  let amount: number | null = null;
  if (requireAmount) {
    amount = sanitizePositiveAmount(values.targetAmount);
    if (amount === null) errors.targetAmount = GOAL_MESSAGES.targetAmount;
  }
  const saved = sanitizeNonNegativeAmount(values.savedAmount.trim() === '' ? '0' : values.savedAmount);
  if (saved === null) errors.savedAmount = GOAL_MESSAGES.savedAmount;
  return { errors, amount, saved };
}

function existingGoalIds(rawGoals: readonly unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const g of rawGoals) if (isPlainObject(g) && typeof g.id === 'string') ids.add(g.id);
  return ids;
}

/** app.js saveNewGoal(). */
export function createGoal(rawGoals: readonly unknown[], values: GoalFormValues, ids: GoalIdGenerator, now: Date): GoalWriteResult {
  const { errors, amount, saved } = goalFieldErrors(values, true);
  if (Object.keys(errors).length > 0) return failFields(errors);
  const iso = now.toISOString();
  const id = ids.next('goal', now.getTime(), existingGoalIds(rawGoals));
  const goal = {
    id,
    title: values.title.trim(),
    dueDate: values.dueDate,
    targetAmount: amount,
    savedAmount: saved,
    components: [],
    isArchived: false,
    createdAt: iso,
    updatedAt: iso,
    confirmedTransfers: [],
  };
  return { ok: true, goals: [...rawGoals, goal], goalId: id };
}

/** app.js saveGoalEdit(): the target is editable only while the goal has no components. */
export function editGoal(rawGoals: readonly unknown[], goalId: string, values: GoalFormValues, now: Date): GoalWriteResult {
  const idx = goalIndex(rawGoals, goalId);
  if (idx === -1) return failMessage(GOAL_MESSAGES.notFound);
  const raw = rawGoals[idx] as Loose;
  const goal = normalizeGoal(raw);
  if (!goal) return failMessage(GOAL_MESSAGES.invalid);
  const hasComponents = goal.components.length > 0;
  const { errors, amount, saved } = goalFieldErrors(values, !hasComponents);
  if (Object.keys(errors).length > 0) return failFields(errors);
  const next: Loose = { ...raw };
  next.title = values.title.trim();
  next.dueDate = values.dueDate;
  next.savedAmount = saved;
  if (!hasComponents) next.targetAmount = amount;
  next.updatedAt = updatedTimestamp(now, raw.createdAt);
  const out = rawGoals.slice();
  out[idx] = next;
  return { ok: true, goals: out, goalId };
}

function componentFieldErrors(values: ComponentFormValues): { errors: Record<string, string>; amount: number | null; dueDate: string | null } {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = GOAL_MESSAGES.componentName;
  const amount = sanitizePositiveAmount(values.amount);
  if (amount === null) errors.amount = GOAL_MESSAGES.componentAmount;
  let dueDate: string | null = null;
  if (values.dueDate) {
    if (!isValidDateStr(values.dueDate)) errors.dueDate = GOAL_MESSAGES.componentDate;
    else dueDate = values.dueDate;
  }
  return { errors, amount, dueDate };
}

function withComponents(raw: Loose, components: unknown[], now: Date, keepTargetWhenEmpty: boolean): Loose | null {
  const next: Loose = { ...raw };
  next.components = components;
  if (components.length > 0 || !keepTargetWhenEmpty) {
    const target = componentsTarget(components);
    if (target === null) return null;
    next.targetAmount = target;
  }
  next.updatedAt = updatedTimestamp(now, raw.createdAt);
  return next;
}

/** app.js saveNewComponent(): the stored target follows the component sum. */
export function addComponent(rawGoals: readonly unknown[], goalId: string, values: ComponentFormValues, ids: GoalIdGenerator, now: Date): GoalWriteResult {
  const idx = goalIndex(rawGoals, goalId);
  if (idx === -1) return failMessage(GOAL_MESSAGES.notFound);
  const raw = rawGoals[idx] as Loose;
  if (!normalizeGoal(raw)) return failMessage(GOAL_MESSAGES.invalid);
  const { errors, amount, dueDate } = componentFieldErrors(values);
  if (Object.keys(errors).length > 0) return failFields(errors);
  const comps = Array.isArray(raw.components) ? (raw.components as unknown[]) : [];
  const taken = new Set<string>();
  for (const c of comps) if (isPlainObject(c) && typeof c.id === 'string') taken.add(c.id);
  const comp = { id: ids.next('comp', now.getTime(), taken), name: values.name.trim(), amount, dueDate };
  const next = withComponents(raw, [...comps, comp], now, false);
  if (!next) return failMessage(GOAL_MESSAGES.invalid);
  const out = rawGoals.slice();
  out[idx] = next;
  return { ok: true, goals: out, goalId };
}

/** app.js saveComponentEdit(). */
export function editComponent(
  rawGoals: readonly unknown[],
  goalId: string,
  componentId: string,
  values: ComponentFormValues,
  now: Date,
): GoalWriteResult {
  const idx = goalIndex(rawGoals, goalId);
  if (idx === -1) return failMessage(GOAL_MESSAGES.notFound);
  const raw = rawGoals[idx] as Loose;
  if (!normalizeGoal(raw)) return failMessage(GOAL_MESSAGES.invalid);
  const comps = (raw.components as unknown[]).slice();
  const cIdx = comps.findIndex((c) => isPlainObject(c) && c.id === componentId);
  if (cIdx === -1) return failMessage(GOAL_MESSAGES.componentNotFound);
  const { errors, amount, dueDate } = componentFieldErrors(values);
  if (Object.keys(errors).length > 0) return failFields(errors);
  const comp: Loose = { ...(comps[cIdx] as Loose) };
  comp.name = values.name.trim();
  comp.amount = amount;
  comp.dueDate = dueDate;
  comps[cIdx] = comp;
  const next = withComponents(raw, comps, now, false);
  if (!next) return failMessage(GOAL_MESSAGES.invalid);
  const out = rawGoals.slice();
  out[idx] = next;
  return { ok: true, goals: out, goalId };
}

/**
 * app.js confirmRemoveComponent(): when components remain, the target follows
 * their sum; removing the LAST one keeps the last known target (never 0).
 */
export function removeComponent(rawGoals: readonly unknown[], goalId: string, componentId: string, now: Date): GoalWriteResult {
  const idx = goalIndex(rawGoals, goalId);
  if (idx === -1) return failMessage(GOAL_MESSAGES.notFound);
  const raw = rawGoals[idx] as Loose;
  if (!normalizeGoal(raw)) return failMessage(GOAL_MESSAGES.invalid);
  const comps = raw.components as unknown[];
  const cIdx = comps.findIndex((c) => isPlainObject(c) && c.id === componentId);
  if (cIdx === -1) return failMessage(GOAL_MESSAGES.componentNotFound);
  const remaining = comps.filter((_, i) => i !== cIdx);
  const next = withComponents(raw, remaining, now, true);
  if (!next) return failMessage(GOAL_MESSAGES.invalid);
  const out = rawGoals.slice();
  out[idx] = next;
  return { ok: true, goals: out, goalId };
}

/** app.js confirmArchiveToggle(). */
export function toggleGoalArchived(rawGoals: readonly unknown[], goalId: string, now: Date): GoalWriteResult {
  const idx = goalIndex(rawGoals, goalId);
  if (idx === -1) return failMessage(GOAL_MESSAGES.notFound);
  const raw = rawGoals[idx] as Loose;
  const goal = normalizeGoal(raw);
  if (!goal) return failMessage(GOAL_MESSAGES.invalid);
  const next: Loose = { ...raw };
  next.isArchived = !goal.isArchived;
  next.updatedAt = updatedTimestamp(now, raw.createdAt);
  const out = rawGoals.slice();
  out[idx] = next;
  return { ok: true, goals: out, goalId };
}

export type TransferAllocation = { readonly goalId: string; readonly amount: number };

/**
 * app.js commitConfirmedTransfers(): one ledger record per positive
 * allocation — { id, amount, date, confirmedAt, reminderPeriod, source }.
 * The app never moves money; this records that the user did.
 */
export function commitConfirmedTransfers(
  rawGoals: readonly unknown[],
  allocations: readonly TransferAllocation[],
  ids: GoalIdGenerator,
  now: Date,
): GoalWriteResult {
  if (allocations.length === 0) return failMessage(GOAL_MESSAGES.noPositiveAmount);
  const date = todayStr(now);
  const period = date.slice(0, 7);
  const out = rawGoals.slice();
  let touched: string | null = null;
  for (const alloc of allocations) {
    if (!(alloc.amount > 0) || !isFinite(alloc.amount)) continue;
    const idx = goalIndex(out, alloc.goalId);
    if (idx === -1) continue;
    const raw = out[idx] as Loose;
    const transfers = Array.isArray(raw.confirmedTransfers) ? (raw.confirmedTransfers as unknown[]) : [];
    const next: Loose = { ...raw };
    next.confirmedTransfers = [
      ...transfers,
      { id: ids.next('ct', now.getTime()), amount: round2(alloc.amount), date, confirmedAt: now.toISOString(), reminderPeriod: period, source: 'goals_reminder' },
    ];
    next.updatedAt = updatedTimestamp(now, raw.createdAt);
    out[idx] = next;
    touched = alloc.goalId;
  }
  if (touched === null) return failMessage(GOAL_MESSAGES.noPositiveAmount);
  return { ok: true, goals: out, goalId: touched };
}

/**
 * app.js confirmReminderCustomAllocation() validation: every entered amount
 * must be a finite number >= 0 (0 = "not funded this period" and writes
 * nothing for that goal); at least one must be positive.
 */
export function parseReminderAllocations(
  entries: readonly { readonly goalId: string; readonly text: string | undefined }[],
): { readonly ok: true; readonly allocations: TransferAllocation[] } | { readonly ok: false; readonly message: string } {
  const allocations: TransferAllocation[] = [];
  let anyInvalid = false;
  for (const e of entries) {
    const raw = e.text === undefined ? '' : numberInputValue(e.text);
    const n = parseFloat(raw);
    if (raw === '' || !isFinite(n) || n < 0) {
      anyInvalid = true;
      continue;
    }
    if (n > 0) allocations.push({ goalId: e.goalId, amount: round2(n) });
  }
  if (anyInvalid) return { ok: false, message: GOAL_MESSAGES.reminderInvalidAmount };
  if (allocations.length === 0) return { ok: false, message: GOAL_MESSAGES.reminderAllZero };
  return { ok: true, allocations };
}
