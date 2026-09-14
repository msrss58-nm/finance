// The single owner of the loaded financial data set for one app run. Created
// by the composition root (no module singleton); screens read `state` and
// call these methods — they never touch the repository or SQLite.
//
// Every write follows one path: fresh read -> pure domain function (all
// validation) -> ONE atomic repository commit -> reload -> publish. Writes are
// serialised, so two taps can never interleave read-modify-write cycles, and
// a failure (validation or storage) changes nothing.
//
// The automatic end-of-commitment archive sweep (app.js runAutoArchiveSweep)
// runs once per app run, on the first load, like the Web's once per page load.

import { createStore, type ReadableStore } from '../core/store.ts';
import type { ChangeSet, FamilyFinanceDataSet, FamilyFinanceRepository, RepositoryFailure } from '../data/familyFinanceRepository.ts';
import type { ActivityEntryInput } from '../domain/activityLog.ts';
import { applyAutoArchive } from '../domain/aggregates.ts';
import { isValidAppearanceValue, type AppearanceField } from '../domain/appearance.ts';
import { addCategory, deleteCategory, editCategory } from '../domain/categoryWrites.ts';
import { todayStr } from '../domain/dates.ts';
import {
  addComponent,
  commitConfirmedTransfers,
  createGoal,
  editComponent,
  editGoal,
  GOAL_MESSAGES,
  removeComponent,
  toggleGoalArchived,
  type ComponentFormValues,
  type GoalFormValues,
  type GoalWriteResult,
  type TransferAllocation,
} from '../domain/goalWrites.ts';
import type { GoalIdGenerator } from '../domain/ids.ts';
import {
  archiveItem,
  createItem,
  deleteItem,
  editItem,
  unarchiveItem,
  type ItemFormKind,
  type ItemFormValues,
  type ItemMutation,
  type ItemWriteResult,
} from '../domain/itemWrites.ts';
import { FF_KEYS } from '../domain/keys.ts';
import { isPlainObject } from '../domain/raw.ts';
import { computeOpeningBalanceWrite, getProjectedBalanceOpeningConfig, type NotificationFlags } from '../domain/settings.ts';

export type FinanceSnapshot = {
  readonly data: FamilyFinanceDataSet;
  /** "Now" for every derived figure; refreshed by tick() and by every reload. */
  readonly now: Date;
  readonly revision: number;
  /** Titles archived by THIS run's automatic sweep (the "התחייבות הסתיימה" in-app alert). */
  readonly lastAutoArchivedTitles: readonly string[];
};

export type FinanceState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | ({ readonly status: 'ready' } & FinanceSnapshot);

export type WriteOutcome =
  | { readonly ok: true; readonly id?: string; readonly count?: number }
  | {
      readonly ok: false;
      readonly kind: 'validation';
      readonly message: string;
      readonly field: string | null;
      readonly fields: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly kind: 'failed'; readonly message: string };

export type ChangeScope = 'items' | 'categories' | 'settings' | 'goals' | 'activity' | 'all';

export type FinanceNotice = { readonly id: number; readonly text: string };

export const FINANCE_MESSAGES = {
  loadFailed: 'טעינת הנתונים נכשלה.',
  readFailed: 'קריאת הנתונים נכשלה — לא בוצע שינוי.',
  writeFailed: 'השמירה נכשלה — לא בוצע שינוי.',
  corruptStored:
    'הנתונים השמורים במכשיר פגומים, ולכן לא נשמר שינוי כדי לא לדרוס אותם. ניתן לשחזר גיבוי תקין (הגדרות ← נתונים).',
  invalidBackup: 'קובץ הגיבוי אינו תקין — לא בוצע שינוי.',
  restoreFailed: 'שחזור נכשל — הפעולה בוטלה ולא בוצע שינוי.',
  notFound: 'הפריט לא נמצא — ייתכן שכבר נמחק.',
  invalidOpening: 'יש להזין סכום ותאריך תקינים',
  invalidAppearance: 'ערך תצוגה לא מוכר',
  goalsNotCorrupt: 'נתוני היעדים תקינים — אין מה לאפס.',
} as const;

export function repositoryFailureMessage(e: RepositoryFailure): string {
  switch (e.kind) {
    case 'read':
      return FINANCE_MESSAGES.readFailed;
    case 'write':
      return FINANCE_MESSAGES.writeFailed;
    case 'corruptStored':
      return FINANCE_MESSAGES.corruptStored;
    case 'refusedInvalidGoals':
      return GOAL_MESSAGES.invalid;
    case 'invalidBackup':
      return FINANCE_MESSAGES.invalidBackup;
    case 'restoreFailed':
      return FINANCE_MESSAGES.restoreFailed;
  }
}

