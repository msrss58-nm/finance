// Owns ONE file operation (import or export) for the life of the app run.
//
// Why it lives outside every screen (Flutter M10 blocker, reproduced in
// Stage 0 on Expo too): opening the picker / share sheet backgrounds the
// app, the lock gate then unmounts every screen, and a screen-owned `await`
// would resume into nothing — a picked document or an export result would be
// silently lost. Here the `await` belongs to an object created by the
// composition root, so the result always lands; the lock still happens.
//
// The picked text is held in memory only — never written to disk, SQLite or
// secure storage to survive the lock — and is dropped the moment the
// operation resolves. If the OS kills the process, it simply ceases to exist.

import { createStore, type ReadableStore } from '../core/store.ts';
import type { PendingNavigation } from '../navigation/pendingNavigation.ts';
import type { FileFailureKind, FileGateway, FileResult } from './fileGateway.ts';

export type FileOperation = 'import' | 'exportShare' | 'exportFolder';

export type FileOperationState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'working'; readonly operation: FileOperation }
  /** A document was read and is waiting for the user's decision. Nothing was written. */
  | { readonly phase: 'awaitingDecision'; readonly name: string; readonly byteLength: number }
  | {
      readonly phase: 'finished';
      readonly operation: FileOperation;
      readonly outcome: 'succeeded' | 'cancelled' | 'failed';
      readonly failureKind: FileFailureKind | null;
    };

export class FileOperationCoordinator {
  readonly #gateway: FileGateway;
  readonly #navigation: PendingNavigation;
  readonly #state = createStore<FileOperationState>({ phase: 'idle' });
  #pendingText: string | null = null;

  constructor(gateway: FileGateway, navigation: PendingNavigation) {
    this.#gateway = gateway;
    this.#navigation = navigation;
  }

  get state(): ReadableStore<FileOperationState> {
    return this.#state;
  }

  get supportsFolderExport(): boolean {
    return this.#gateway.supportsFolderExport;
  }

  get busy(): boolean {
    const phase = this.#state.get().phase;
    return phase === 'working' || phase === 'awaitingDecision';
  }

  async startImport(): Promise<void> {
    if (this.busy) return;
    this.#state.set({ phase: 'working', operation: 'import' });
    let result: FileResult<{ name: string; text: string; byteLength: number }>;
    try {
      result = await this.#gateway.pickTextDocument();
    } catch {
      result = { status: 'failed', failure: { kind: 'read' } };
    }
    if (result.status === 'ok') {
      this.#pendingText = result.value.text;
      this.#settle({ phase: 'awaitingDecision', name: result.value.name, byteLength: result.value.byteLength });
    } else {
      this.#finish('import', result);
    }
  }

  async startExport(mode: 'share' | 'folder', fileName: string, text: string): Promise<void> {
    if (this.busy) return;
    const operation: FileOperation = mode === 'share' ? 'exportShare' : 'exportFolder';
    this.#state.set({ phase: 'working', operation });
    let result: FileResult<unknown>;
    try {
      result = mode === 'share' ? await this.#gateway.shareJson(fileName, text) : await this.#gateway.saveJsonToFolder(fileName, text);
    } catch {
      result = { status: 'failed', failure: { kind: mode === 'share' ? 'share' : 'write' } };
    }
    this.#finish(operation, result);
  }

  /**
   * Hands the pending text to its consumer exactly once (the future backup
   * validator/restore) and resolves the operation. null when nothing pends.
   */
  takePendingDocument(): string | null {
    if (this.#state.get().phase !== 'awaitingDecision') return null;
    const text = this.#pendingText;
    this.#pendingText = null;
    this.#state.set({ phase: 'finished', operation: 'import', outcome: 'succeeded', failureKind: null });
    return text;
  }

  /** The user declined: drop the document. Zero writes happened by construction. */
  discardPendingDocument(): void {
    if (this.#state.get().phase !== 'awaitingDecision') return;
    this.#pendingText = null;
    this.#state.set({ phase: 'finished', operation: 'import', outcome: 'cancelled', failureKind: null });
  }

  /** Dismisses a finished result. */
  acknowledge(): void {
    if (this.#state.get().phase === 'finished') this.#state.set({ phase: 'idle' });
  }

  #finish(operation: FileOperation, result: FileResult<unknown>): void {
    this.#pendingText = null;
    this.#settle({
      phase: 'finished',
      operation,
      outcome: result.status === 'ok' ? 'succeeded' : result.status === 'cancelled' ? 'cancelled' : 'failed',
      failureKind: result.status === 'failed' ? result.failure.kind : null,
    });
  }

  #settle(next: FileOperationState): void {
    this.#state.set(next);
    // The user is owed a look at Settings — where the result/decision is —
    // even if the lock tore the shell down while the picker was open.
    this.#navigation.offer({ screen: 'settings', source: 'fileOperation' });
  }
}
