import type { AuthState } from '../security/authMachine.ts';
import { SECURITY_FAILURE_MESSAGES } from '../security/securityTypes.ts';

export function describeAuthState(state: AuthState): string {
  switch (state.kind) {
    case 'initializing':
      return 'בודק את מצב האבטחה…';
    case 'notConfigured':
      return 'לא הוגדרה נעילה';
    case 'locked':
      return 'נעול';
    case 'unlocking':
      return 'מאמת…';
    case 'unlocked':
      return 'נעילה מוגדרת — פתוח';
    case 'unavailable':
      return SECURITY_FAILURE_MESSAGES[state.failure.kind];
  }
}
