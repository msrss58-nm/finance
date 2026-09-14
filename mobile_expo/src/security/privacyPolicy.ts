// Screen / recents privacy policy (pure).
//
// Approved oracle rule (secure_window.dart): protection is active exactly
// while a lock is configured — not toggled around lifecycle transitions,
// which is racy against the OS snapshot. Extended here to fail closed: when
// the security state is unknown because of a failure, protect.
//   Android: FLAG_SECURE (blocks screenshots AND the recents thumbnail).
//   iOS:     screenshot/recording protection + app-switcher blur.

import type { AuthState } from './authMachine.ts';

export type PrivacyMode = 'protected' | 'open';

export interface ScreenPrivacy {
  apply(mode: PrivacyMode): Promise<void>;
}

/** null = no decision yet (keep whatever is applied). */
export function privacyModeFor(state: AuthState): PrivacyMode | null {
  switch (state.kind) {
    case 'initializing':
      return null;
    case 'notConfigured':
      return 'open';
    case 'locked':
    case 'unlocking':
    case 'unlocked':
    case 'unavailable':
      return 'protected';
  }
}
