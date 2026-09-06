// Milestone 7, sections 4 / 8 / 11 — the gate itself.
//
// The harness deliberately mirrors lib/app/app_bootstrap.dart: AuthScope
// above MaterialApp, and AuthGate installed through `MaterialApp.builder`,
// i.e. ABOVE the Navigator. That placement is the security guarantee — a
// gate mounted inside `home:` would sit on the Navigator's FIRST route and
// any later route (dialog, modal sheet) would paint on top of it. Wiring the
// harness any other way would make these tests pass while testing nothing.

import 'dart:async';

import 'package:familyfinance_pro/app/security/auth_gate.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/auth_state.dart';
import 'package:familyfinance_pro/security/pin_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../fakes/fake_secure_secret_store.dart';

const String _kPin = '1234';
const String _kWrongPin = '9999';

const ValueKey<String> _protectedKey = ValueKey<String>('protected-content');
const ValueKey<String> _lockScreenKey = ValueKey<String>('lock-screen');
const ValueKey<String> _pinFieldKey = ValueKey<String>('lock-pin-field');
const ValueKey<String> _submitKey = ValueKey<String>('lock-submit');
const ValueKey<String> _initializingKey = ValueKey<String>('auth-initializing');
const ValueKey<String> _unavailableKey = ValueKey<String>('auth-unavailable');
const ValueKey<String> _dialogSentinelKey = ValueKey<String>('dialog-sentinel');

/// NOTE (was a real production defect, now FIXED in lib/): mounting
/// [AuthGate] through `MaterialApp.builder` means the Navigator subtree is
/// not built while the app is locked — which is exactly the security
/// property this file tests — and that left [LockScreen]'s autofocusing PIN
/// [TextField] with no [Overlay] ancestor, so `EditableText` asserted
/// "No Overlay widget found" on every focus (and then `unfinished batch
/// edits` on dispose). [AuthGate] now supplies its own minimal
/// `Overlay.wrap`, which is an Overlay and NOT a Navigator, so nothing can
/// push a route above the lock screen. These tests therefore run with NO
/// exception filtering: every `expect(tester.takeException(), isNull)`
/// below is a real, unfiltered assertion.

/// Stands in for the whole financial shell. If this is findable, sensitive
/// UI was built.
class _ProtectedContent extends StatelessWidget {
  const _ProtectedContent();

  @override
  Widget build(BuildContext context) => const Scaffold(
        key: _protectedKey,
        body: Center(child: Text('sensitive')),
      );
}

