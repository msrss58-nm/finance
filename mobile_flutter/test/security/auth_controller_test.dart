// Milestone 7 — AuthController behavioural contract.
//
// This suite exists to pin down the ONE rule the whole security layer rests
// on: nothing other than "no PIN configured" or "verified unlock" may ever
// allow sensitive content. Every startup path, every failure path and every
// storage fault is asserted against `allowsSensitiveContent` explicitly,
// because a regression there is a silent, total bypass.
//
// PERFORMANCE: every PinService here is built with iterations: 1000. The
// production work factor (kPinKdfIterations = 210000) is deliberately slow
// and would make this suite unusable; the stored record carries its own
// iteration count, so a low value in tests can never affect real users.

import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/auth_state.dart';
import 'package:familyfinance_pro/security/pin_service.dart';
import 'package:familyfinance_pro/security/secure_window.dart';
import 'package:familyfinance_pro/security/security_errors.dart';
import 'package:flutter_test/flutter_test.dart';

import '../fakes/fake_secure_secret_store.dart';

const String _kPin = '1234';
const String _kWrongPin = '9999';

/// Records every FLAG_SECURE request so "recents protection follows PIN
/// configuration" can be asserted rather than assumed.
class RecordingSecureWindowController implements SecureWindowController {
  final List<bool> calls = <bool>[];

  @override
  Future<void> setSecure(bool enabled) async => calls.add(enabled);
}

/// Controllable clock, so backoff can be exercised without real waiting.
class _FakeClock {
  _FakeClock(this._now);

  DateTime _now;

  DateTime now() => _now;

  void advance(Duration delta) => _now = _now.add(delta);
}

