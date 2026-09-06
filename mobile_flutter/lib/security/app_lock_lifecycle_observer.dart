import 'package:flutter/widgets.dart';

import 'auth_controller.dart';

/// Lifecycle-aware auto-lock (Milestone 7, section 6).
///
/// APPROVED POLICY (user decision, recorded here because it deliberately
/// differs from the Web app): the app locks whenever it leaves the
/// foreground, and a PIN is required again on resume. The Web app's
/// `autoLockMinutes` grace threshold (off / 0 / 1 / 5 / 15 / 30, default
/// OFF) is NOT honoured by the Flutter client — its default of "off" would
/// leave a resumed app unlocked indefinitely. The stored `autoLockMinutes`
/// value round-trips faithfully: SettingsRepository re-serialises it on
/// every settings save, so its value is never dropped or altered. It is
/// simply never READ by this layer.
///
/// Exact per-state behaviour:
///
/// - `resumed`   — no lock action. Locking on resume would be too late: the
///                 lock already happened on the way out.
/// - `inactive`  — NO lock. This fires for transient system interruptions
///                 that do not background the app: the notification shade,
///                 a permission dialog, an incoming call banner, and (on
///                 iOS) the app-switcher gesture. Locking here would produce
///                 constant false locks, which is exactly the "arbitrary
///                 grace mechanism" trap section 6 warns about — the fix is
///                 to not lock on `inactive` at all, not to add a timer.
/// - `hidden`    — LOCK. The app is no longer visible.
/// - `paused`    — LOCK. The app is backgrounded.
/// - `detached`  — LOCK. Defensive: the state is being torn down anyway,
///                 but leaving an unlocked flag behind is never correct.
///
/// Sensitive content is additionally protected in the recents snapshot by
/// FLAG_SECURE (see SecureWindowController) — locking alone would not stop
/// the OS from having already captured a thumbnail.
class AppLockLifecycleObserver with WidgetsBindingObserver {
  AppLockLifecycleObserver(this._controller);

  final AuthController _controller;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _controller.lock();
      case AppLifecycleState.resumed:
      case AppLifecycleState.inactive:
        break;
    }
  }
}