void main() {
  late FakeSecureSecretStore store;
  late PinService pinService;

  setUp(() {
    store = FakeSecureSecretStore();
    // iterations: 1000 — see the note in auth_controller_test.dart.
    pinService = PinService(store, iterations: 1000);
  });

  AuthController buildController() {
    final controller = AuthController(pinService);
    addTearDown(controller.dispose);
    return controller;
  }

  Widget harness(AuthController controller) => AuthScope(
        controller: controller,
        pinService: pinService,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          builder: (context, child) => Directionality(
            textDirection: TextDirection.rtl,
            child: AuthGate(child: child ?? const SizedBox.shrink()),
          ),
          home: const _ProtectedContent(),
        ),
      );

  void expectGated() {
    expect(find.byKey(_protectedKey), findsNothing);
    expect(find.text('sensitive'), findsNothing);
  }

  testWidgets('AuthInitializing shows the status screen and builds no '
      'sensitive content', (tester) async {
    final controller = buildController();
    // initialize() is deliberately NOT awaited/started: this is the state
    // the real app renders during the very first frames.

    await tester.pumpWidget(harness(controller));
    await tester.pump();

    expect(find.byKey(_initializingKey), findsOneWidget);
    expectGated();
  });

  testWidgets('a configured, locked app shows the lock screen only',
      (tester) async {
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();

    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    expect(find.byKey(_lockScreenKey), findsOneWidget);
    expectGated();
  });

  testWidgets('a wrong PIN keeps the app locked and reports the error',
      (tester) async {
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();
    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(_pinFieldKey), _kWrongPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();

    expect(find.byKey(_lockScreenKey), findsOneWidget);
    expectGated();
    expect(find.text('קוד שגוי, נסה/י שוב'), findsOneWidget);
    expect(controller.state, isA<AuthLocked>());
    expect((controller.state as AuthLocked).consecutiveFailures, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the correct PIN reveals the protected content', (tester) async {
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();
    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(_pinFieldKey), _kPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();

    expect(find.byKey(_protectedKey), findsOneWidget);
    expect(find.byKey(_lockScreenKey), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('retrying with the correct PIN after a rejection unlocks',
      (tester) async {
    // Regression guard for a defect found on the physical device: the lock
    // screen used to clear its text field AFTER awaiting verification. The
    // controller publishes the rejected state (so the error renders) before
    // `submitPin` finishes unwinding, so that late clear could wipe a retry
    // the user had already typed — and the next submit then read an EMPTY
    // field and silently did nothing, stranding the user on the lock screen.
    // The field is now cleared before the await instead.
    //
    // Honest limitation, stated rather than implied: with the reduced test
    // work factor the timing window this test drives is narrow, so passing
    // here is weaker evidence than the on-device run. It still pins the
    // wrong-then-right retry sequence itself, which is the flow that broke.
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();
    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(_pinFieldKey), _kWrongPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();
    expect(find.byKey(_lockScreenKey), findsOneWidget);
    expectGated();

    await tester.enterText(find.byKey(_pinFieldKey), _kPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();

    expect(find.byKey(_protectedKey), findsOneWidget);
    expect(find.byKey(_lockScreenKey), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a secure-storage failure shows the unavailable screen, not the '
      'app', (tester) async {
    store.failReads = true;
    final controller = buildController();
    await controller.initialize();
    expect(controller.state, isA<AuthUnavailable>());

    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    expect(find.byKey(_unavailableKey), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('auth-unavailable-title')),
        findsOneWidget);
    expect(find.byKey(const ValueKey<String>('auth-unavailable-text')),
        findsOneWidget);
    expectGated();
  });

  testWidgets('Back cannot bypass the lock', (tester) async {
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();
    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();

    for (var press = 1; press <= 3; press++) {
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();

      expect(find.byKey(_lockScreenKey), findsOneWidget,
          reason: 'back press $press must not dismiss the lock screen');
      expect(find.byKey(_protectedKey), findsNothing,
          reason: 'back press $press must not reveal sensitive content');
    }

    expect(tester.takeException(), isNull);
  });

  testWidgets('a dialog opened before locking does not survive the lock',
      (tester) async {
    await pinService.setPin(_kPin);
    final controller = buildController();
    await controller.initialize();
    await tester.pumpWidget(harness(controller));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_pinFieldKey), _kPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();
    expect(find.byKey(_protectedKey), findsOneWidget);

    unawaited(showDialog<void>(
      context: tester.element(find.byKey(_protectedKey)),
      builder: (_) => const AlertDialog(
        content: Text('סכום רגיש', key: _dialogSentinelKey),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(_dialogSentinelKey), findsOneWidget);

    controller.lock();
    await tester.pumpAndSettle();

    expect(find.byKey(_lockScreenKey), findsOneWidget);
    expect(find.byKey(_dialogSentinelKey), findsNothing);
    expectGated();

    // And unlocking again returns a clean shell, with nothing thrown along
    // the way by tearing the Navigator down under an open route.
    await tester.enterText(find.byKey(_pinFieldKey), _kPin);
    await tester.tap(find.byKey(_submitKey));
    await tester.pumpAndSettle();

    expect(find.byKey(_protectedKey), findsOneWidget);
    expect(find.byKey(_dialogSentinelKey), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
