import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/settings_screen.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/app/services/notification_scope.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_reminder_settings_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/notifications/goals_reminder_scheduler.dart';
import 'package:familyfinance_pro/notifications/notification_gateway.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_notification_gateway.dart';
import '../fakes/fake_secure_secret_store.dart';

/// Milestone 9 — the Settings reminder control.
///
/// The notification gateway is faked; everything under it (Goals repository,
/// reminder domain logic, preference storage) is the real implementation over
/// a real in-memory Drift database.

const Key _switchKey = ValueKey('settings-goals-reminder-switch');
const Key _statusKey = ValueKey('settings-goals-reminder-status');
const Key _deniedKey = ValueKey('settings-goals-reminder-permission-denied');
const Key _openSystemKey = ValueKey('settings-goals-reminder-open-system');

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

Widget _harness(
  AppServices services, {
  GoalsReminderScheduler? scheduler,
}) {
  final pinService = PinService(FakeSecureSecretStore(), iterations: 1000);
  const screen = SettingsScreen();
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: AuthScope(
        controller: AuthController(pinService),
        pinService: pinService,
        child: AppServicesScope(
          services: services,
          child: NotificationScope(scheduler: scheduler, child: screen),
        ),
      ),
    ),
  );
}

Future<void> _scrollToReminder(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.byKey(_switchKey),
    250,
    scrollable: find.descendant(
      of: find.byKey(const ValueKey('settings-list')),
      matching: find.byType(Scrollable),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('with no notification scope the section is honestly unavailable',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(_statusKey),
      250,
      scrollable: find.descendant(
        of: find.byKey(const ValueKey('settings-list')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(_statusKey), findsOneWidget);
    expect(
      find.descendant(of: find.byKey(_statusKey), matching: find.text('לא זמין')),
      findsOneWidget,
    );
    expect(find.byKey(_switchKey), findsNothing);
    await db.close();
  });

  testWidgets('the switch starts OFF and nothing is scheduled', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    expect(tester.widget<SwitchListTile>(find.byKey(_switchKey)).value, isFalse);
    expect(gateway.scheduled, isEmpty);
    expect(gateway.requestPermissionCalls, 0);
    await db.close();
  });

  testWidgets('turning the switch on requests permission and schedules once',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();

    expect(gateway.requestPermissionCalls, 1);
    expect(gateway.scheduled.keys.toList(), [kGoalsReminderNotificationId]);
    expect(tester.widget<SwitchListTile>(find.byKey(_switchKey)).value, isTrue);
    await db.close();
  });

  testWidgets('turning the switch off cancels the owned reminder',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    await GoalsReminderSettingsRepositoryImpl(store).save(
      const GoalsReminderSettings(enabled: true, permissionRequested: true),
    );
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );
    await scheduler.reconcile();
    expect(gateway.scheduled.length, 1);

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    expect(tester.widget<SwitchListTile>(find.byKey(_switchKey)).value, isTrue);
    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();

    expect(gateway.scheduled, isEmpty);
    expect(tester.widget<SwitchListTile>(find.byKey(_switchKey)).value, isFalse);
    await db.close();
  });

  testWidgets('a denied permission is shown honestly, with a route to the OS '
      'settings', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway(
      permissionOnRequest: NotificationPermissionStatus.denied,
    );
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();

    expect(find.byKey(_deniedKey), findsOneWidget);
    expect(find.byKey(_openSystemKey), findsOneWidget);
    expect(gateway.scheduled, isEmpty,
        reason: 'the UI must never imply a reminder that cannot be delivered');

    await tester.scrollUntilVisible(
      find.byKey(_openSystemKey),
      250,
      scrollable: find.descendant(
        of: find.byKey(const ValueKey('settings-list')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_openSystemKey));
    await tester.pumpAndSettle();
    expect(gateway.openSystemSettingsCalls, 1);
    await db.close();
  });

  testWidgets('the OS prompt is not shown again after an answer',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway();
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();

    expect(gateway.requestPermissionCalls, 1);
    await db.close();
  });

  testWidgets('a scheduling failure does not crash the screen', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kGoalsKey, _fundableGoals());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeNotificationGateway(failSchedule: true);
    final scheduler = GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => DateTime(2026, 9, 15),
    );

    await tester.pumpWidget(_harness(services, scheduler: scheduler));
    await tester.pumpAndSettle();
    await _scrollToReminder(tester);

    await tester.tap(find.byKey(_switchKey));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byKey(_switchKey), findsOneWidget);
    expect(gateway.scheduled, isEmpty);
    await db.close();
  });
}
