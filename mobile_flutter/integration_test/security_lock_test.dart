// Milestone 7, physical Android QA gate — the security layer running
// against REAL platform-secure storage (Android Keystore-backed) and the
// REAL production key-derivation work factor, on real hardware.
//
// Everything here drives the actual production entry point
// (`const AppBootstrap()`), so the secure store is FlutterSecureSecretStore
// and the PBKDF2 cost is the shipped one — no fakes, no reduced iteration
// count. That is the whole point of running this on a device.
//
// SCOPE NOTE, discovered on-device in Milestone 5 and still binding here:
// triggering the TRUE root Back (or sending the app to the background with
// a real HOME keyevent) from inside a Flutter integration_test process
// backgrounds the app and hangs any further interaction with the widget
// tree. So lifecycle transitions here are driven through
// `handleAppLifecycleStateChanged`, which is the exact same code path the
// OS callback uses — and the genuinely-external checks (cold start showing
// the lock screen, FLAG_SECURE actually present on the window) are verified
// separately from the host via adb, not from inside this process.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

import 'package:familyfinance_pro/app/app_bootstrap.dart';
import 'package:familyfinance_pro/security/flutter_secure_secret_store.dart';
import 'package:familyfinance_pro/security/pin_service.dart';
import 'package:familyfinance_pro/security/pin_verifier.dart';

const String _kPin = '4321';
const String _kNewPin = '778899';

/// Removes any leftover PIN record directly, so a run always starts from a
/// known state and never leaves the device locked behind a PIN the user
/// does not know.
Future<void> _clearStoredPin() async {
  await FlutterSecureSecretStore().delete(kPinRecordStorageKey);
}

/// Removes the production database file between tests.
///
/// Every test here pumps its own `AppBootstrap`, and each one opens the
/// production database. Without this, the second test opens a SECOND
/// AppDatabase over the SAME file while the first is still open — drift
/// warns that this races and can corrupt the database, and on device the
/// process then dies mid-test. Milestone 6's on-device navigation suite
/// already used exactly this reset for the same reason; it is reused
/// verbatim rather than reinvented.
Future<void> _deleteProductionDbIfPresent() async {
  final docsDir = await getApplicationDocumentsDirectory();
  final file = File('${docsDir.path}/familyfinance.sqlite');
  if (await file.exists()) {
    await file.delete();
  }
}

Future<void> _resetDeviceState() async {
  await _clearStoredPin();
  await _deleteProductionDbIfPresent();
}

Future<void> _bootUnlockedApp(WidgetTester tester) async {
  await tester.pumpWidget(const AppBootstrap());
  await tester.pumpAndSettle();
}

/// Reports which of the app's known landmark keys are currently mounted.
///
/// Without this, a wait timeout says only "X never appeared" and gives no
/// clue whether the app was still locked, sitting on an error screen, or
/// stuck loading — which is exactly the question that matters when a
/// security gate does not open.
String _onScreenDebug(WidgetTester tester) {
  const candidates = <String>[
    'lock-screen',
    'auth-initializing',
    'auth-unavailable',
    'bootstrap-loading',
    'bootstrap-failed',
    'bootstrap-ready',
    'screen-loading',
    'screen-error-text',
    'screen-loaded-home',
    'screen-loaded-settings',
    'lock-submit',
  ];
  final present = <String>[
    for (final key in candidates)
      if (find.byKey(ValueKey(key)).evaluate().isNotEmpty) key,
  ];
  if (find.text('קוד שגוי, נסה/י שוב').evaluate().isNotEmpty) {
    present.add('<wrong-PIN error text>');
  }
  return present.isEmpty ? '(none of the known landmark keys)' : present.join(', ');
}

/// Pumps in real time until [finder] matches, or fails with a clear message.
///
/// `pumpAndSettle` is NOT sufficient after any PIN action on a real device:
/// key derivation is deliberately expensive (measured ~1.6 s here) and it
/// yields to the event loop with timers rather than scheduling frames, so
/// `pumpAndSettle` happily returns while the operation is still in flight.
/// On the host, with the reduced test work factor, that race is invisible —
/// which is exactly why it had to be caught on hardware.
Future<void> _waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  String? describe,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    if (finder.evaluate().isNotEmpty) return;
    // Surface a build/runtime error immediately instead of letting it hide
    // behind a 30-second timeout: if the widget we are waiting for failed to
    // build, the real cause is the recorded exception, not the timeout.
    final error = tester.takeException();
    if (error != null) {
      fail('exception while waiting for ${describe ?? 'a matching widget'}: $error');
    }
    await tester.pump(const Duration(milliseconds: 100));
  }
  fail(
    'timed out waiting for ${describe ?? 'a matching widget'}. '
    'On screen now: ${_onScreenDebug(tester)}',
  );
}

Future<void> _waitForGone(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
  String? describe,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    if (finder.evaluate().isEmpty) return;
    await tester.pump(const Duration(milliseconds: 100));
  }
  fail('timed out waiting for ${describe ?? 'a matching widget'} to disappear');
}

