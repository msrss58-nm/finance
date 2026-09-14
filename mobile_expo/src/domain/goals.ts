// Goals — strict validation (app.js normalizeComponent / normalizeGoal /
// isValidGoalsArrayStrict / loadGoalsState), ported verbatim, including the
// plain-object duplicate-id maps (so ids behave exactly as in the Web app).

import { isValidCanonicalIsoTimestamp, isValidDateStr } from './dates.ts';
import { round2 } from './numbers.ts';

export type GoalComponent = { readonly id: string; readonly name: string; readonly amount: number; readonly dueDate: string | null };

export type ConfirmedTransfer =
  | { readonly date: string; readonly amount: number }
  | {
      readonly date: string;
      readonly amount: number;
      readonly id: string;
      readonly confirmedAt: string;
      readonly reminderPeriod: string;
      readonly source: string;
    };

export type Goal = {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string;
  readonly targetAmount: number;
  readonly savedAmount: number;
  readonly components: readonly GoalComponent[];
  readonly isArchived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedTransfers: readonly ConfirmedTransfer[];
};

/** valid:false means the ENTIRE local dataset is untrusted; `raw` keeps the exact stored string. */
export type GoalsState = { readonly valid: boolean; readonly raw: string | null; readonly goals: readonly Goal[] };

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeComponent(raw: unknown): GoalComponent | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string') return null;
  const name = raw.name.trim();
  if (!name) return null;
  if (typeof raw.amount !== 'number' || !isFinite(raw.amount) || raw.amount <= 0) return null;
  let dueDate: string | null = null;
  if (raw.dueDate !== null && raw.dueDate !== undefined) {
    if (!isValidDateStr(raw.dueDate)) return null;
    dueDate = raw.dueDate as string;
  }
  return { id: raw.id, name, amount: round2(raw.amount), dueDate };
}

export function normalizeGoal(raw: unknown): Goal | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.title !== 'string') return null;
  const title = raw.title.trim();
  if (!title) return null;
  if (!isValidDateStr(raw.dueDate)) return null;
  if (typeof raw.isArchived !== 'boolean') return null;
  if (!isValidCanonicalIsoTimestamp(raw.createdAt)) return null;
  if (!isValidCanonicalIsoTimestamp(raw.updatedAt)) return null;
  if (new Date(raw.updatedAt as string).getTime() < new Date(raw.createdAt as string).getTime()) return null;
  if (!Array.isArray(raw.components)) return null;
  if (!Array.isArray(raw.confirmedTransfers)) return null;

  const components: GoalComponent[] = [];
  const seenComponentIds: Record<string, unknown> = {};
  for (const rc of raw.components) {
    const comp = normalizeComponent(rc);
    if (!comp) return null;
    if (seenComponentIds[comp.id]) return null;
    seenComponentIds[comp.id] = true;
    components.push(comp);
  }

  let targetAmount: number;
  if (components.length > 0) {
    let sum = 0;
    for (const c of components) sum = round2(sum + c.amount);
    if (typeof raw.targetAmount !== 'number' || !isFinite(raw.targetAmount)) return null;
    if (round2(raw.targetAmount) !== sum) return null;
    targetAmount = sum;
  } else {
    if (typeof raw.targetAmount !== 'number' || !isFinite(raw.targetAmount) || raw.targetAmount <= 0) return null;
    targetAmount = round2(raw.targetAmount);
  }

  if (typeof raw.savedAmount !== 'number' || !isFinite(raw.savedAmount) || raw.savedAmount < 0) return null;
  const savedAmount = round2(raw.savedAmount);

  const confirmedTransfers: ConfirmedTransfer[] = [];
  for (const ct of raw.confirmedTransfers) {
    if (!isObj(ct)) return null;
    if (typeof ct.amount !== 'number' || !isFinite(ct.amount) || ct.amount <= 0) return null;
    if (typeof ct.date !== 'string' || !isValidDateStr(ct.date)) return null;
    const newFieldCount =
      (ct.id !== undefined ? 1 : 0) + (ct.confirmedAt !== undefined ? 1 : 0) + (ct.reminderPeriod !== undefined ? 1 : 0) + (ct.source !== undefined ? 1 : 0);
    if (newFieldCount === 0) {
      confirmedTransfers.push({ date: ct.date, amount: round2(ct.amount) });
    } else if (newFieldCount === 4) {
      if (typeof ct.id !== 'string' || !ct.id) return null;
      if (!isValidCanonicalIsoTimestamp(ct.confirmedAt)) return null;
      if (typeof ct.reminderPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(ct.reminderPeriod)) return null;
      if (ct.reminderPeriod !== ct.date.slice(0, 7)) return null;
      if (ct.source !== 'goals_reminder') return null;
      confirmedTransfers.push({
        date: ct.date,
        amount: round2(ct.amount),
        id: ct.id,
        confirmedAt: ct.confirmedAt as string,
        reminderPeriod: ct.reminderPeriod,
        source: ct.source,
      });
    } else {
      return null;
    }
  }

  return {
    id: raw.id,
    title,
    dueDate: raw.dueDate as string,
    targetAmount,
    savedAmount,
    components,
    isArchived: raw.isArchived,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    confirmedTransfers,
  };
}

/** All-or-nothing: the normalized array, or null if ANY entry is invalid or any goal id repeats. */
export function isValidGoalsArrayStrict(arr: unknown): Goal[] | null {
  if (!Array.isArray(arr)) return null;
  const result: Goal[] = [];
  const seenIds: Record<string, unknown> = {};
  for (const entry of arr) {
    const g = normalizeGoal(entry);
    if (!g) return null;
    if (seenIds[g.id]) return null;
    seenIds[g.id] = true;
    result.push(g);
  }
  return result;
}

/** app.js loadGoalsState() (without the storage read). Absent key = valid empty list. */
export function loadGoalsState(raw: string | null): GoalsState {
  if (raw === null) return { valid: true, raw: null, goals: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, raw, goals: [] };
  }
  const validated = isValidGoalsArrayStrict(parsed);
  if (validated === null) return { valid: false, raw, goals: [] };
  return { valid: true, raw, goals: validated };
}
