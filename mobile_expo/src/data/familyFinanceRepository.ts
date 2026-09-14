// Repository over the Stage 1 KeyValueStore (Stage 2 reads, Stage 3 writes).
//
// Raw storage is authoritative: every read returns the exact stored strings
// alongside the derived domain views, and every write serialises only what
// the caller explicitly changes. No UI or platform dependency.
//
// Deliberate differences from the Web app (safer, non-destructive):
//   - a settings write merges into the STORED object, so unknown/future
//     top-level settings keys survive (the Web app re-serialises its in-memory
//     defaults-shaped object and would drop them);
//   - commit() applies every key of one user action in ONE SQLite
//     transaction (the Web writes keys one by one);
//   - commit() refuses to overwrite a stored value it cannot read (corrupt
//     items / categories / settings JSON): the Web would replace it with its
//     in-memory default and lose it. Recovery is a restore or a reset.

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import { appendActivityEntries, type ActivityEntryInput } from '../domain/activityLog.ts';
import { buildRestoreActivityLog, isValidBackupShape, planRestore } from '../domain/backup.ts';
import { resolveCategoryConfig } from '../domain/categoryConfig.ts';
import type { Goal, GoalsState } from '../domain/goals.ts';
import { isValidGoalsArrayStrict, loadGoalsState } from '../domain/goals.ts';
import { FF_KEYS } from '../domain/keys.ts';
import { isPlainObject, parseItemsRaw, type RawItem } from '../domain/raw.ts';
import { mergeAppSettings, type AppSettingsView } from '../domain/settings.ts';
import { PersistenceError, type KeyValueStore } from './keyValueStore.ts';
import { FAMILY_FINANCE_PREFIX } from './storageKeys.ts';

export type RepositoryFailureKind = 'read' | 'write' | 'refusedInvalidGoals' | 'invalidBackup' | 'restoreFailed' | 'corruptStored';
export type RepositoryFailure = { readonly kind: RepositoryFailureKind; readonly causeType?: string };

export type FamilyFinanceDataSet = {
  /** The exact stored strings (null = key absent). */
  readonly raw: Readonly<Record<string, string | null>>;
  readonly items: RawItem[];
  readonly categoryConfig: Record<string, unknown>;
  readonly settings: AppSettingsView;
  readonly goalsState: GoalsState;
  /** The stored goals array (raw objects) when the goals dataset is valid; [] when absent or invalid. */
  readonly goalsRaw: readonly unknown[];
  readonly activityLog: unknown[];
  readonly loanBalanceView: 'total' | 'principal';
  /** family_finance_* keys whose stored value is present but unreadable; commit() refuses to overwrite them. */
  readonly corruptKeys: readonly string[];
};

/** Everything one user action changes. Applied atomically by commit(). */
export type ChangeSet = {
  readonly items?: readonly RawItem[];
  readonly categoryConfig?: Readonly<Record<string, unknown>>;
  /** Merged into the stored settings object (unknown keys preserved). */
  readonly settingsPatch?: Readonly<Record<string, unknown>>;
  /** The raw goals array to store; must pass isValidGoalsArrayStrict. */
  readonly goals?: readonly unknown[];
  /** Only the explicit "reset corrupted goals" recovery may replace an invalid stored goals value. */
  readonly allowReplacingInvalidGoals?: boolean;
  readonly tileOrder?: readonly string[];
  readonly loanBalanceView?: 'total' | 'principal';
  readonly activity?: readonly ActivityEntryInput[];
};

