// Backup / restore / CSV export / reset — the product flows of app.js
// exportBackupJson(), processRestoreText(), renderRestorePreview(),
// confirmRestoreBackup(), exportTransactionsCsv() and confirmResetAllData(),
// wired to the Stage 1 FileOperationCoordinator and the Stage 2 backup
// contract.
//
// Lifecycle: this controller and the coordinator are owned by the
// composition root, so an import/export whose picker or share sheet locked the
// app still lands here; the preview waits in memory (never on disk) until the
// user confirms or cancels. Nothing is written before an explicit
// confirmation, and the restore itself is one atomic transaction.
//
// Security isolation: backups contain family_finance_* keys only (the legacy
// Web pinHash rides inertly inside settings); ff_pin_v1 lives in secure
// storage and every ff_* key is outside the prefix, so neither can be exported
// or overwritten by a restore.

import { CSV_MIME_TYPE, FILE_FAILURE_MESSAGES, JSON_MIME_TYPE } from '../backup/fileGateway.ts';
import type { FileOperationCoordinator } from '../backup/fileOperationCoordinator.ts';
import { createStore, type ReadableStore } from '../core/store.ts';
import type { FamilyFinanceRepository } from '../data/familyFinanceRepository.ts';
import { backupFileName, buildBackupEnvelope, isValidBackupShape, serializeBackup } from '../domain/backup.ts';
import { buildTransactionsCsv, transactionsCsvFileName } from '../domain/csvExport.ts';
import { loadGoalsState } from '../domain/goals.ts';
import { FF_KEYS } from '../domain/keys.ts';
import type { FinanceController } from './financeController.ts';

export type RestorePreview = {
  readonly goalsAware: boolean;
  readonly itemCount: number;
  readonly categoryCount: number;
  readonly hasSettings: boolean;
  readonly activityCount: number;
  /** null for a pre-goals (v1) backup. */
  readonly backupGoalsCount: number | null;
  readonly localGoalsValid: boolean;
  readonly localGoalsCount: number;
  /** Whether the device holds a goals value at all (the "also delete" option is offered only then). */
  readonly localGoalsRawPresent: boolean;
};

export type BackupMessage = { readonly tone: 'success' | 'error' | 'info'; readonly text: string };

export type BackupBusy = 'export' | 'csv' | 'import' | 'restore' | 'reset';

export type BackupUiState = {
  readonly busy: BackupBusy | null;
  readonly preview: RestorePreview | null;
  /** The explicit opt-in (v1 backups only): also delete the goals on this device. */
  readonly deleteExistingGoals: boolean;
  readonly message: BackupMessage | null;
};

export const BACKUP_MESSAGES = {
  goalsCorruptExport:
    'לא ניתן ליצור גיבוי — נתוני היעדים המקומיים פגומים. יש לשחזר גיבוי תקין או לאפס את נתוני היעדים הפגומים (במסך יעדים) לפני יצירת גיבוי חדש.',
  readFailed: 'קריאת הנתונים נכשלה — לא נוצר קובץ.',
  shareDone: 'חלון השיתוף נסגר. יעד הקובץ אינו ידוע לאפליקציה — ודאו שהקובץ נשמר.',
  folderDone: 'הקובץ נשמר בתיקייה שנבחרה.',
  exportCancelled: 'הייצוא בוטל — לא נוצר קובץ.',
  fileBusy: 'פעולת קובץ אחרת עדיין פתוחה.',
  importCancelled: 'לא נבחר קובץ — לא בוצע שינוי.',
  /** app.js checkPastedRestoreBackup() with an empty textarea. */
  pasteEmpty: 'לא הודבק תוכן גיבוי.',
  invalidBackup: 'קובץ הגיבוי אינו תקין — לא בוצע שינוי.',
  restoreCancelled: 'השחזור בוטל — לא בוצע שינוי.',
  resetWord: 'יש להקליד בדיוק את המילה "איפוס" כדי לאשר',
  resetDone: 'כל הנתונים נמחקו.',
} as const;

export function restoreDoneMessage(writtenKeys: number): string {
  return 'השחזור הושלם — ' + writtenKeys + ' מפתחות שוחזרו.';
}

