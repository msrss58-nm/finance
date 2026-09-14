// The security state machine (pure). Semantics follow the Flutter oracle
// (auth_state.dart + auth_controller.dart); the controller only feeds it
// events. Staleness is handled structurally: an async result is an event that
// is only accepted from the state that started it, so e.g. an unlock result
// arriving after the app was backgrounded (unlocking -> locked) is ignored.

import type { SecurityFailure } from './securityTypes.ts';

export type AuthState =
  /** Startup: configuration not read yet. Sensitive UI stays gated. */
  | { readonly kind: 'initializing' }
  /** No lock configured: the app is open. */
  | { readonly kind: 'notConfigured' }
  /** Lock configured, app locked. Failure count is in-memory only. */
  | {
      readonly kind: 'locked';
      readonly failures: number;
      readonly lastAttemptFailed: boolean;
      /** Epoch ms before which a new attempt is refused; null = no backoff. */
      readonly retryAllowedAt: number | null;
    }
  /** A submitted code is being verified. */
  | { readonly kind: 'unlocking'; readonly failures: number }
  /** Lock configured and verified this session. */
  | { readonly kind: 'unlocked' }
  /** Security state could not be determined or enforced. Never opens the app. */
  | { readonly kind: 'unavailable'; readonly failure: SecurityFailure };

export type AuthEvent =
  | { readonly type: 'configResolved'; readonly configured: boolean }
  | { readonly type: 'failed'; readonly failure: SecurityFailure }
  | { readonly type: 'backgrounded' }
  | { readonly type: 'unlockStarted' }
  | { readonly type: 'unlockResolved'; readonly matched: boolean; readonly now: number }
  | { readonly type: 'lockConfigured' }
  | { readonly type: 'lockRemoved' };

export const INITIAL_AUTH_STATE: AuthState = { kind: 'initializing' };

const FRESH_LOCK: AuthState = { kind: 'locked', failures: 0, lastAttemptFailed: false, retryAllowedAt: null };

/**
 * The ONE predicate deciding whether sensitive UI may exist. A whitelist:
 * every other state — including every failure — keeps the app gated.
 */
export function allowsSensitiveContent(state: AuthState): boolean {
  return state.kind === 'notConfigured' || state.kind === 'unlocked';
}

/** Backoff after repeated wrong codes (oracle: 3→5s, 4→10s, 5→20s, 6+→30s). In-memory friction, not a rate limit. */
export function backoffMs(failures: number): number {
  if (failures < 3) return 0;
  if (failures === 3) return 5_000;
  if (failures === 4) return 10_000;
  if (failures === 5) return 20_000;
  return 30_000;
}

export function reduceAuth(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'configResolved':
      if (state.kind !== 'initializing') return state;
      return event.configured ? FRESH_LOCK : { kind: 'notConfigured' };

    case 'failed':
      // Any failure is terminal for this run: never downgraded to "no lock".
      return { kind: 'unavailable', failure: event.failure };

    case 'backgrounded':
      // Lock only when something is open behind a configured lock. An
      // in-flight verification is abandoned; the count resets (fresh lock).
      return state.kind === 'unlocked' || state.kind === 'unlocking' ? FRESH_LOCK : state;

    case 'unlockStarted':
      return state.kind === 'locked' ? { kind: 'unlocking', failures: state.failures } : state;

    case 'unlockResolved': {
      if (state.kind !== 'unlocking') return state; // stale: the app locked meanwhile
      if (event.matched) return { kind: 'unlocked' };
      const failures = state.failures + 1;
      const wait = backoffMs(failures);
      return { kind: 'locked', failures, lastAttemptFailed: true, retryAllowedAt: wait === 0 ? null : event.now + wait };
    }

    case 'lockConfigured':
      // The user just proved presence by configuring it: stay open.
      return state.kind === 'notConfigured' || state.kind === 'unlocked' ? { kind: 'unlocked' } : state;

    case 'lockRemoved':
      // Removal was initiated while unlocked; if the app locked before it
      // completed there is nothing left to protect.
      return state.kind === 'unlocked' || state.kind === 'locked' || state.kind === 'unlocking'
        ? { kind: 'notConfigured' }
        : state;
  }
}
