import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:familyfinance_pro/notifications/flutter_local_notifications_gateway.dart';
import 'package:familyfinance_pro/notifications/goals_reminder_scheduler.dart';
import 'package:familyfinance_pro/notifications/notification_gateway.dart';

/// Milestone 9 — on-device proof that a scheduled reminder is ACTUALLY
/// DELIVERED by the OS, with the exact production text.
///
/// QA-only short interval: the production reminder date (the 2nd of the
/// month) and time (09:00 local) are constants and are NOT changed here —
/// this test drives the production [FlutterLocalNotificationsGateway]
/// directly with a near-future instant, which is the sanctioned way to
/// observe delivery without touching the product's schedule or the device
/// clock.
///
/// Requires the notification permission to already be granted on the device.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late FlutterLocalNotificationsGateway gateway;

  setUp(() async {
    gateway = FlutterLocalNotificationsGateway();
    expect(await gateway.initialize(), isA<NotificationOk<void>>());
    await gateway.cancelAllOwned();
  });

  tearDown(() async {
    await gateway.cancelAllOwned();
  });

  Future<ActiveNotification?> waitForDelivery({
    Duration timeout = const Duration(seconds: 45),
  }) async {
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final active = await android?.getActiveNotifications() ??
          const <ActiveNotification>[];
      for (final n in active) {
        if (n.id == kGoalsReminderNotificationId) return n;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return null;
  }

  testWidgets('permission is granted on this device', (tester) async {
    final status = await gateway.permissionStatus();
    expect(status, isA<NotificationOk<NotificationPermissionStatus>>());
    expect(
      (status as NotificationOk<NotificationPermissionStatus>).value,
      isNot(NotificationPermissionStatus.denied),
      reason: 'grant the notification permission before running this test',
    );
  });

  testWidgets('a scheduled reminder is really delivered, with the exact '
      'production text and no figures', (tester) async {
    final when = DateTime.now().add(const Duration(seconds: 8));

    final scheduled = await gateway.schedule(
      ScheduledNotification(
        id: kGoalsReminderNotificationId,
        title: kGoalsReminderTitle,
        body: kGoalsReminderBody,
        whenLocal: when,
        payload: kGoalsReminderPayload,
      ),
    );
    expect(scheduled, isA<NotificationOk<void>>());

    // It is pending before it fires...
    final pending = await gateway.pendingOwnedIds();
    expect((pending as NotificationOk<List<int>>).value,
        [kGoalsReminderNotificationId]);

    // ...and the OS actually posts it.
    final delivered = await waitForDelivery();
    expect(delivered, isNotNull,
        reason: 'the OS never posted the scheduled reminder');

    expect(delivered!.title, kGoalsReminderTitle);
    expect(delivered.body, kGoalsReminderBody);
    expect(delivered.channelId, kGoalsReminderChannelId);

    // The privacy rule, verified against what the OS actually showed.
    final shown = '${delivered.title} ${delivered.body}';
    expect(RegExp(r'\d').hasMatch(shown), isFalse,
        reason: 'the delivered notification must contain no figures');
    expect(shown.toLowerCase().contains('pin'), isFalse);
  });

  testWidgets('scheduling the same id twice leaves exactly one pending',
      (tester) async {
    final when = DateTime.now().add(const Duration(minutes: 30));
    for (var i = 0; i < 3; i++) {
      expect(
        await gateway.schedule(
          ScheduledNotification(
            id: kGoalsReminderNotificationId,
            title: kGoalsReminderTitle,
            body: kGoalsReminderBody,
            whenLocal: when,
            payload: kGoalsReminderPayload,
          ),
        ),
        isA<NotificationOk<void>>(),
      );
    }
    final pending = await gateway.pendingOwnedIds();
    expect((pending as NotificationOk<List<int>>).value,
        [kGoalsReminderNotificationId]);
  });

  testWidgets('cancelAllOwned clears the reminder', (tester) async {
    await gateway.schedule(
      ScheduledNotification(
        id: kGoalsReminderNotificationId,
        title: kGoalsReminderTitle,
        body: kGoalsReminderBody,
        whenLocal: DateTime.now().add(const Duration(minutes: 30)),
        payload: kGoalsReminderPayload,
      ),
    );
    expect(await gateway.cancelAllOwned(), isA<NotificationOk<void>>());

    final pending = await gateway.pendingOwnedIds();
    expect((pending as NotificationOk<List<int>>).value, isEmpty);
  });

  testWidgets('an id this app does not own is refused', (tester) async {
    final result = await gateway.schedule(
      ScheduledNotification(
        id: 424242,
        title: 'x',
        body: 'y',
        whenLocal: DateTime.now().add(const Duration(minutes: 5)),
      ),
    );
    expect(result, isA<NotificationFailed<void>>());
    expect(await gateway.cancel(424242), isA<NotificationFailed<void>>());
  });
}
