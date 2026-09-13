// Module-level stores: they live OUTSIDE the React tree on purpose, so state
// such as a pending file operation or a notification tap survives the lock
// gate unmounting every protected screen (the Flutter M10 lesson).
import { useSyncExternalStore } from 'react';

import { INITIAL_LOCK_STATE, reduceLock, type LockEvent, type LockState } from './lockMachine';
import { note } from './log';

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const lockStore = createStore<LockState>(INITIAL_LOCK_STATE);

export function dispatchLock(event: LockEvent): void {
  const before = lockStore.get();
  const after = reduceLock(before, event);
  if (after !== before) {
    note('lock', `${before.kind} --${event.type}${event.type === 'appState' ? ':' + event.state : ''}--> ${after.kind}`);
    lockStore.set(after);
  }
}

/** A notification tap waiting for the app to become viewable. */
export const pendingRouteStore = createStore<string | null>(null);

export type FileFlowPhase = 'idle' | 'picking' | 'awaitingConfirm' | 'done' | 'failed' | 'cancelled';

export type FileFlow = {
  phase: FileFlowPhase;
  message: string;
  /** Set when the flow resolved while the shell was locked/unmounted. */
  returnToSettings: boolean;
};

export const fileFlowStore = createStore<FileFlow>({ phase: 'idle', message: '', returnToSettings: false });
