// The ONE place that decides whether the monthly Goals reminder exists as a
// local OS notification, when it fires, and keeps the OS in sync (port of the
// Flutter oracle's goals_reminder_scheduler.dart).
//
// It does not calculate funding: "is anything due on the reminder date" comes
// straight from the domain's getGoalsDueForReminder(). It never writes
// financial data and never touches security state. The notification text is
// generic (no amount, no goal name); navigation after a tap is gated by the
// security shell, which this class cannot reach.
//
// Opt-in: off by default; permission is requested only when the user turns it
// on. The preference is device-local (ff_*), never part of a backup.

import { createStore, type ReadableStore } from '../core/store.ts';
import type { KeyValueWriter } from '../data/keyValueStore.ts';
import { DEVICE_LOCAL_KEYS } from '../data/storageKeys.ts';
import type { GoalsState } from '../domain/goals.ts';
import { getGoalsDueForReminder } from '../domain/goalsPlanning.ts';
import { GOALS_REMINDER_BODY, GOALS_REMINDER_TITLE, nextGoalsReminderDateTime } from './goalsReminderSchedule.ts';
import { OWNED_NOTIFICATION_IDS, type NotificationGateway, type NotificationPermission } from './notificationGateway.ts';

export type ReminderPrefs = { readonly enabled: boolean; readonly permissionRequested: boolean };
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = { enabled: false, permissionRequested: false };

export type GoalsReminderSyncStatus =
  | 'scheduled'
  | 'disabled'
  /** The OS does not allow notifications (denied, or never granted). Nothing is scheduled. */
  | 'permissionMissing'
  | 'nothingToRemind'
  | 'goalsDataInvalid'
  | 'failed';

export type GoalsReminderStatus = {
  readonly prefs: ReminderPrefs;
  readonly permission: NotificationPermission | null;
  readonly sync: GoalsReminderSyncStatus | null;
  readonly scheduledFor: Date | null;
};

/** A corrupt or unreadable preference is "off" — never a state that starts posting notifications. */
export function parseReminderPrefs(raw: string | null): ReminderPrefs {
  if (raw === null) return DEFAULT_REMINDER_PREFS;
  try {
    const decoded: unknown = JSON.parse(raw);
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return DEFAULT_REMINDER_PREFS;
    const d = decoded as Record<string, unknown>;
    return { enabled: d.enabled === true, permissionRequested: d.permissionRequested === true };
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

export type GoalsReminderSchedulerDeps = {
  readonly gateway: NotificationGateway;
  readonly kv: KeyValueWriter;
  /** The current goals dataset; null while the financial data is not loaded yet (nothing is changed then). */
  readonly goalsState: () => GoalsState | null;
  readonly clock: () => Date;
};

export class GoalsReminderScheduler {
  readonly #deps: GoalsReminderSchedulerDeps;
  readonly #status = createStore<GoalsReminderStatus>({ prefs: DEFAULT_REMINDER_PREFS, permission: null, sync: null, scheduledFor: null });
  #inFlight: Promise<GoalsReminderSyncStatus> | null = null;

  constructor(deps: GoalsReminderSchedulerDeps) {
    this.#deps = deps;
  }

  get status(): ReadableStore<GoalsReminderStatus> {
    return this.#status;
  }

  /** Converges the OS on the current state. Concurrent calls share one run. */
  reconcile(): Promise<GoalsReminderSyncStatus> {
    if (this.#inFlight) return this.#inFlight;
    const run = this.#reconcile().finally(() => {
      this.#inFlight = null;
    });
    this.#inFlight = run;
    return run;
  }

  /** Turns the reminder on; asks for OS permission the first time only. */
  async enable(): Promise<GoalsReminderSyncStatus> {
    await this.#inFlight;
    const prefs = await this.#loadPrefs();
    let next: ReminderPrefs = { ...prefs, enabled: true };
    if (!prefs.permissionRequested) {
      const requested = await this.#deps.gateway.requestPermission();
      next = { ...next, permissionRequested: true };
      if (!requested.ok) {
        await this.#savePrefs(next);
        this.#set({ prefs: next, sync: 'failed', scheduledFor: null });
        return 'failed';
      }
    }
    if (!(await this.#savePrefs(next))) {
      this.#set({ sync: 'failed', scheduledFor: null });
      return 'failed';
    }
    return this.reconcile();
  }

  /** Turns the reminder off and cancels only this app's own reminder. */
  async disable(): Promise<GoalsReminderSyncStatus> {
    await this.#inFlight;
    const prefs = await this.#loadPrefs();
    if (!(await this.#savePrefs({ ...prefs, enabled: false }))) {
      this.#set({ sync: 'failed', scheduledFor: null });
      return 'failed';
    }
    return this.reconcile();
  }

  async #reconcile(): Promise<GoalsReminderSyncStatus> {
    const prefs = await this.#loadPrefs();
    const perm = await this.#deps.gateway.permissionStatus();
    const permission = perm.ok ? perm.value : null;
    this.#set({ prefs, permission });

    if (!prefs.enabled) return this.#cancelAnd('disabled');
    if (!perm.ok) return this.#report('failed');
    if (perm.value !== 'granted') return this.#cancelAnd('permissionMissing');

    const goals = this.#deps.goalsState();
    if (goals === null) return this.#status.get().sync ?? 'failed';
    if (!goals.valid) return this.#cancelAnd('goalsDataInvalid');

    const when = nextGoalsReminderDateTime(this.#deps.clock());
    if (getGoalsDueForReminder(goals, when).length === 0) return this.#cancelAnd('nothingToRemind');

    const scheduled = await this.#deps.gateway.schedule({
      id: OWNED_NOTIFICATION_IDS.goalsReminder,
      title: GOALS_REMINDER_TITLE,
      body: GOALS_REMINDER_BODY,
      at: when,
      payload: { ffRoute: 'goals' },
    });
    if (!scheduled.ok) return this.#report('failed');
    this.#set({ sync: 'scheduled', scheduledFor: when });
    return 'scheduled';
  }

  async #cancelAnd(status: GoalsReminderSyncStatus): Promise<GoalsReminderSyncStatus> {
    const cancelled = await this.#deps.gateway.cancel(OWNED_NOTIFICATION_IDS.goalsReminder);
    return this.#report(cancelled.ok ? status : 'failed');
  }

  #report(status: GoalsReminderSyncStatus): GoalsReminderSyncStatus {
    this.#set({ sync: status, scheduledFor: null });
    return status;
  }

  #set(patch: Partial<GoalsReminderStatus>): void {
    this.#status.set({ ...this.#status.get(), ...patch });
  }

  async #loadPrefs(): Promise<ReminderPrefs> {
    try {
      return parseReminderPrefs(await this.#deps.kv.get(DEVICE_LOCAL_KEYS.goalsReminderPrefs));
    } catch {
      return DEFAULT_REMINDER_PREFS;
    }
  }

  async #savePrefs(prefs: ReminderPrefs): Promise<boolean> {
    try {
      await this.#deps.kv.set(DEVICE_LOCAL_KEYS.goalsReminderPrefs, JSON.stringify({ enabled: prefs.enabled, permissionRequested: prefs.permissionRequested }));
      this.#set({ prefs });
      return true;
    } catch {
      return false;
    }
  }
}
