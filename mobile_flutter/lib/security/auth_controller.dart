import 'package:flutter/foundation.dart';

import 'auth_state.dart';
import 'pin_service.dart';
import 'secure_window.dart';
import 'security_errors.dart';

/// The single owner of lock state (Milestone 7, section 4).
///
/// Nothing else in the app decides whether the app is locked: not the
/// navigation shell, not a repository, not a screen. The domain layer has no
/// idea this class exists — [PinService] is the only collaborator, and it in
/// turn only knows about secure storage. That keeps unlock state from
/// leaking into business/persistence state, as section 4 requires.
///
/// Built on plain Flutter primitives ([ChangeNotifier]) — no new dependency.
class AuthController extends ChangeNotifier {
  AuthController(
    this._pinService, {
    this.secureWindow = const NoopSecureWindowController(),
    this.nowProvider = DateTime.now,
  });

  final PinService _pinService;

  /// Recents/app-switcher protection. A no-op by default so unit tests need
  /// no platform channel; production injects the real Android controller.
  final SecureWindowController secureWindow;

  /// Injectable clock, so the failed-attempt backoff can be tested without
  /// real waiting.
  final DateTime Function() nowProvider;

  AuthState _state = const AuthInitializing();
  AuthState get state => _state;

  /// Convenience mirror of [AuthState.allowsSensitiveContent] so callers do
  /// not re-derive the rule.
  bool get allowsSensitiveContent => _state.allowsSensitiveContent;

  /// Guards against a second in-flight verification (e.g. a double tap on
  /// "unlock") consuming two failure counts for one user action.
  bool _verificationInFlight = false;

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// Incremented on EVERY published state change.
  ///
  /// A long-running operation captures this before awaiting and re-checks it
  /// afterwards. If it changed, something else (in practice [lock]) has
  /// already decided the current state, and the stale result must NOT be
  /// published on top of that decision.
  int _generation = 0;

  /// Every state change goes through here, and it is a no-op once disposed.
  ///
  /// PIN operations are long-running (key derivation is deliberately
  /// expensive), so one can still be in flight when the widget that owns
  /// this controller is torn down — an app shutdown during an unlock, for
  /// instance. Without this guard the completion callback calls
  /// [notifyListeners] on a disposed [ChangeNotifier], which throws
  /// "A AuthController was used after being disposed". Caught on the
  /// physical device, where a real derivation takes long enough for the race
  /// to actually happen.
  void _setState(AuthState next) {
    if (_disposed) return;
    _generation++;
    _state = next;
    notifyListeners();
  }

  /// Backoff schedule after repeated wrong PINs (section 9).
  ///
  /// Bounded and in-memory by design: it slows an attacker tapping at the
  /// lock screen without ever permanently locking out the legitimate user
  /// and without destroying any data. Capped at 30 seconds.
  ///
  /// Stated plainly rather than left implied: because the counter lives only
  /// in memory, force-stopping and relaunching the app resets it, so the
  /// delay can be sidestepped by restarting. That is the deliberate
  /// trade-off for "never permanently lock the user out of their own data"
  /// (section 9 forbids persistent lockout counters without approval); the
  /// backoff is friction, not a rate limit.
  @visibleForTesting
  static Duration backoffFor(int consecutiveFailures) {
    if (consecutiveFailures < 3) return Duration.zero;
    return switch (consecutiveFailures) {
      3 => const Duration(seconds: 5),
      4 => const Duration(seconds: 10),
      5 => const Duration(seconds: 20),
      _ => const Duration(seconds: 30),
    };
  }

  /// Reads the PIN configuration and establishes the startup state
  /// (section 5). Must be awaited before sensitive UI can appear; until it
  /// completes the state stays [AuthInitializing], which does not allow
  /// sensitive content.
  Future<void> initialize() async {
    final generation = _generation;
    try {
      final configured = await _pinService.isPinConfigured();
      // Recents protection follows PIN configuration, not lock state — see
      // SecureWindowController's scope note.
      await secureWindow.setSecure(configured);
      if (generation != _generation) return;
      _setState(configured ? const AuthLocked() : const AuthNotConfigured());
    } on SecurityError catch (e) {
      // NOT "no PIN configured", NOT unlocked. Section 5.
      _setState(AuthUnavailable(e));
    } catch (e) {
      _setState(AuthUnavailable(
        UnexpectedSecurityFailure(causeType: e.runtimeType.toString()),
      ));
    }
  }

