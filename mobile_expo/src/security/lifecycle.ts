// Lifecycle -> lock policy (pure).
//
// React Native AppState values: 'active' | 'background' | 'inactive' |
// 'unknown' | 'extension'. Lock ONLY on 'background'.
//   - iOS 'inactive' (app switcher, Control Center, incoming-call banner) is a
//     transient interruption: no lock, same as the oracle's `inactive` rule.
//   - Android reports 'background' already on Activity.onPause, so a system
//     dialog that pauses the activity (e.g. the notification-permission
//     prompt, the SAF picker) locks the app. Stricter than the Flutter oracle;
//     APPROVED (Stage 0 decision 7) — no native onStop customization.

export function shouldLockOnAppState(status: string): boolean {
  return status === 'background';
}