/** app.js renderRestorePreview() counts. Precondition: isValidBackupShape(backup). */
export function computeRestorePreview(
  backup: { readonly schemaVersion?: unknown; readonly data: Readonly<Record<string, string>> },
  local: { readonly valid: boolean; readonly count: number; readonly rawPresent: boolean },
): RestorePreview {
  const data = backup.data;
  const lengthOf = (key: string): number => (data[key] ? (JSON.parse(data[key] as string) as unknown[]).length : 0);
  const goalsAware = typeof backup.schemaVersion === 'number' && backup.schemaVersion >= 2;
  return {
    goalsAware,
    itemCount: lengthOf(FF_KEYS.data),
    categoryCount: data[FF_KEYS.categoryConfig] ? Object.keys(JSON.parse(data[FF_KEYS.categoryConfig] as string) as object).length : 0,
    hasSettings: !!data[FF_KEYS.settings],
    activityCount: lengthOf(FF_KEYS.activityLog),
    backupGoalsCount: goalsAware ? lengthOf(FF_KEYS.goals) : null,
    localGoalsValid: local.valid,
    localGoalsCount: local.count,
    localGoalsRawPresent: local.rawPresent,
  };
}

export type BackupControllerDeps = {
  readonly files: FileOperationCoordinator;
  readonly finance: FinanceController;
  readonly repository: FamilyFinanceRepository;
  readonly clock: () => Date;
};

const IDLE: BackupUiState = { busy: null, preview: null, deleteExistingGoals: false, message: null };

export class BackupController {
  readonly #deps: BackupControllerDeps;
  readonly #state = createStore<BackupUiState>(IDLE);
  #pendingBackup: unknown = null;

  constructor(deps: BackupControllerDeps) {
    this.#deps = deps;
  }

  get state(): ReadableStore<BackupUiState> {
    return this.#state;
  }

  dismissMessage(): void {
    this.#set({ message: null });
  }