type Build =
  | { readonly ok: true; readonly change: ChangeSet; readonly scope: ChangeScope; readonly id?: string }
  | { readonly ok: false; readonly outcome: WriteOutcome };

const invalid = (message: string, field: string | null = null, fields: Readonly<Record<string, string>> = {}): Build => ({
  ok: false,
  outcome: { ok: false, kind: 'validation', message, field, fields },
});

function fromItemResult(r: ItemWriteResult): Build {
  if (!r.ok) return invalid(r.message, r.field);
  const change: ChangeSet = r.settingsPatch ? { items: r.items, settingsPatch: r.settingsPatch, activity: r.activity } : { items: r.items, activity: r.activity };
  return { ok: true, change, scope: 'items' };
}

function fromMutation(m: ItemMutation | null): Build {
  if (!m) return invalid(FINANCE_MESSAGES.notFound);
  return { ok: true, change: { items: m.items, activity: m.activity }, scope: 'items' };
}

function fromGoalResult(r: GoalWriteResult): Build {
  if (!r.ok) {
    const keys = Object.keys(r.errors);
    const first = keys[0];
    return invalid(r.message ?? (first !== undefined ? (r.errors[first] as string) : GOAL_MESSAGES.invalid), first ?? null, r.errors);
  }
  return { ok: true, change: { goals: r.goals }, scope: 'goals', id: r.goalId };
}

export type FinanceControllerDeps = {
  readonly repository: FamilyFinanceRepository;
  readonly clock: () => Date;
  readonly goalIds: GoalIdGenerator;
};

export class FinanceController {
  readonly #deps: FinanceControllerDeps;
  readonly #state = createStore<FinanceState>({ status: 'loading' });
  readonly #notice = createStore<FinanceNotice | null>(null);
  readonly #listeners = new Set<(scope: ChangeScope) => void>();
  #queue: Promise<void> = Promise.resolve();
  #sweepAttempted = false;
  #autoArchivedTitles: readonly string[] = [];
  #revision = 0;
  #noticeId = 0;

  constructor(deps: FinanceControllerDeps) {
    this.#deps = deps;
  }

  get state(): ReadableStore<FinanceState> {
    return this.#state;
  }

  /** One-shot, non-blocking notices (the auto-archive toast). */
  get notice(): ReadableStore<FinanceNotice | null> {
    return this.#notice;
  }

  dismissNotice(): void {
    this.#notice.set(null);
  }

