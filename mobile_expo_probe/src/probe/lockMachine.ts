// Stage 0 probe — pure lock state machine mirroring the approved Flutter
// Milestone 7 policy (AuthController + AppLockLifecycleObserver).
// NOT production code. No imports on purpose: runs under `node --test` too.

export type LockState =
  | { kind: 'initializing' }
  | { kind: 'notConfigured' }
  | { kind: 'locked'; failures: number }
  | { kind: 'unlocked' }
  | { kind: 'unavailable'; reason: string };

/** React Native AppStateStatus values (typed locally to stay import-free). */
export type AppStateValue = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export type LockEvent =
  | { type: 'configLoaded'; configured: boolean }
  | { type: 'configError'; reason: string }
  | { type: 'appState'; state: AppStateValue }
  | { type: 'unlockSucceeded' }
  | { type: 'unlockFailed' }
  | { type: 'pinSet' }
  | { type: 'pinRemoved' };

export const INITIAL_LOCK_STATE: LockState = { kind: 'initializing' };

/** The single whitelist: only these two states may show financial UI. */
export function allowsSensitiveContent(s: LockState): boolean {
  return s.kind === 'notConfigured' || s.kind === 'unlocked';
}

export function reduceLock(s: LockState, e: LockEvent): LockState {
  switch (e.type) {
    case 'configLoaded':
      if (s.kind !== 'initializing') return s;
      return e.configured ? { kind: 'locked', failures: 0 } : { kind: 'notConfigured' };
    case 'configError':
      // Storage failure is NEVER "no PIN" and NEVER unlocked.
      return { kind: 'unavailable', reason: e.reason };
    case 'appState':
      // Flutter policy: lock when the app leaves the foreground ('background'),
      // never on 'inactive' (iOS shade / call banner / app-switcher gesture).
      if (e.state === 'background' && s.kind === 'unlocked') {
        return { kind: 'locked', failures: 0 };
      }
      return s;
    case 'unlockSucceeded':
      return s.kind === 'locked' ? { kind: 'unlocked' } : s;
    case 'unlockFailed':
      return s.kind === 'locked' ? { kind: 'locked', failures: s.failures + 1 } : s;
    case 'pinSet':
      // Same as Flutter refreshAfterConfigurationChange(): session stays open.
      return s.kind === 'unavailable' ? s : { kind: 'unlocked' };
    case 'pinRemoved':
      return s.kind === 'unavailable' ? s : { kind: 'notConfigured' };
  }
}