void main() {
  late FakeSecureSecretStore store;
  late PinService pinService;

  setUp(() {
    store = FakeSecureSecretStore();
    pinService = PinService(store, iterations: 1000);
  });

  AuthController buildController({
    SecureWindowController? secureWindow,
    DateTime Function()? nowProvider,
  }) {
    final controller = AuthController(
      pinService,
      secureWindow: secureWindow ?? const NoopSecureWindowController(),
      nowProvider: nowProvider ?? DateTime.now,
    );
    addTearDown(controller.dispose);
    return controller;
  }

  group('a lock() during an in-flight operation must win', () {
    // Found by the final security review. submitPin captured the state
    // before awaiting and published its result afterwards, checking only
    // whether the controller had been disposed. Real sequence: the user taps
    // unlock with the CORRECT PIN and immediately backgrounds the app (home
    // button, incoming call). The lifecycle observer calls lock(); ~1.1 s
    // later the verification completes and publishes AuthUnlocked — on an app
    // that has already left the foreground. `resumed` does not lock, so it
    // would come back UNLOCKED. That is squarely inside the milestone's own
    // stated threat model ("exposure after app backgrounding").
    test('backgrounding mid-verification leaves the app LOCKED, '
        'even though the PIN was correct', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();
      expect(controller.state, isA<AuthLocked>());

      store.readDelay = const Duration(milliseconds: 80);
      final pending = controller.submitPin(_kPin);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(controller.state, isA<AuthUnlocking>());

      controller.lock(); // the app goes to the background mid-verification

      final unlocked = await pending;
      expect(unlocked, isFalse, reason: 'the superseded attempt must not report success');
      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('a configuration refresh interrupted by lock() does not unlock', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();
      // refreshAfterConfigurationChange is only ever reached from the
      // Settings screen, which lives behind the gate — so the realistic
      // starting point is UNLOCKED, and lock() from an already-locked state
      // is correctly a no-op.
      expect(await controller.submitPin(_kPin), isTrue);
      expect(controller.state, isA<AuthUnlocked>());

      store.readDelay = const Duration(milliseconds: 80);
      final pending = controller.refreshAfterConfigurationChange();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      controller.lock(); // backgrounded while the refresh is in flight
      await pending;

      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
    });
  });

  group('an unmodelled exception still reaches a definite gated state', () {
    // Also from the final security review: only `on SecurityError` was
    // caught. Anything else (e.g. thrown from inside the KDF package) left
    // the controller parked in AuthUnlocking forever — which disables the
    // lock screen's submit button, so the user could not retry at all
    // without restarting the app.
    test('submitPin surfaces a non-SecurityError as AuthUnavailable', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      store.failReadsWithUnexpectedError = true;
      final unlocked = await controller.submitPin(_kPin);

      expect(unlocked, isFalse);
      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.state, isNot(isA<AuthUnlocking>()));
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('initialize surfaces a non-SecurityError as AuthUnavailable', () async {
      store.failReadsWithUnexpectedError = true;
      final controller = buildController();
      await controller.initialize();

      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('the unexpected-failure error carries no secret material', () async {
      store.failReadsWithUnexpectedError = true;
      final controller = buildController();
      await controller.initialize();

      final error = (controller.state as AuthUnavailable).error;
      expect(error, isA<UnexpectedSecurityFailure>());
      expect(error.toString().contains(_kPin), isFalse);
      expect(error.message.contains(_kPin), isFalse);
    });
  });

  group('startup state (section 5)', () {
    test('is AuthInitializing and gated before initialize()', () {
      final controller = buildController();

      expect(controller.state, isA<AuthInitializing>());
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('no PIN configured => AuthNotConfigured and content allowed', () async {
      final controller = buildController();

      await controller.initialize();

      expect(controller.state, isA<AuthNotConfigured>());
      expect(controller.allowsSensitiveContent, isTrue);
    });

    test('PIN configured => starts LOCKED, content gated', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();

      await controller.initialize();

      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
      final locked = controller.state as AuthLocked;
      expect(locked.consecutiveFailures, 0);
      expect(locked.lastAttemptFailed, isFalse);
      expect(locked.retryAllowedAt, isNull);
    });

    test(
      'secure-storage read failure => AuthUnavailable, NEVER "PIN disabled" '
      'and NEVER unlocked',
      () async {
        store.failReads = true;
        final controller = buildController();

        await controller.initialize();

        expect(controller.state, isA<AuthUnavailable>());
        expect(controller.state, isNot(isA<AuthNotConfigured>()));
        expect(controller.state, isNot(isA<AuthUnlocked>()));
        expect(controller.allowsSensitiveContent, isFalse);
        expect(
          (controller.state as AuthUnavailable).error,
          isA<SecureStorageReadFailure>(),
        );
      },
    );

    test('corrupt stored record => AuthUnavailable, not AuthNotConfigured',
        () async {
      final corruptStore = FakeSecureSecretStore(
        initial: <String, String>{kPinRecordStorageKey: 'this-is-not-json'},
      );
      final controller = AuthController(
        PinService(corruptStore, iterations: 1000),
      );
      addTearDown(controller.dispose);

      await controller.initialize();

      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.state, isNot(isA<AuthNotConfigured>()));
      expect(controller.allowsSensitiveContent, isFalse);
      expect(
        (controller.state as AuthUnavailable).error,
        isA<PinConfigurationFailure>(),
      );
    });
  });

  group('submitPin', () {
    test('correct PIN unlocks', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      final ok = await controller.submitPin(_kPin);

      expect(ok, isTrue);
      expect(controller.state, isA<AuthUnlocked>());
      expect(controller.allowsSensitiveContent, isTrue);
    });

    test('wrong PIN counts one failure and stays gated', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      final ok = await controller.submitPin(_kWrongPin);

      expect(ok, isFalse);
      expect(controller.state, isA<AuthLocked>());
      final locked = controller.state as AuthLocked;
      expect(locked.consecutiveFailures, 1);
      expect(locked.lastAttemptFailed, isTrue);
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('eight consecutive wrong PINs increment monotonically without ever '
        'throwing or allowing content', () async {
      await pinService.setPin(_kPin);
      final clock = _FakeClock(DateTime(2026, 9, 6, 10));
      final controller = buildController(nowProvider: clock.now);
      await controller.initialize();

      final observed = <int>[];
      for (var attempt = 1; attempt <= 8; attempt++) {
        // Step past any active backoff so this test measures the counter,
        // not the throttle (backoff has its own test below).
        clock.advance(const Duration(minutes: 1));
        final ok = await controller.submitPin(_kWrongPin);
        expect(ok, isFalse, reason: 'attempt $attempt must not unlock');
        expect(controller.state, isA<AuthLocked>());
        expect(controller.allowsSensitiveContent, isFalse,
            reason: 'attempt $attempt must stay gated');
        observed.add((controller.state as AuthLocked).consecutiveFailures);
      }

      expect(observed, <int>[1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('a successful unlock resets the failure counter', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      await controller.submitPin(_kWrongPin);
      await controller.submitPin(_kWrongPin);
      expect((controller.state as AuthLocked).consecutiveFailures, 2);

      expect(await controller.submitPin(_kPin), isTrue);
      controller.lock();

      expect(controller.state, isA<AuthLocked>());
      final relocked = controller.state as AuthLocked;
      expect(relocked.consecutiveFailures, 0);
      expect(relocked.lastAttemptFailed, isFalse);
      expect(relocked.retryAllowedAt, isNull);
    });

    test('storage failure during verification => AuthUnavailable, returns false',
        () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();
      expect(controller.state, isA<AuthLocked>());

      store.failReads = true;
      final ok = await controller.submitPin(_kPin);

      expect(ok, isFalse);
      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.allowsSensitiveContent, isFalse);
    });
  });

  group('backoff (section 9)', () {
    test('schedule is bounded and capped at 30s', () {
      expect(AuthController.backoffFor(0), Duration.zero);
      expect(AuthController.backoffFor(1), Duration.zero);
      expect(AuthController.backoffFor(2), Duration.zero);
      expect(AuthController.backoffFor(3), const Duration(seconds: 5));
      expect(AuthController.backoffFor(4), const Duration(seconds: 10));
      expect(AuthController.backoffFor(5), const Duration(seconds: 20));
      expect(AuthController.backoffFor(6), const Duration(seconds: 30));
      expect(AuthController.backoffFor(100), const Duration(seconds: 30));
    });

    test('is enforced: the correct PIN is rejected until retryAllowedAt, and '
        'hammering does not inflate the delay', () async {
      await pinService.setPin(_kPin);
      final clock = _FakeClock(DateTime(2026, 9, 6, 10));
      final controller = buildController(nowProvider: clock.now);
      await controller.initialize();

      for (var i = 0; i < 3; i++) {
        await controller.submitPin(_kWrongPin);
      }
      final throttled = controller.state as AuthLocked;
      expect(throttled.consecutiveFailures, 3);
      expect(throttled.retryAllowedAt, isNotNull);
      expect(
        throttled.retryAllowedAt,
        clock.now().add(const Duration(seconds: 5)),
      );

      // Still inside the backoff window: even the CORRECT PIN is refused.
      clock.advance(const Duration(seconds: 4));
      expect(await controller.submitPin(_kPin), isFalse);
      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
      // A rejected-during-backoff attempt must not count as a failure.
      expect((controller.state as AuthLocked).consecutiveFailures, 3);
      expect(
        (controller.state as AuthLocked).retryAllowedAt,
        throttled.retryAllowedAt,
      );

      // Hammering repeatedly must not extend the window either.
      for (var i = 0; i < 5; i++) {
        expect(await controller.submitPin(_kWrongPin), isFalse);
      }
      expect((controller.state as AuthLocked).consecutiveFailures, 3);
      expect(
        (controller.state as AuthLocked).retryAllowedAt,
        throttled.retryAllowedAt,
      );

      // Past the window: the correct PIN works again.
      clock.advance(const Duration(seconds: 2));
      expect(await controller.submitPin(_kPin), isTrue);
      expect(controller.state, isA<AuthUnlocked>());
    });
  });

  group('lock()', () {
    test('locks from AuthUnlocked', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();
      await controller.submitPin(_kPin);
      expect(controller.state, isA<AuthUnlocked>());

      controller.lock();

      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('is idempotent', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();
      await controller.submitPin(_kPin);

      controller.lock();
      controller.lock();
      controller.lock();

      expect(controller.state, isA<AuthLocked>());
      expect(controller.allowsSensitiveContent, isFalse);
    });

    test('does nothing from AuthNotConfigured', () async {
      final controller = buildController();
      await controller.initialize();
      expect(controller.state, isA<AuthNotConfigured>());

      controller.lock();

      expect(controller.state, isA<AuthNotConfigured>());
      expect(controller.allowsSensitiveContent, isTrue);
    });

    test('does not downgrade AuthUnavailable into a dismissible lock',
        () async {
      store.failReads = true;
      final controller = buildController();
      await controller.initialize();
      expect(controller.state, isA<AuthUnavailable>());

      controller.lock();

      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.state, isNot(isA<AuthLocked>()));
      expect(controller.allowsSensitiveContent, isFalse);
    });
  });

  group('refreshAfterConfigurationChange()', () {
    test('after setPin => AuthUnlocked', () async {
      final controller = buildController();
      await controller.initialize();
      expect(controller.state, isA<AuthNotConfigured>());

      await pinService.setPin(_kPin);
      await controller.refreshAfterConfigurationChange();

      expect(controller.state, isA<AuthUnlocked>());
      expect(controller.allowsSensitiveContent, isTrue);
    });

    test('after disablePin => AuthNotConfigured', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      await pinService.disablePin(currentPin: _kPin);
      await controller.refreshAfterConfigurationChange();

      expect(controller.state, isA<AuthNotConfigured>());
    });

    test('when reads fail => AuthUnavailable', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      await controller.initialize();

      store.failReads = true;
      await controller.refreshAfterConfigurationChange();

      expect(controller.state, isA<AuthUnavailable>());
      expect(controller.allowsSensitiveContent, isFalse);
    });
  });

  group('notifications', () {
    test('listeners are notified on each state change', () async {
      await pinService.setPin(_kPin);
      final controller = buildController();
      var notifications = 0;
      controller.addListener(() => notifications++);

      await controller.initialize();
      expect(notifications, 1, reason: 'AuthInitializing -> AuthLocked');

      await controller.submitPin(_kWrongPin);
      expect(notifications, 3, reason: 'AuthUnlocking -> AuthLocked(failed)');

      await controller.submitPin(_kPin);
      expect(notifications, 5, reason: 'AuthUnlocking -> AuthUnlocked');

      controller.lock();
      expect(notifications, 6, reason: 'AuthUnlocked -> AuthLocked');

      // No state change => no notification.
      controller.lock();
      expect(notifications, 6);
    });
  });

  group('recents protection follows PIN configuration (section 7)', () {
    test('setSecure(true) when a PIN is configured', () async {
      await pinService.setPin(_kPin);
      final secureWindow = RecordingSecureWindowController();
      final controller = buildController(secureWindow: secureWindow);

      await controller.initialize();

      expect(secureWindow.calls, <bool>[true]);
    });

    test('setSecure(false) when no PIN is configured', () async {
      final secureWindow = RecordingSecureWindowController();
      final controller = buildController(secureWindow: secureWindow);

      await controller.initialize();

      expect(secureWindow.calls, <bool>[false]);
    });

    test('follows a configuration change in both directions', () async {
      final secureWindow = RecordingSecureWindowController();
      final controller = buildController(secureWindow: secureWindow);
      await controller.initialize();

      await pinService.setPin(_kPin);
      await controller.refreshAfterConfigurationChange();
      await pinService.disablePin(currentPin: _kPin);
      await controller.refreshAfterConfigurationChange();

      expect(secureWindow.calls, <bool>[false, true, false]);
    });
  });
}
