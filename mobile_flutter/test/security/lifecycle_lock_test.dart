// Milestone 7, section 6 — lifecycle auto-lock.
//
// The approved policy is "lock whenever the app leaves the foreground, with
// no grace timer", plus one deliberate exception: `inactive` must NOT lock,
// because it fires for the notification shade, permission dialogs and
// incoming-call banners. These tests pin BOTH halves down — the locks that
// must happen and the false lock that must not — since a regression in
// either direction is invisible until a user hits it.
//
// The observer is exercised directly (no WidgetsBinding registration is
// needed) so the assertions are about the policy, not about plumbing.

import 'package:familyfinance_pro/security/app_lock_lifecycle_observer.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/auth_state.dart';
import 'package:familyfinance_pro/security/pin_service.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';

import '../fakes/fake_secure_secret_store.dart';

const String _kPin = '4321';

void main() {
  late FakeSecureSecretStore store;
  late PinService pinService;

  setUp(() {
    store = FakeSecureSecretStore();
    // iterations: 1000 — see the note in auth_controller_test.dart.
    pinService = PinService(store, iterations: 1000);
  });

  /// A controller in the UNLOCKED state, with its lifecycle observer.
  Future<(AuthController, AppLockLifecycleObserver)> unlockedController() async {
    await pinService.setPin(_kPin);
    final controller = AuthController(pinService);
    addTearDown(controller.dispose);
    await controller.initialize();
    expect(controller.state, isA<AuthLocked>());
    expect(await controller.submitPin(_kPin), isTrue);
    expect(controller.state, isA<AuthUnlocked>());
    return (controller, AppLockLifecycleObserver(controller));
  }

  group('with a PIN configured', () {
    for (final state in <AppLifecycleState>[
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.detached,
    ]) {
      test('$state locks the app', () async {
        final (controller, observer) = await unlockedController();

        observer.didChangeAppLifecycleState(state);

        expect(controller.state, isA<AuthLocked>());
        expect(controller.allowsSensitiveContent, isFalse);
      });
    }

    test('inactive does NOT lock (shade / permission dialog / call banner)',
        () async {
      final (controller, observer) = await unlockedController();

      observer.didChangeAppLifecycleState(AppLifecycleState.inactive);

      expect(controller.state, isA<AuthUnlocked>());
      expect(controller.allowsSensitiveContent, isTrue);
    });

    test('resumed does not change state', () async {
      final (controller, observer) = await unlockedController();

      observer.didChangeAppLifecycleState(AppLifecycleState.resumed);

      expect(controller.state, isA<AuthUnlocked>());
      expect(controller.allowsSensitiveContent, isTrue);
    });
  });

  group('with NO PIN configured', () {
    for (final state in AppLifecycleState.values) {
      test('$state leaves the app open', () async {
        final controller = AuthController(pinService);
        addTearDown(controller.dispose);
        await controller.initialize();
        expect(controller.state, isA<AuthNotConfigured>());
        final observer = AppLockLifecycleObserver(controller);

        observer.didChangeAppLifecycleState(state);

        expect(controller.state, isA<AuthNotConfigured>());
        expect(controller.allowsSensitiveContent, isTrue);
      });
    }
  });

  test('the lock is not a one-shot: background/resume re-locks every time',
      () async {
    final (controller, observer) = await unlockedController();

    // First cycle: background => locked.
    observer.didChangeAppLifecycleState(AppLifecycleState.paused);
    expect(controller.state, isA<AuthLocked>());

    // Resuming does NOT unlock — the PIN is required again.
    observer.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(controller.state, isA<AuthLocked>());
    expect(controller.allowsSensitiveContent, isFalse);

    expect(await controller.submitPin(_kPin), isTrue);
    expect(controller.state, isA<AuthUnlocked>());

    // Second cycle: it must lock again, not stay open.
    observer.didChangeAppLifecycleState(AppLifecycleState.paused);
    expect(controller.state, isA<AuthLocked>());
    observer.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(controller.state, isA<AuthLocked>());
    expect(controller.allowsSensitiveContent, isFalse);
  });
}
