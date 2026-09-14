// The consolidated monthly Goals reminder dialog (app.js Milestone 5:
// checkAndShowGoalsReminder / postponeGoalsReminder /
// confirmReminderFullTransfer / confirmReminderCustomAllocation).
//
// Session-only, in-memory state, owned by the composition root so it survives
// the lock. It opens by itself only (1) once at the start of the run and (2)
// right after a new goal is created — never on ordinary navigation. Postpone
// writes nothing; a confirmation records what the user says they transferred
// (the app never moves money). Suppression is per goal and per reminder
// period, and never persisted: a new app run may remind again.
//
// The amounts come only from the domain (getGoalsDueForReminder); nothing is
// recalculated here.

import { createStore, type ReadableStore } from '../core/store.ts';
import type { Goal } from '../domain/goals.ts';
import { getCurrentReminderPeriod, getGoalsDueForReminder, type GoalReminderInfo } from '../domain/goalsPlanning.ts';
import { parseReminderAllocations, type TransferAllocation } from '../domain/goalWrites.ts';
import type { FinanceController } from './financeController.ts';

export type ReminderDue = { readonly goal: Goal; readonly info: GoalReminderInfo };

export type ReminderDialogState =
  | { readonly open: false }
  | {
      readonly open: true;
      readonly mode: 'summary' | 'custom';
      /** Snapshot taken when the dialog opened. */
      readonly due: readonly ReminderDue[];
      /** goalId -> the text currently in that goal's custom-amount field. */
      readonly custom: Readonly<Record<string, string>>;
      readonly error: string | null;
      readonly writing: boolean;
    };

type OpenState = Extract<ReminderDialogState, { open: true }>;

const CLOSED: ReminderDialogState = { open: false };

export class GoalsReminderSession {
  readonly #finance: FinanceController;
  readonly #clock: () => Date;
  readonly #state = createStore<ReminderDialogState>(CLOSED);
  readonly #suppressed = new Set<string>();
  #startupChecked = false;

  constructor(finance: FinanceController, clock: () => Date) {
    this.#finance = finance;
    this.#clock = clock;
  }

  get state(): ReadableStore<ReminderDialogState> {
    return this.#state;
  }

  /** The once-per-run automatic check; a no-op until the data is loaded. */
  checkAtStartup(): void {
    if (this.#startupChecked || this.#finance.state.get().status !== 'ready') return;
    this.#startupChecked = true;
    this.check();
  }

  /** Opens the dialog when any not-yet-suppressed goal is due now. */
  check(): void {
    if (this.#state.get().open) return;
    const s = this.#finance.state.get();
    if (s.status !== 'ready' || !s.data.goalsState.valid) return;
    const now = this.#clock();
    const due = getGoalsDueForReminder(s.data.goalsState, now).filter((d) => !this.#suppressed.has(this.#token(d.goal.id, now)));
    if (due.length === 0) return;
    this.#state.set({ open: true, mode: 'summary', due, custom: {}, error: null, writing: false });
  }

  /** "הזכר לי מאוחר יותר" and Back: writes nothing, only closes for this session. */
  postpone(): void {
    const s = this.#state.get();
    if (!s.open || s.writing) return;
    this.#suppress(s.due);
    this.#state.set(CLOSED);
  }

  switchToCustom(): void {
    const s = this.#state.get();
    if (!s.open || s.writing) return;
    const custom: Record<string, string> = {};
    for (const d of s.due) custom[d.goal.id] = s.custom[d.goal.id] ?? String(d.info.suggestedTotal);
    this.#state.set({ ...s, mode: 'custom', custom, error: null });
  }

  backToSummary(): void {
    const s = this.#state.get();
    if (!s.open || s.writing) return;
    this.#state.set({ ...s, mode: 'summary', error: null });
  }

  setCustomAmount(goalId: string, text: string): void {
    const s = this.#state.get();
    if (!s.open || s.writing) return;
    this.#state.set({ ...s, custom: { ...s.custom, [goalId]: text } });
  }

  /** "העברתי את הסכום המומלץ": exactly each goal's already-calculated suggested total. */
  async confirmFull(): Promise<void> {
    const s = this.#state.get();
    if (!s.open || s.writing || s.due.length === 0) return;
    const allocations = s.due.filter((d) => d.info.suggestedTotal > 0).map((d) => ({ goalId: d.goal.id, amount: d.info.suggestedTotal }));
    await this.#commit(s, allocations);
  }

  /** "אישור הקצאה": validated per goal; a 0 leaves that goal pending. */
  async confirmCustom(): Promise<void> {
    const s = this.#state.get();
    if (!s.open || s.writing || s.due.length === 0) return;
    const parsed = parseReminderAllocations(s.due.map((d) => ({ goalId: d.goal.id, text: s.custom[d.goal.id] })));
    if (!parsed.ok) {
      this.#state.set({ ...s, error: parsed.message });
      return;
    }
    await this.#commit(s, parsed.allocations);
  }

  async #commit(s: OpenState, allocations: readonly TransferAllocation[]): Promise<void> {
    this.#state.set({ ...s, writing: true, error: null });
    const outcome = await this.#finance.commitTransfers(allocations);
    const current = this.#state.get();
    if (!current.open) return;
    if (!outcome.ok) {
      this.#state.set({ ...current, writing: false, error: outcome.message });
      return;
    }
    this.#suppress(current.due);
    this.#state.set(CLOSED);
  }

  #suppress(due: readonly ReminderDue[]): void {
    const now = this.#clock();
    for (const d of due) this.#suppressed.add(this.#token(d.goal.id, now));
  }

  #token(goalId: string, now: Date): string {
    return getCurrentReminderPeriod(now) + '::' + goalId;
  }
}
