import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/app_screen.dart';
import 'package:familyfinance_pro/app/navigation/navigation_history_controller.dart';
import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/security/auth_gate.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/notification_scope.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_reminder_settings_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/notifications/goals_reminder_scheduler.dart';
import 'package:familyfinance_pro/notifications/notification_gateway.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_notification_gateway.dart';
import '../fakes/fake_secure_secret_store.dart';

/// Milestone 9, section 11 — the notification layer must not be able to
/// weaken, bypass or even observe the Milestone 7 security model.
const int _kTestIterations = 1000;
const String _kPin = '135790';

String _fundableGoals() => jsonEncode([
      {
        'id': 'g1',
        'title': 'QA-SYNTHETIC-GOAL',
        'dueDate': '2027-12-31',
        'targetAmount': 1200,
        'savedAmount': 0,
        'isArchived': false,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
        'components': <Object?>[],
        'confirmedTransfers': <Object?>[],
      }
    ]);

void main() {
  test('scheduling never touches secure storage or changes PIN state',
      () async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    final recordBefore = await secure.read(kPinRecordStorageKey);
    final writesBefore = secure.writeCount;
    final deletesBefore = secure.deleteCount;

    final store = InMemoryKeyValueStore({kGoalsKey: _fundableGoals()});
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await scheduler.enable();
    await scheduler.reconcile();
    await scheduler.disable();

    expect(await secure.read(kPinRecordStorageKey), recordBefore);
    expect(secure.writeCount, writesBefore);
    expect(secure.deleteCount, deletesBefore);
    expect(await pinService.isPinConfigured(), isTrue);
    expect(await pinService.verifyPin(_kPin), isTrue);
  });

  test('the reminder preference is NOT a family_finance_ key, so it can never '
      'enter a backup', () {
    expect(kGoalsReminderSettingsKey.startsWith(kFamilyFinanceKeyPrefix),
        isFalse);
    expect(kGoalsReminderSettingsKey, 'ff_goals_reminder_v1');
  });

  test('the reminder preference is invisible to the backup sweep', () async {
    final store = InMemoryKeyValueStore({kGoalsKey: '[]'});
    await GoalsReminderSettingsRepositoryImpl(store).save(
      const GoalsReminderSettings(enabled: true, permissionRequested: true),
    );

    final swept = await store.keysWithPrefix(kFamilyFinanceKeyPrefix);
    expect(swept.contains(kGoalsReminderSettingsKey), isFalse);
    expect(swept, [kGoalsKey]);
  });

  test('the notification payload carries no security material', () async {
    final store = InMemoryKeyValueStore({kGoalsKey: _fundableGoals()});
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );
    await scheduler.enable();

    final posted = gateway.scheduled[kGoalsReminderNotificationId]!;
    final text = '${posted.title} ${posted.body} ${posted.payload}';
    expect(text.contains(kPinRecordStorageKey), isFalse);
    expect(text.contains(_kPin), isFalse);
    expect(text.toLowerCase().contains('pin'), isFalse);
  });

  testWidgets('a pending notification tap cannot move the app while it is '
      'locked', (tester) async {
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kTestIterations);
    await pinService.setPin(_kPin);
    final auth = AuthController(pinService);
    await auth.initialize();

    final route = PendingNotificationRoute();
    addTearDown(route.dispose);
    final controller = NavigationHistoryController();
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      // Mirrors AppBootstrap exactly: AuthScope wraps the MaterialApp, and
      // AuthGate is installed through `builder`, i.e. ABOVE the Navigator.
      AuthScope(
        controller: auth,
        pinService: pinService,
        child: MaterialApp(
          builder: (context, child) => Directionality(
            textDirection: TextDirection.rtl,
            child: AuthGate(child: child ?? const SizedBox.shrink()),
          ),
          home: PendingNotificationRouteScope(
            route: route,
            child: NavigationShell(
              controller: controller,
              screenBuilder: (screen) =>
                  Center(child: Text('screen-${screen.name}')),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The lock screen is up and the shell was never built.
    expect(find.text('screen-home'), findsNothing);

    // A tap arrives while locked.
    route.set(kGoalsReminderPayload);
    await tester.pumpAndSettle();

    // Still locked, still nothing built, and the payload was NOT consumed —
    // it waits for a screen that is allowed to exist.
    expect(find.text('screen-home'), findsNothing);
    expect(find.text('screen-goals'), findsNothing);
    expect(route.hasPending, isTrue);
    expect(controller.current, AppScreen.home);
  });
}