Future<void> _waitForKey(WidgetTester tester, String key) =>
    _waitFor(tester, find.byKey(ValueKey(key)), describe: 'key "$key"');

Future<void> _waitForKeyGone(WidgetTester tester, String key) =>
    _waitForGone(tester, find.byKey(ValueKey(key)), describe: 'key "$key"');

/// Brings a target into view before acting on it.
///
/// The Settings screen's security section is the LAST section of a lazily
/// built `ListView`, so on a real device it is not merely off-screen — it
/// has not been built at all, and `ensureVisible` fails with
/// "Bad state: No element" because there is no element yet. Only
/// `scrollUntilVisible` can bring it into existence.
///
/// The scrollable is located as a descendant of the settings list
/// specifically, NOT via `find.byType(Scrollable).first`: the navigation
/// shell keeps all five screens alive in an `IndexedStack`, so `.first`
/// would pick some other screen's scroll view.
Future<void> _bringIntoView(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    final settingsScrollable = find.descendant(
      of: find.byKey(const ValueKey('settings-list')),
      matching: find.byType(Scrollable),
    );
    if (settingsScrollable.evaluate().isNotEmpty) {
      await tester.scrollUntilVisible(
        finder,
        200,
        scrollable: settingsScrollable.first,
        maxScrolls: 60,
      );
      await tester.pumpAndSettle();
      return;
    }
  }
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(ValueKey(key));
  await _bringIntoView(tester, finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _enterKey(WidgetTester tester, String key, String text) async {
  final finder = find.byKey(ValueKey(key));
  await _bringIntoView(tester, finder);
  await tester.enterText(finder, text);
  await tester.pumpAndSettle();
}

Future<void> _openSettings(WidgetTester tester) async {
  await _tapKey(tester, 'nav-destination-settings');
}

Future<void> _fillAndSubmit(
  WidgetTester tester,
  Map<String, String> fields,
) async {
  for (final entry in fields.entries) {
    await _enterKey(tester, entry.key, entry.value);
  }
  await _tapKey(tester, 'pin-form-submit');
}

// NOTE — why there is no in-process lifecycle test here.
//
// Driving `handleAppLifecycleStateChanged(AppLifecycleState.paused)` from
// inside the integration_test process was tried and had to be abandoned:
// on real hardware that genuinely pauses the app, the engine stops
// producing frames, and the very next `pumpAndSettle` hangs (measured: 10
// minutes before the harness gave up). This is the same trap Milestone 5
// hit with the true root Back.
//
// So the split is:
//   - lifecycle policy itself (which states lock, which must NOT lock) is
//     covered exhaustively on the host in test/security/lifecycle_lock_test.dart;
//   - the REAL background/resume behaviour is verified externally from the
//     host with adb (HOME keyevent, relaunch, dump the view hierarchy), where
//     no Dart test process can be hung by it;
//   - what runs in-process below is the startup-locked path, which is the
//     same AuthLocked state a resume produces and is section 5's own
//     requirement: an app with a PIN configured must START locked.

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(_resetDeviceState);
  tearDown(_resetDeviceState);

  testWidgets('with no PIN configured the app opens straight to Home, no lock screen', (tester) async {
    await _bootUnlockedApp(tester);

    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
    expect(find.byKey(const ValueKey('lock-screen')), findsNothing);
    expect(find.byKey(const ValueKey('auth-unavailable')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'a configured PIN makes the app START locked, and the correct PIN '
    'unlocks it; navigation works afterwards',
    (tester) async {
      // Configure through the real service against the real Keystore, then
      // cold-start the real production widget. This is exactly the state a
      // resume-after-background produces.
      await PinService(FlutterSecureSecretStore()).setPin(_kPin);

      await tester.pumpWidget(const AppBootstrap());
      await _waitForKey(tester, 'lock-screen');

      // No financial screen may exist behind the lock.
      expect(find.byKey(const ValueKey('screen-loaded-home')), findsNothing);
      expect(find.byKey(const ValueKey('screen-loaded-settings')), findsNothing);
      expect(tester.takeException(), isNull);

      // NOTE: "Back cannot bypass the lock" is deliberately NOT exercised
      // here. While locked there is no Navigator in the tree at all (that is
      // the security property), so `handlePopRoute` finds nothing to pop and
      // falls through to a real `SystemNavigator.pop()` — which on actual
      // hardware backgrounds the app and kills this test process. That is
      // the correct, safe product behaviour, and it is precisely the trap
      // Milestone 5 documented for the true root Back. It is covered on the
      // host in test/security/auth_gate_test.dart, where SystemNavigator.pop()
      // is inert, and by the host-side adb checks.

      await _enterKey(tester, 'lock-pin-field', _kPin);
      await _tapKey(tester, 'lock-submit');
      await _waitForKey(tester, 'screen-loaded-home');
      await _waitForKeyGone(tester, 'lock-screen');
      expect(tester.takeException(), isNull);

      for (final name in ['forecast', 'goals', 'categories', 'settings']) {
        await _tapKey(tester, 'nav-destination-$name');
        expect(find.byKey(ValueKey('screen-loaded-$name')), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    },
  );

  testWidgets('a wrong PIN is rejected and leaves the app locked', (tester) async {
    await PinService(FlutterSecureSecretStore()).setPin(_kPin);

    await tester.pumpWidget(const AppBootstrap());
    await _waitForKey(tester, 'lock-screen');

    await _enterKey(tester, 'lock-pin-field', '9999');
    await _tapKey(tester, 'lock-submit');
    await _waitFor(
      tester,
      find.text('קוד שגוי, נסה/י שוב'),
      describe: 'the wrong-PIN error message',
    );

    expect(find.byKey(const ValueKey('lock-screen')), findsOneWidget);
    expect(find.byKey(const ValueKey('screen-loaded-home')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('after a rejected PIN, retrying with the correct one unlocks', (tester) async {
    await PinService(FlutterSecureSecretStore()).setPin(_kPin);

    await tester.pumpWidget(const AppBootstrap());
    await _waitForKey(tester, 'lock-screen');

    await _enterKey(tester, 'lock-pin-field', '9999');
    await _tapKey(tester, 'lock-submit');
    await _waitFor(
      tester,
      find.text('קוד שגוי, נסה/י שוב'),
      describe: 'the wrong-PIN error message',
    );

    await _enterKey(tester, 'lock-pin-field', _kPin);
    await _tapKey(tester, 'lock-submit');
    await _waitForKey(tester, 'screen-loaded-home');
    expect(tester.takeException(), isNull);
  });

  testWidgets('change PIN then disable PIN, against real secure storage', (tester) async {
    await _bootUnlockedApp(tester);
    await _openSettings(tester);

    await _tapKey(tester, 'settings-pin-setup-button');
    await _fillAndSubmit(tester, {
      'pin-form-new': _kPin,
      'pin-form-confirm': _kPin,
    });
    await _waitForKey(tester, 'settings-pin-change-button');

    // --- change with the WRONG current PIN must be refused -------------
    await _tapKey(tester, 'settings-pin-change-button');
    await _fillAndSubmit(tester, {
      'pin-form-current': '0000',
      'pin-form-new': _kNewPin,
      'pin-form-confirm': _kNewPin,
    });
    await _waitForKey(tester, 'pin-form-error');
    expect(tester.takeException(), isNull);

    // The old PIN must still be the live one.
    final service = PinService(FlutterSecureSecretStore());
    expect(await service.verifyPin(_kPin), isTrue);
    expect(await service.verifyPin(_kNewPin), isFalse);

    // --- change with the CORRECT current PIN succeeds ------------------
    await _fillAndSubmit(tester, {
      'pin-form-current': _kPin,
      'pin-form-new': _kNewPin,
      'pin-form-confirm': _kNewPin,
    });
    // Wait for a POSITIVE completion signal, not for the error to vanish:
    // _submit() clears the error the instant submission STARTS, so
    // "pin-form-error is gone" is true ~1.1 s before the key derivation and
    // Keystore write have actually finished. The action buttons only come
    // back once the form closes on success, so that is the real signal.
    await _waitForKey(tester, 'settings-pin-change-button');
    expect(tester.takeException(), isNull);
    expect(await service.verifyPin(_kNewPin), isTrue);
    expect(await service.verifyPin(_kPin), isFalse);

    // --- disable, and confirm the app stops requiring a PIN ------------
    await _tapKey(tester, 'settings-pin-disable-button');
    await _fillAndSubmit(tester, {'pin-form-current': _kNewPin});
    await _waitForKey(tester, 'settings-pin-setup-button');
    expect(tester.takeException(), isNull);
    expect(await service.isPinConfigured(), isFalse);
    expect(find.byKey(const ValueKey('lock-screen')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('MEASURED: production-work-factor key derivation latency on this device', (tester) async {
    final salt = generatePinSalt();

    // First call includes one-time JIT compilation of the KDF's hot loop,
    // which is NOT what a user pays on a normal unlock and does not exist at
    // all in a release AOT build. Reporting only that number would badly
    // overstate the real cost, so the cold sample is measured separately and
    // the warm samples are what the work factor is judged on.
    final coldWatch = Stopwatch()..start();
    await derivePinVerifier(pin: _kPin, salt: salt, iterations: kPinKdfIterations);
    coldWatch.stop();

    final warm = <int>[];
    for (var i = 0; i < 3; i++) {
      final sw = Stopwatch()..start();
      await derivePinVerifier(pin: _kPin, salt: salt, iterations: kPinKdfIterations);
      sw.stop();
      warm.add(sw.elapsedMilliseconds);
    }

    // Printed so the physical-QA report can quote MEASURED numbers rather
    // than assumed ones. Deliberately not asserted against a threshold — a
    // timing assertion on real hardware would be flaky.
    debugPrint(
      'PBKDF2-MEASUREMENT iterations=$kPinKdfIterations '
      'coldMs=${coldWatch.elapsedMilliseconds} warmMs=$warm',
    );
    expect(warm, everyElement(greaterThan(0)));
  });
}