/** app.js loadActivityLog(). */
export function parseActivityLog(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** app.js loadLoanBalanceView(): JSON form first, legacy raw string as fallback. */
export function resolveLoanBalanceView(raw: string | null): 'total' | 'principal' {
  let value: unknown;
  try {
    value = JSON.parse(raw as string);
  } catch {
    value = raw;
  }
  return value === 'principal' ? 'principal' : 'total';
}

function failure(kind: RepositoryFailureKind, e: unknown): RepositoryFailure {
  return { kind, causeType: e instanceof PersistenceError ? `PersistenceError:${e.kind}` : causeTypeOf(e) };
}

/** Parses stored JSON; `undefined` when unreadable. */
function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

const isArrayJson = (raw: string): boolean => Array.isArray(parseStored(raw));
const isObjectJson = (raw: string): boolean => isPlainObject(parseStored(raw));

/** Present, non-empty, and not the shape the app reads. Empty strings carry no data. */
function isCorrupt(raw: string | null | undefined, check: (raw: string) => boolean): boolean {
  return raw !== null && raw !== undefined && raw !== '' && !check(raw);
}

class CorruptStoredError extends Error {
  readonly key: string;
  constructor(key: string) {
    super('stored value is unreadable');
    this.key = key;
  }
}

class RefusedInvalidGoalsError extends Error {}

export class FamilyFinanceRepository {
  readonly #kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.#kv = kv;
  }

  async loadDataSet(): Promise<Result<FamilyFinanceDataSet, RepositoryFailure>> {
    try {
      const raw: Record<string, string | null> = {};
      for (const key of Object.values(FF_KEYS)) raw[key] = await this.#kv.get(key);
      const goalsState = loadGoalsState(raw[FF_KEYS.goals] ?? null);
      const corruptKeys: string[] = [];
      if (isCorrupt(raw[FF_KEYS.data], isArrayJson)) corruptKeys.push(FF_KEYS.data);
      if (isCorrupt(raw[FF_KEYS.categoryConfig], isObjectJson)) corruptKeys.push(FF_KEYS.categoryConfig);
      if (isCorrupt(raw[FF_KEYS.settings], isObjectJson)) corruptKeys.push(FF_KEYS.settings);
      if (isCorrupt(raw[FF_KEYS.activityLog], isArrayJson)) corruptKeys.push(FF_KEYS.activityLog);
      if (!goalsState.valid) corruptKeys.push(FF_KEYS.goals);
      return ok({
        raw,
        items: parseItemsRaw(raw[FF_KEYS.data] ?? null),
        categoryConfig: resolveCategoryConfig(raw[FF_KEYS.categoryConfig] ?? null),
        settings: mergeAppSettings(raw[FF_KEYS.settings] ?? null),
        goalsState,
        goalsRaw: goalsState.valid && goalsState.raw !== null ? (JSON.parse(goalsState.raw) as unknown[]) : [],
        activityLog: parseActivityLog(raw[FF_KEYS.activityLog] ?? null),
        loanBalanceView: resolveLoanBalanceView(raw[FF_KEYS.loanBalanceView] ?? null),
        corruptKeys,
      });
    } catch (e) {
      return err(failure('read', e));
    }
  }

  /** Every family_finance_* entry with its exact raw value (the backup sweep). */
  async readBackupEntries(): Promise<Result<(readonly [string, string])[], RepositoryFailure>> {
    try {
      return ok(await this.#kv.entriesWithPrefix(FAMILY_FINANCE_PREFIX));
    } catch (e) {
      return err(failure('read', e));
    }
  }

  /** app.js savePreviewItems(): the whole array, JSON.stringify'd. */
  async writeItems(items: readonly RawItem[]): Promise<Result<void, RepositoryFailure>> {
    try {
      await this.#kv.set(FF_KEYS.data, JSON.stringify(items));
      return ok(undefined);
    } catch (e) {
      return err(failure('write', e));
    }
  }

  /** app.js saveGoals(): refused while the local goals dataset is invalid (never overwrites corrupt raw data). */
  async writeGoals(state: GoalsState, goals: readonly Goal[]): Promise<Result<void, RepositoryFailure>> {
    if (!state.valid) return err({ kind: 'refusedInvalidGoals' });
    try {
      await this.#kv.set(FF_KEYS.goals, JSON.stringify(goals));
      return ok(undefined);
    } catch (e) {
      return err(failure('write', e));
    }
  }

  /** Merges `patch` into the STORED settings object (unknown keys preserved). */
  async writeSettingsFields(patch: Readonly<Record<string, unknown>>): Promise<Result<void, RepositoryFailure>> {
    try {
      await this.#kv.transaction(async (tx) => {
        const current = await tx.get(FF_KEYS.settings);
        let base: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(current as string);
          if (isPlainObject(parsed)) base = parsed;
        } catch {
          base = {};
        }
        await tx.set(FF_KEYS.settings, JSON.stringify({ ...base, ...patch }));
      });
      return ok(undefined);
    } catch (e) {
      return err(failure('write', e));
    }
  }

  /**
   * Applies one user action atomically: every changed key in ONE transaction,
   * so a failure changes nothing. Validation happens before any write:
   * goals must pass the strict validator, and no unreadable stored value is
   * ever overwritten. The activity-log line (if any) rides in the same
   * transaction; a stored log that is unreadable is left untouched.
   */
  async commit(change: ChangeSet, now: Date): Promise<Result<void, RepositoryFailure>> {
    if (change.goals !== undefined && isValidGoalsArrayStrict(change.goals) === null) return err({ kind: 'refusedInvalidGoals' });
    try {
      await this.#kv.transaction(async (tx) => {
        if (change.items !== undefined) {
          if (isCorrupt(await tx.get(FF_KEYS.data), isArrayJson)) throw new CorruptStoredError(FF_KEYS.data);
          await tx.set(FF_KEYS.data, JSON.stringify(change.items));
        }
        if (change.categoryConfig !== undefined) {
          if (isCorrupt(await tx.get(FF_KEYS.categoryConfig), isObjectJson)) throw new CorruptStoredError(FF_KEYS.categoryConfig);
          await tx.set(FF_KEYS.categoryConfig, JSON.stringify(change.categoryConfig));
        }
        if (change.settingsPatch !== undefined) {
          const current = await tx.get(FF_KEYS.settings);
          if (isCorrupt(current, isObjectJson)) throw new CorruptStoredError(FF_KEYS.settings);
          const base = current ? (parseStored(current) as Record<string, unknown>) : {};
          await tx.set(FF_KEYS.settings, JSON.stringify({ ...base, ...change.settingsPatch }));
        }
        if (change.goals !== undefined) {
          const current = await tx.get(FF_KEYS.goals);
          if (!loadGoalsState(current).valid && change.allowReplacingInvalidGoals !== true) throw new RefusedInvalidGoalsError();
          await tx.set(FF_KEYS.goals, JSON.stringify(change.goals));
        }
        if (change.tileOrder !== undefined) await tx.set(FF_KEYS.categoryTileOrder, JSON.stringify(change.tileOrder));
        if (change.loanBalanceView !== undefined) await tx.set(FF_KEYS.loanBalanceView, JSON.stringify(change.loanBalanceView));
        if (change.activity !== undefined && change.activity.length > 0) {
          const next = appendActivityEntries(await tx.get(FF_KEYS.activityLog), change.activity, now);
          if (next !== null) await tx.set(FF_KEYS.activityLog, next);
        }
      });
      return ok(undefined);
    } catch (e) {
      if (e instanceof CorruptStoredError) return err({ kind: 'corruptStored', causeType: e.key });
      if (e instanceof RefusedInvalidGoalsError) return err({ kind: 'refusedInvalidGoals' });
      return err(failure('write', e));
    }
  }

  /**
   * app.js confirmResetAllData(): removes every family_finance_* key, in one
   * transaction. Device-local ff_* keys (security marker, preferences) and
   * secure storage are not financial data and are not touched.
   */
  async resetAllData(): Promise<Result<{ readonly removedKeys: number }, RepositoryFailure>> {
    try {
      const removed = await this.#kv.transaction(async (tx) => {
        const entries = await tx.entriesWithPrefix(FAMILY_FINANCE_PREFIX);
        for (const [key] of entries) await tx.remove(key);
        return entries.length;
      });
      return ok({ removedKeys: removed });
    } catch (e) {
      return err(failure('write', e));
    }
  }

  /**
   * Validate-before-write restore. All keys are written in ONE SQLite
   * transaction: on any failure nothing changes (a true atomic restore — the
   * Web app can only compensate). The activity-log line is appended afterwards
   * as a separate best-effort step, exactly like the Web app.
   */
  async restoreBackup(
    backup: unknown,
    options: { readonly deleteExistingGoals: boolean; readonly now: Date },
  ): Promise<Result<{ readonly writtenKeys: readonly string[]; readonly activityLogged: boolean }, RepositoryFailure>> {
    if (!isValidBackupShape(backup)) return err({ kind: 'invalidBackup' });
    const envelope = backup as { schemaVersion?: unknown; data: Record<string, string> };
    try {
      const localGoalsRawPresent = (await this.#kv.get(FF_KEYS.goals)) !== null;
      const plan = planRestore(envelope, { deleteExistingGoals: options.deleteExistingGoals, localGoalsRawPresent });
      await this.#kv.transaction(async (tx) => {
        for (const key of plan.keys) await tx.set(key, plan.data[key] as string);
      });
      let activityLogged = false;
      try {
        const next = buildRestoreActivityLog(await this.#kv.get(FF_KEYS.activityLog), plan.keys.length, options.now);
        if (next !== null) {
          await this.#kv.set(FF_KEYS.activityLog, next);
          activityLogged = true;
        }
      } catch {
        activityLogged = false;
      }
      return ok({ writtenKeys: plan.keys, activityLogged });
    } catch (e) {
      return err(failure('restoreFailed', e));
    }
  }
}