  async exportBackup(mode: 'share' | 'folder'): Promise<void> {
    if (!this.#begin('export')) return;
    try {
      const now = this.#deps.clock();
      const entries = await this.#deps.repository.readBackupEntries();
      if (!entries.ok) return this.#message('error', BACKUP_MESSAGES.readFailed);
      const goalsEntry = entries.value.find(([k]) => k === FF_KEYS.goals);
      const envelope = buildBackupEnvelope(entries.value, loadGoalsState(goalsEntry ? goalsEntry[1] : null).valid, now);
      if (!envelope) return this.#message('error', BACKUP_MESSAGES.goalsCorruptExport);
      const outcome = await this.#runExport(mode, backupFileName(now), serializeBackup(envelope), JSON_MIME_TYPE);
      if (outcome === 'succeeded') {
        await this.#deps.finance.appendActivity([{ action: 'backup', detail: 'גיבוי יוצא (' + Object.keys(envelope.data).length + ' מפתחות)' }]);
        this.#message('success', mode === 'share' ? BACKUP_MESSAGES.shareDone : BACKUP_MESSAGES.folderDone);
      }
    } finally {
      this.#end();
    }
  }

  async exportCsv(mode: 'share' | 'folder'): Promise<void> {
    if (!this.#begin('csv')) return;
    try {
      const now = this.#deps.clock();
      const loaded = await this.#deps.repository.loadDataSet();
      if (!loaded.ok) return this.#message('error', BACKUP_MESSAGES.readFailed);
      const outcome = await this.#runExport(mode, transactionsCsvFileName(now), buildTransactionsCsv(loaded.value.items), CSV_MIME_TYPE);
      if (outcome === 'succeeded') this.#message('success', mode === 'share' ? BACKUP_MESSAGES.shareDone : BACKUP_MESSAGES.folderDone);
    } finally {
      this.#end();
    }
  }

  /** Picks a file; a valid backup becomes a preview that waits for the user's decision. */
  async startImport(): Promise<void> {
    if (!this.#begin('import')) return;
    this.#pendingBackup = null;
    this.#set({ preview: null, deleteExistingGoals: false });
    try {
      if (this.#deps.files.busy) return this.#message('error', BACKUP_MESSAGES.fileBusy);
      await this.#deps.files.startImport();
      const fs = this.#deps.files.state.get();
      if (fs.phase === 'awaitingDecision') {
        const text = this.#deps.files.takePendingDocument();
        this.#deps.files.acknowledge();
        if (text !== null) await this.#processText(text);
      } else if (fs.phase === 'finished') {
        this.#deps.files.acknowledge();
        if (fs.outcome === 'cancelled') this.#message('info', BACKUP_MESSAGES.importCancelled);
        else if (fs.outcome === 'failed') this.#message('error', (fs.failureKind ? FILE_FAILURE_MESSAGES[fs.failureKind] : 'קריאת הקובץ נכשלה') + ' — לא בוצע שינוי.');
      }
    } finally {
      this.#end();
    }
  }

  /**
   * app.js checkPastedRestoreBackup(): the "📋 הדבק גיבוי" fallback. The pasted
   * text goes through the SAME parse / validate / preview pipeline as a picked
   * file — no second restore engine. Returns true when a preview is now waiting.
   */
  async checkPastedBackup(text: string): Promise<boolean> {
    if (!this.#begin('import')) return false;
    try {
      this.#pendingBackup = null;
      this.#set({ preview: null, deleteExistingGoals: false });
      if (!text || !text.trim()) {
        this.#message('info', BACKUP_MESSAGES.pasteEmpty);
        return false;
      }
      await this.#processText(text);
      return this.#state.get().preview !== null;
    } finally {
      this.#end();
    }
  }

  setDeleteExistingGoals(value: boolean): void {
    if (this.#state.get().preview === null) return;
    this.#set({ deleteExistingGoals: value });
  }

  cancelRestore(): void {
    if (this.#state.get().busy === 'restore') return;
    this.#pendingBackup = null;
    this.#set({ preview: null, deleteExistingGoals: false, message: { tone: 'info', text: BACKUP_MESSAGES.restoreCancelled } });
  }

  /** The explicit "כן, שחזר ודרוס נתונים קיימים". */
  async confirmRestore(): Promise<void> {
    const s = this.#state.get();
    if (this.#pendingBackup === null || s.preview === null || !this.#begin('restore')) return;
    try {
      const backup = this.#pendingBackup;
      const deleteGoals = !s.preview.goalsAware && s.deleteExistingGoals;
      const outcome = await this.#deps.finance.restoreBackup(backup, deleteGoals);
      this.#pendingBackup = null;
      this.#set({ preview: null, deleteExistingGoals: false });
      if (outcome.ok) this.#message('success', restoreDoneMessage(outcome.count ?? 0));
      else this.#message('error', outcome.message);
    } finally {
      this.#end();
    }
  }

  /** app.js confirmResetAllData(): requires typing exactly "איפוס". */
  async resetAllData(confirmText: string): Promise<boolean> {
    if (confirmText.trim() !== 'איפוס') {
      this.#message('error', BACKUP_MESSAGES.resetWord);
      return false;
    }
    if (!this.#begin('reset')) return false;
    try {
      this.#pendingBackup = null;
      this.#set({ preview: null, deleteExistingGoals: false });
      const outcome = await this.#deps.finance.resetAllData();
      if (outcome.ok) this.#message('success', BACKUP_MESSAGES.resetDone);
      else this.#message('error', outcome.message);
      return outcome.ok;
    } finally {
      this.#end();
    }
  }

  async #processText(text: string): Promise<void> {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!parsed || !isValidBackupShape(parsed)) {
      this.#pendingBackup = null;
      return this.#message('error', BACKUP_MESSAGES.invalidBackup);
    }
    const loaded = await this.#deps.repository.loadDataSet();
    if (!loaded.ok) return this.#message('error', BACKUP_MESSAGES.readFailed);
    const goals = loaded.value.goalsState;
    this.#pendingBackup = parsed;
    this.#set({
      preview: computeRestorePreview(parsed as { schemaVersion?: unknown; data: Record<string, string> }, {
        valid: goals.valid,
        count: goals.goals.length,
        rawPresent: goals.raw !== null,
      }),
      deleteExistingGoals: false,
    });
  }

  async #runExport(mode: 'share' | 'folder', fileName: string, text: string, mimeType: string): Promise<'succeeded' | 'cancelled' | 'failed'> {
    const files = this.#deps.files;
    if (files.busy) {
      this.#message('error', BACKUP_MESSAGES.fileBusy);
      return 'failed';
    }
    await files.startExport(mode, fileName, text, mimeType);
    const s = files.state.get();
    if (s.phase !== 'finished') return 'failed';
    files.acknowledge();
    if (s.outcome === 'cancelled') {
      this.#message('info', BACKUP_MESSAGES.exportCancelled);
      return 'cancelled';
    }
    if (s.outcome === 'failed') {
      this.#message('error', s.failureKind ? FILE_FAILURE_MESSAGES[s.failureKind] : 'הייצוא נכשל');
      return 'failed';
    }
    return 'succeeded';
  }

  #begin(kind: BackupBusy): boolean {
    if (this.#state.get().busy !== null) return false;
    this.#set({ busy: kind, message: null });
    return true;
  }

  #end(): void {
    this.#set({ busy: null });
  }

  #message(tone: BackupMessage['tone'], text: string): void {
    this.#set({ message: { tone, text } });
  }

  #set(patch: Partial<BackupUiState>): void {
    this.#state.set({ ...this.#state.get(), ...patch });
  }
}
