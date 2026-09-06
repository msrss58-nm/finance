// Milestone 9 physical-QA fixture — notification tap vs. the PIN gate.
//
// Runs the REAL [AppBootstrap] on the device, over the device's real
// Keystore-backed secure storage and a real on-disk database, with a real
// PIN configured. It then simulates the plugin's tap callback and proves
// that:
//   1. while locked, the tap changes nothing — no screen is built, and the
//      payload is still waiting;
//   2. after a real unlock, the app deterministically lands on Goals;
//   3. one tap navigates at most once.
//
// The tap is injected through [AppBootstrap]'s test seam rather than by
// waiting for a real OS delivery, because tapping a real notification
// requires an external gesture that would terminate this test process.
// Actual OS delivery is verified separately in
// `notification_delivery_test.dart`.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

import 'package:familyfinance_pro/app/app_bootstrap.dart';
import 'package:familyfinance_pro/app/services/notification_scope.dart';
import 'package:familyfinance_pro/notifications/notification_gateway.dart';
import 'package:familyfinance_pro/security/flutter_secure_secret_store.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

/// A gateway that touches no platform channel: this fixture is about the
/// AuthGate interaction, not about the plugin.
class _InertGateway implements NotificationGateway {
  @override
  Future<NotificationResult<void>> initialize() async =>
      const NotificationOk(null);

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      requestPermission() async =>
          const NotificationOk(NotificationPermissionStatus.granted);

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      permissionStatus() async =>
          const NotificationOk(NotificationPermissionStatus.granted);

  @override
  Future<NotificationResult<void>> schedule(ScheduledNotification n) async =>
      const NotificationOk(null);

  @override
  Future<NotificationResult<void>> cancel(int id) async =>
      const NotificationOk(null);

  @override
  Future<NotificationResult<void>> cancelAllOwned() async =>
      const NotificationOk(null);

  @override
  Future<NotificationResult<List<int>>> pendingOwnedIds() async =>
      const NotificationOk(<int>[]);

  @override
  Future<NotificationResult<bool>> openSystemNotificationSettings() async =>
      const NotificationOk(false);
}

const String _kPin = '4321';
const int _kFastIterations = 1000;

Future<void> _deleteDatabaseFile() async {
  final dir = await getApplicationDocumentsDirectory();
  final file = File('${dir.path}/familyfinance.sqlite');
  if (file.existsSync()) file.deleteSync();
}

/// Pumps until [condition] holds — never waits on the ABSENCE of something,
/// and never uses pumpAndSettle across the (deliberately slow) key
/// derivation.
Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    if (condition()) return;
    await tester.pump(const Duration(milliseconds: 100));
  }
  fail('condition not met within $timeout');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late FlutterSecureSecretStore secureStore;

  setUp(() async {
    secureStore = FlutterSecureSecretStore();
    await secureStore.delete(kPinRecordStorageKey);
    await _deleteDatabaseFile();
  });

  tearDown(() async {
    // Never leave a PIN or a database behind on the QA device.
    await secureStore.delete(kPinRecordStorageKey);
    await _deleteDatabaseFile();
  });

  testWidgets('a notification tap cannot bypass the PIN, and lands on Goals '
      'only after unlocking', (tester) async {
    await PinService(secureStore, iterations: _kFastIterations).setPin(_kPin);

    final route = PendingNotificationRoute();
    addTearDown(route.dispose);

    await tester.pumpWidget(AppBootstrap(
      pinKdfIterations: _kFastIterations,
      notificationGateway: _InertGateway(),
      pendingNotificationRoute: route,
    ));

    // The lock screen is what a PIN-configured start shows.
    await _pumpUntil(
      tester,
      () => find.byKey(const ValueKey('lock-screen')).evaluate().isNotEmpty,
    );
    expect(find.byKey(const ValueKey('screen-loaded-home')).evaluate(), isEmpty);

    // A tap arrives while locked.
    route.set(kGoalsReminderPayload);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Nothing moved, and the payload is still waiting for a screen that is
    // allowed to exist.
    expect(find.byKey(const ValueKey('screen-loaded-goals')).evaluate(), isEmpty);
    expect(find.byKey(const ValueKey('screen-loaded-home')).evaluate(), isEmpty);
    expect(route.hasPending, isTrue,
        reason: 'a locked app must not consume the tap');

    // Unlock for real.
    await tester.enterText(
        find.byKey(const ValueKey('lock-pin-field')), _kPin);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('lock-submit')));

    // Only now may the app move — and it must land on Goals.
    await _pumpUntil(
      tester,
      () => find.byKey(const ValueKey('screen-loaded-goals')).evaluate().isNotEmpty,
    );
    expect(route.hasPending, isFalse,
        reason: 'one tap must be consumed exactly once');
  });
}