  /** Notified after every successful write, with what it changed. */
  onChange(listener: (scope: ChangeScope) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** First load of the run (includes the auto-archive sweep), or a plain reload afterwards. */
  load(): Promise<void> {
    return this.#enqueue(() => this.#load());
  }

  /** Re-reads the data set (e.g. after returning to the foreground). */
  refresh(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#reloadAndPublish(this.#deps.clock());
    });
  }

  /** Advances "now" (a new day, or at least a minute) without touching storage. */
  tick(): void {
    const s = this.#state.get();
    if (s.status !== 'ready') return;
    const now = this.#deps.clock();
    if (todayStr(now) === todayStr(s.now) && now.getTime() - s.now.getTime() < 60_000) return;
    this.#state.set({ ...s, now });
  }

  // ----- items -------------------------------------------------------------

  createItem(kind: ItemFormKind, categoryKey: string | null, values: ItemFormValues): Promise<WriteOutcome> {
    return this.#write((d, now) =>
      fromItemResult(
        createItem({
          items: d.items,
          kind,
          categoryKey,
          values,
          categoryConfig: d.categoryConfig,
          opening: getProjectedBalanceOpeningConfig(d.settings),
          now,
        }),
      ),
    );
  }

  editItem(id: unknown, values: ItemFormValues): Promise<WriteOutcome> {
    return this.#write((d, now) =>
      fromItemResult(
        editItem({ items: d.items, id, values, categoryConfig: d.categoryConfig, opening: getProjectedBalanceOpeningConfig(d.settings), now }),
      ),
    );
  }

  archiveItem(id: unknown): Promise<WriteOutcome> {
    return this.#write((d, now) => fromMutation(archiveItem(d.items, id, now)));
  }

  unarchiveItem(id: unknown): Promise<WriteOutcome> {
    return this.#write((d) => fromMutation(unarchiveItem(d.items, id)));
  }

  deleteItem(id: unknown): Promise<WriteOutcome> {
    return this.#write((d) => fromMutation(deleteItem(d.items, id)));
  }

  // ----- categories & Home tiles -------------------------------------------

  addCategory(title: string, baseType: string, dayText: string): Promise<WriteOutcome> {
    return this.#write((d, now) => {
      const r = addCategory(d.categoryConfig, title, baseType, dayText, now.getTime());
      if (!r.ok) return invalid(r.message, r.field);
      return { ok: true, change: { categoryConfig: r.categoryConfig, activity: r.activity }, scope: 'categories', id: r.key };
    });
  }

  editCategory(key: string, label: string, dayText: string | null): Promise<WriteOutcome> {
    return this.#write((d) => {
      const r = editCategory(d.categoryConfig, key, label, dayText);
      if (!r.ok) return invalid(r.message, r.field);
      return { ok: true, change: { categoryConfig: r.categoryConfig, activity: r.activity }, scope: 'categories', id: r.key };
    });
  }

  deleteCategory(key: string): Promise<WriteOutcome> {
    return this.#write((d) => {
      const r = deleteCategory(d.categoryConfig, d.items, key);
      if (!r.ok) return invalid(r.message);
      return { ok: true, change: { categoryConfig: r.categoryConfig, activity: r.activity }, scope: 'categories' };
    });
  }

  setTileOrder(order: readonly string[]): Promise<WriteOutcome> {
    return this.#write(() => ({ ok: true, change: { tileOrder: order }, scope: 'settings' }));
  }

  setLoanBalanceView(view: 'total' | 'principal'): Promise<WriteOutcome> {
    return this.#write(() => ({ ok: true, change: { loanBalanceView: view }, scope: 'settings' }));
  }

  // ----- settings ------------------------------------------------------------

  setAppearance(field: AppearanceField, value: string): Promise<WriteOutcome> {
    return this.#write(() => {
      if (!isValidAppearanceValue(field, value)) return invalid(FINANCE_MESSAGES.invalidAppearance);
      return { ok: true, change: { settingsPatch: { [field]: value } }, scope: 'settings' };
    });
  }

  /** In-app alert toggles (app.js toggleNotificationSetting); unknown stored notification keys survive. */
  setInAppAlert(key: keyof NotificationFlags, enabled: boolean): Promise<WriteOutcome> {
    return this.#write((d) => {
      let stored: Record<string, unknown> = {};
      const raw = d.raw[FF_KEYS.settings];
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isPlainObject(parsed) && isPlainObject(parsed.notifications)) stored = parsed.notifications;
        } catch {
          stored = {};
        }
      }
      return {
        ok: true,
        change: { settingsPatch: { notifications: { ...stored, ...d.settings.notifications, [key]: enabled } } },
        scope: 'settings',
      };
    });
  }

  /**
   * app.js saveProjectedBalanceOpening(): amount + date + a FRESH snapshot of
   * the cash withdrawals dated on that day, always written together. The
   * caller validated the input (validateOpeningBalanceInput) and, when one
   * already existed, obtained the user's explicit replace confirmation.
   */
  saveOpeningBalance(amount: number, dateStr: string): Promise<WriteOutcome> {
    return this.#write((d) => {
      const w = computeOpeningBalanceWrite(amount, dateStr, d.items);
      if (!w) return invalid(FINANCE_MESSAGES.invalidOpening);
      return { ok: true, change: { settingsPatch: w }, scope: 'settings' };
    });
  }

  // ----- goals -----------------------------------------------------------------

  createGoal(values: GoalFormValues): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => createGoal(d.goalsRaw, values, this.#deps.goalIds, now));
  }

  editGoal(goalId: string, values: GoalFormValues): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => editGoal(d.goalsRaw, goalId, values, now));
  }

  addComponent(goalId: string, values: ComponentFormValues): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => addComponent(d.goalsRaw, goalId, values, this.#deps.goalIds, now));
  }

  editComponent(goalId: string, componentId: string, values: ComponentFormValues): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => editComponent(d.goalsRaw, goalId, componentId, values, now));
  }

  removeComponent(goalId: string, componentId: string): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => removeComponent(d.goalsRaw, goalId, componentId, now));
  }

  toggleGoalArchived(goalId: string): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => toggleGoalArchived(d.goalsRaw, goalId, now));
  }

  /** The reminder's "I transferred" confirmation: one ledger record per positive allocation. */
  commitTransfers(allocations: readonly TransferAllocation[]): Promise<WriteOutcome> {
    return this.#goalWrite((d, now) => commitConfirmedTransfers(d.goalsRaw, allocations, this.#deps.goalIds, now));
  }

  /** app.js confirmResetGoalsIntegrity(): the explicit recovery that replaces ONLY a corrupt goals value with []. */
  resetCorruptGoals(): Promise<WriteOutcome> {
    return this.#write((d) => {
      if (d.goalsState.valid) return invalid(FINANCE_MESSAGES.goalsNotCorrupt);
      return { ok: true, change: { goals: [], allowReplacingInvalidGoals: true }, scope: 'goals' };
    });
  }

  // ----- data ------------------------------------------------------------------

  appendActivity(entries: readonly ActivityEntryInput[]): Promise<WriteOutcome> {
    return this.#write(() => ({ ok: true, change: { activity: entries }, scope: 'activity' }));
  }

  /** Validate-before-write, atomic restore (repository.restoreBackup). */
  restoreBackup(backup: unknown, deleteExistingGoals: boolean): Promise<WriteOutcome> {
    return this.#enqueue(async () => {
      const now = this.#deps.clock();
      const r = await this.#deps.repository.restoreBackup(backup, { deleteExistingGoals, now });
      if (!r.ok) return { ok: false, kind: 'failed', message: repositoryFailureMessage(r.error) } as const;
      this.#autoArchivedTitles = [];
      await this.#reloadAndPublish(now);
      this.#emit('all');
      return { ok: true, count: r.value.writtenKeys.length } as const;
    });
  }

  /** app.js confirmResetAllData(): every family_finance_* key, in one transaction. */
  resetAllData(): Promise<WriteOutcome> {
    return this.#enqueue(async () => {
      const now = this.#deps.clock();
      const r = await this.#deps.repository.resetAllData();
      if (!r.ok) return { ok: false, kind: 'failed', message: repositoryFailureMessage(r.error) } as const;
      this.#autoArchivedTitles = [];
      await this.#reloadAndPublish(now);
      this.#emit('all');
      return { ok: true, count: r.value.removedKeys } as const;
    });
  }

  // ----- internals ---------------------------------------------------------------

  #goalWrite(build: (d: FamilyFinanceDataSet, now: Date) => GoalWriteResult): Promise<WriteOutcome> {
    return this.#write((d, now) => (d.goalsState.valid ? fromGoalResult(build(d, now)) : invalid(GOAL_MESSAGES.invalid)));
  }

  #write(build: (d: FamilyFinanceDataSet, now: Date) => Build): Promise<WriteOutcome> {
    return this.#enqueue(async (): Promise<WriteOutcome> => {
      const now = this.#deps.clock();
      const loaded = await this.#deps.repository.loadDataSet();
      if (!loaded.ok) return { ok: false, kind: 'failed', message: FINANCE_MESSAGES.readFailed };
      const built = build(loaded.value, now);
      if (!built.ok) return built.outcome;
      const committed = await this.#deps.repository.commit(built.change, now);
      if (!committed.ok) return { ok: false, kind: 'failed', message: repositoryFailureMessage(committed.error) };
      await this.#reloadAndPublish(now);
      this.#emit(built.scope);
      return built.id === undefined ? { ok: true } : { ok: true, id: built.id };
    });
  }

  async #load(): Promise<void> {
    const now = this.#deps.clock();
    const loaded = await this.#deps.repository.loadDataSet();
    if (!loaded.ok) {
      this.#state.set({ status: 'failed', message: FINANCE_MESSAGES.loadFailed });
      return;
    }
    if (!this.#sweepAttempted) {
      this.#sweepAttempted = true;
      const d = loaded.value;
      if (!d.corruptKeys.includes(FF_KEYS.data)) {
        const swept = applyAutoArchive(d.items, now, d.categoryConfig);
        if (swept.archivedCount > 0) {
          const committed = await this.#deps.repository.commit(
            { items: swept.items, activity: swept.archivedTitles.map((t) => ({ action: 'auto_archive', detail: t })) },
            now,
          );
          if (committed.ok) {
            this.#autoArchivedTitles = swept.archivedTitles;
            this.#noticeId += 1;
            this.#notice.set({ id: this.#noticeId, text: '✓ ' + swept.archivedCount + ' התחייבויות הסתיימו והועברו לארכיון' });
            await this.#reloadAndPublish(now);
            return;
          }
        }
      }
    }
    this.#publish(loaded.value, now);
  }

  async #reloadAndPublish(now: Date): Promise<void> {
    const loaded = await this.#deps.repository.loadDataSet();
    if (loaded.ok) this.#publish(loaded.value, now);
    else this.#state.set({ status: 'failed', message: FINANCE_MESSAGES.loadFailed });
  }

  #publish(data: FamilyFinanceDataSet, now: Date): void {
    this.#revision += 1;
    this.#state.set({ status: 'ready', data, now, revision: this.#revision, lastAutoArchivedTitles: this.#autoArchivedTitles });
  }

  #emit(scope: ChangeScope): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(scope);
      } catch {
        // a listener's failure never affects the write that already succeeded
      }
    }
  }

  #enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work, work);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