  /// Attempts to unlock. Returns `true` only on a real successful
  /// verification.
  Future<bool> submitPin(String pin) async {
    final current = _state;
    if (current is! AuthLocked) return false;
    if (_verificationInFlight) return false;

    final retryAt = current.retryAllowedAt;
    if (retryAt != null && nowProvider().isBefore(retryAt)) {
      // Still in backoff: rejected WITHOUT deriving and WITHOUT counting
      // another failure, so hammering the button cannot inflate the delay.
      return false;
    }

    _verificationInFlight = true;
    _setState(const AuthUnlocking());
    // Captured AFTER publishing AuthUnlocking, so only a LATER change (i.e.
    // someone else deciding the state while we were awaiting) invalidates
    // this attempt.
    final generation = _generation;
    try {
      final ok = await _pinService.verifyPin(pin);
      // Verification is slow, and the app can be backgrounded mid-flight —
      // which calls lock(). Publishing AuthUnlocked here would silently undo
      // that lock and leave the app OPEN after it had already left the
      // foreground, defeating the whole lifecycle policy. Drop the stale
      // result instead: the user simply re-enters the PIN on resume.
      if (generation != _generation) return false;
      if (ok) {
        // Section 9: reset the counter on success.
        _setState(const AuthUnlocked());
        return true;
      }
      final failures = current.consecutiveFailures + 1;
      final backoff = backoffFor(failures);
      _setState(AuthLocked(
        consecutiveFailures: failures,
        lastAttemptFailed: true,
        retryAllowedAt: backoff == Duration.zero ? null : nowProvider().add(backoff),
      ));
      return false;
    } on SecurityError catch (e) {
      _setState(AuthUnavailable(e));
      return false;
    } catch (e) {
      // Never leave the controller parked in AuthUnlocking: that state
      // disables the lock screen's submit button, so an unmodelled throw
      // would lock the user out until they restarted the app.
      _setState(AuthUnavailable(
        UnexpectedSecurityFailure(causeType: e.runtimeType.toString()),
      ));
      return false;
    } finally {
      _verificationInFlight = false;
    }
  }

  /// Locks the app if — and only if — a PIN is configured.
  ///
  /// Called by the lifecycle observer. Idempotent and safe from any state:
  /// [AuthNotConfigured] stays open (there is nothing to lock), and
  /// [AuthUnavailable] stays as it is because it already blocks sensitive
  /// content and must not be downgraded to an ordinary lock that could be
  /// dismissed.
  void lock() {
    switch (_state) {
      case AuthUnlocked():
      case AuthUnlocking():
        // Failure count resets on lock: this is a fresh lock, not a
        // continuation of an attack in progress.
        _setState(const AuthLocked());
      case AuthInitializing():
      case AuthNotConfigured():
      case AuthLocked():
      case AuthUnavailable():
        break;
    }
  }

  /// Re-reads PIN configuration after the user set, changed, or disabled a
  /// PIN in Settings, and moves to the matching state.
  ///
  /// After a successful setup or change the session stays UNLOCKED — the
  /// user just proved knowledge of the PIN, so forcing an immediate
  /// re-entry would be friction with no security gain. After a disable it
  /// becomes [AuthNotConfigured].
  Future<void> refreshAfterConfigurationChange() async {
    final generation = _generation;
    try {
      final configured = await _pinService.isPinConfigured();
      await secureWindow.setSecure(configured);
      // Same staleness guard as submitPin: backgrounding during this await
      // must not be undone by publishing AuthUnlocked afterwards.
      if (generation != _generation) return;
      _setState(configured ? const AuthUnlocked() : const AuthNotConfigured());
    } on SecurityError catch (e) {
      _setState(AuthUnavailable(e));
    } catch (e) {
      _setState(AuthUnavailable(
        UnexpectedSecurityFailure(causeType: e.runtimeType.toString()),
      ));
    }
  }
}
