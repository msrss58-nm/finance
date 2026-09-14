// Stage 2 repository over the Stage 1 KeyValueStore.
//
// Raw storage is authoritative: every read returns the exact stored strings
// alongside the derived domain views, and every write serialises only what
// the caller explicitly changes. No UI or platform dependency.
//
// Deliberate difference from the Web app (safer, non-destructive): a settings
// write merges into the STORED object, so unknown/future top-level settings
// keys survive (the Web app re-serialises its in-memory defaults-shaped object
// and would drop them).

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import { buildRestoreActivityLog, isValidBackupShape, planRestore } from '../domain/backup.ts';
import { resolveCategoryConfig } from '../domain/categoryConfig.ts';
import type { Goal, GoalsState } from '../domain/goals.ts';
import { loadGoalsState } from '../domain/goals.ts';
import { FF_KEYS } from '../domain/keys.ts';
import { isPlainObject, parseItemsRaw, type RawItem } from '../domain/raw.ts';
import { mergeAppSettings, type AppSettingsView } from '../domain/settings.ts';
import { PersistenceError, type KeyValueStore } from './keyValueStore.ts';
import { FAMILY_FINANCE_PREFIX } from './storageKeys.ts';

export type RepositoryFailureKind = 'read' | 'write' | 'refusedInvalidGoals' | 'invalidBackup' | 'restoreFailed';
export type RepositoryFailure = { readonly kind: RepositoryFailureKind; readonly causeType?: string };

export type FamilyFinanceDataSet = {
  /** The exact stored strings (null = key absent). */
  readonly raw: Readonly<Record<string, string | null>>;
  readonly items: RawItem[];
  readonly categoryConfig: Record<string, unknown>;
  readonly settings: AppSettingsView;
  readonly goalsState: GoalsState;
  readonly activityLog: unknown[];
  readonly loanBalanceView: 'total' | 'principal';
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

export class FamilyFinanceRepository {
  readonly #kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.#kv = kv;
  }

  async loadDataSet(): Promise<Result<FamilyFinanceDataSet, RepositoryFailure>> {
    try {
      const raw: Record<string, string | null> = {};
      for (const key of Object.values(FF_KEYS)) raw[key] = await this.#kv.get(key);
      return ok({
        raw,
        items: parseItemsRaw(raw[FF_KEYS.data] ?? null),
        categoryConfig: resolveCategoryConfig(raw[FF_KEYS.categoryConfig] ?? null),
        settings: mergeAppSettings(raw[FF_KEYS.settings] ?? null),
        goalsState: loadGoalsState(raw[FF_KEYS.goals] ?? null),
        activityLog: parseActivityLog(raw[FF_KEYS.activityLog] ?? null),
        loanBalanceView: resolveLoanBalanceView(raw[FF_KEYS.loanBalanceView] ?? null),
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
