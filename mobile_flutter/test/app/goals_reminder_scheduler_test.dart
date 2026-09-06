import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_reminder_settings_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/domain/goals/goal_reminders.dart';
import 'package:familyfinance_pro/notifications/goals_reminder_scheduler.dart';
import 'package:familyfinance_pro/notifications/notification_gateway.dart';

import '../fakes/fake_notification_gateway.dart';

/// Milestone 9 — the coordinator.
///
/// Everything asserted here is about COORDINATION: does a reminder exist,
/// when, exactly once, and does it disappear when it should. The financial
/// question ("is there an actionable amount") is answered by the
/// pre-existing `getGoalsDueForReminder()`, which these tests exercise
/// through the scheduler rather than re-testing.

/// A goal that still needs money and whose deadline is far enough out that
/// the reminder schedule has eligible dates.
Map<String, Object?> _fundableGoal({
  String id = 'g1',
  String dueDate = '2027-12-31',
  num target = 1200,
  num saved = 0,
  bool archived = false,
  List<Map<String, Object?>> transfers = const [],
}) =>
    {
      'id': id,
      'title': 'QA-SYNTHETIC-GOAL',
      'dueDate': dueDate,
      'targetAmount': target,
      'savedAmount': saved,
      'isArchived': archived,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
      'components': <Object?>[],
      'confirmedTransfers': transfers,
    };

InMemoryKeyValueStore _storeWith(List<Map<String, Object?>> goals) =>
    InMemoryKeyValueStore({kGoalsKey: jsonEncode(goals)});

GoalsReminderScheduler _scheduler(
  KeyValueStore store,
  FakeNotificationGateway gateway, {
  required DateTime now,
}) =>
    GoalsReminderScheduler(
      goals: GoalsRepositoryImpl(store),
      settings: GoalsReminderSettingsRepositoryImpl(store),
      gateway: gateway,
      clock: () => now,
    );

Future<void> _enablePreference(KeyValueStore store) =>
    GoalsReminderSettingsRepositoryImpl(store).save(
      const GoalsReminderSettings(enabled: true, permissionRequested: true),
    );

void main() {
  final now = DateTime(2026, 9, 15, 12, 0);
  final expectedFireTime = DateTime(2026, 10, 2, 9, 0);

  group('the reminder is only scheduled when it should be', () {
    test('disabled by default — nothing is scheduled on a fresh install',
        () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.disabled);
      expect(gateway.scheduled, isEmpty);
      expect(gateway.requestPermissionCalls, 0,
          reason: 'permission must never be requested without an opt-in');
    });

    test('enabled + permitted + an actionable amount => scheduled', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.scheduled);
      expect(result.scheduledFor, expectedFireTime);
      expect(gateway.scheduled.keys.toList(), [kGoalsReminderNotificationId]);
      expect(gateway.scheduled[kGoalsReminderNotificationId]!.whenLocal,
          expectedFireTime);
    });

    test('permission denied => nothing scheduled, and it is not an error',
        () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway(
        permission: NotificationPermissionStatus.denied,
      );

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.permissionDenied);
      expect(result.error, isNull);
      expect(gateway.scheduled, isEmpty);
    });

    test('a fully funded goal => nothing to remind about', () async {
      final store = _storeWith([_fundableGoal(target: 1000, saved: 1000)]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.nothingToRemind);
      expect(gateway.scheduled, isEmpty);
    });

    test('an archived goal => nothing to remind about', () async {
      final store = _storeWith([_fundableGoal(archived: true)]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      expect((await _scheduler(store, gateway, now: now).reconcile()).status,
          GoalsReminderSyncStatus.nothingToRemind);
      expect(gateway.scheduled, isEmpty);
    });

    test('no goals at all => nothing to remind about', () async {
      final store = _storeWith([]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      expect((await _scheduler(store, gateway, now: now).reconcile()).status,
          GoalsReminderSyncStatus.nothingToRemind);
    });

    test('a goal already handled for the reminder period => not scheduled',
        () async {
      // A positive confirmed transfer recorded for the target period is
      // exactly what isGoalHandledForPeriod() looks for.
      final period = getCurrentReminderPeriod(today: expectedFireTime);
      final store = _storeWith([
        _fundableGoal(transfers: [
          {
            'id': 'ct1',
            'amount': 100,
            'date': '2026-10-02',
            'confirmedAt': '2026-10-02T09:00:00.000Z',
            'reminderPeriod': period,
            'source': 'goals_reminder',
          }
        ]),
      ]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      expect((await _scheduler(store, gateway, now: now).reconcile()).status,
          GoalsReminderSyncStatus.nothingToRemind);
      expect(gateway.scheduled, isEmpty);
    });

    test('an invalid goals dataset => no reminder is justified', () async {
      final store = InMemoryKeyValueStore({kGoalsKey: '[{"id":'});
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      expect((await _scheduler(store, gateway, now: now).reconcile()).status,
          GoalsReminderSyncStatus.goalsDataInvalid);
      expect(gateway.scheduled, isEmpty);
    });

    test('the decision is evaluated at the FIRE date, not at "now"', () async {
      // "now" is the 3rd, so today's own reminder window has passed; the
      // reminder must still be scheduled for next month's 2nd.
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      final result = await _scheduler(store, gateway, now: DateTime(2026, 9, 3))
          .reconcile();

      expect(result.status, GoalsReminderSyncStatus.scheduled);
      expect(result.scheduledFor, DateTime(2026, 10, 2, 9, 0));
    });
  });

  group('duplicate prevention', () {
    test('ten reconciliations leave exactly one owned reminder', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      for (var i = 0; i < 10; i++) {
        expect((await scheduler.reconcile()).isScheduled, isTrue);
      }

      final pending = await gateway.pendingOwnedIds();
      expect((pending as NotificationOk<List<int>>).value,
          [kGoalsReminderNotificationId]);
      expect(gateway.scheduled.length, 1);
    });

    test('concurrent reconciliations are serialised into one run', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      final results = await Future.wait([
        scheduler.reconcile(),
        scheduler.reconcile(),
        scheduler.reconcile(),
      ]);

      expect(results.every((r) => r.isScheduled), isTrue);
      expect(gateway.scheduleCalls, 1,
          reason: 'a cancel/schedule pair must never interleave with itself');
      expect(gateway.scheduled.length, 1);
    });

    test('only OWNED ids are ever cancelled', () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      await _scheduler(store, gateway, now: now).reconcile();

      expect(gateway.cancelledIds, isNotEmpty);
      expect(
        gateway.cancelledIds.every(kOwnedNotificationIds.contains),
        isTrue,
      );
    });
  });

  group('enable / disable', () {
    test('enable requests permission once, then schedules', () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      final result = await scheduler.enable();

      expect(result.isScheduled, isTrue);
      expect(gateway.requestPermissionCalls, 1);
      expect((await scheduler.currentSettings()).enabled, isTrue);
    });

    test('a second enable does NOT prompt again after the first request',
        () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      await scheduler.enable();
      await scheduler.disable();
      await scheduler.enable();

      expect(gateway.requestPermissionCalls, 1,
          reason: 'the OS prompt must not be re-shown after an answer');
    });

    test('enabling with a denied permission stores the intent but schedules '
        'nothing', () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway(
        permission: NotificationPermissionStatus.granted,
        permissionOnRequest: NotificationPermissionStatus.denied,
      );
      final scheduler = _scheduler(store, gateway, now: now);

      final result = await scheduler.enable();

      expect(result.status, GoalsReminderSyncStatus.permissionDenied);
      expect(gateway.scheduled, isEmpty);
      final settings = await scheduler.currentSettings();
      expect(settings.enabled, isTrue);
      expect(settings.permissionRequested, isTrue);
    });

    test('disable cancels the owned reminder', () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      await scheduler.enable();
      expect(gateway.scheduled.length, 1);

      final result = await scheduler.disable();

      expect(result.status, GoalsReminderSyncStatus.disabled);
      expect(gateway.scheduled, isEmpty);
      expect((await scheduler.currentSettings()).enabled, isFalse);
    });

    test('re-enabling schedules again', () async {
      final store = _storeWith([_fundableGoal()]);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      await scheduler.enable();
      await scheduler.disable();
      expect((await scheduler.enable()).isScheduled, isTrue);
      expect(gateway.scheduled.length, 1);
    });
  });

  group('state changes drive rescheduling', () {
    test('a goal becoming fully funded cancels the reminder', () async {
      final store = _storeWith([_fundableGoal(target: 1000, saved: 0)]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      expect((await scheduler.reconcile()).isScheduled, isTrue);

      // Simulates a restore/import replacing the goals dataset.
      await store.setString(
        kGoalsKey,
        jsonEncode([_fundableGoal(target: 1000, saved: 1000)]),
      );

      expect((await scheduler.reconcile()).status,
          GoalsReminderSyncStatus.nothingToRemind);
      expect(gateway.scheduled, isEmpty,
          reason: 'a stale reminder must not survive a restore');
    });

    test('a restore that introduces a fundable goal schedules one', () async {
      final store = _storeWith([]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      expect((await scheduler.reconcile()).status,
          GoalsReminderSyncStatus.nothingToRemind);

      await store.setString(kGoalsKey, jsonEncode([_fundableGoal()]));

      expect((await scheduler.reconcile()).isScheduled, isTrue);
      expect(gateway.scheduled.length, 1);
    });

    test('a restore that corrupts goals cancels the reminder', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();
      final scheduler = _scheduler(store, gateway, now: now);

      expect((await scheduler.reconcile()).isScheduled, isTrue);
      await store.setString(kGoalsKey, 'not json');

      expect((await scheduler.reconcile()).status,
          GoalsReminderSyncStatus.goalsDataInvalid);
      expect(gateway.scheduled, isEmpty);
    });

    test('the fire date follows the calendar as time passes', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      for (final entry in {
        DateTime(2026, 9, 1): DateTime(2026, 9, 2, 9, 0),
        DateTime(2026, 9, 5): DateTime(2026, 10, 2, 9, 0),
        DateTime(2026, 12, 20): DateTime(2027, 1, 2, 9, 0),
        DateTime(2027, 1, 31): DateTime(2027, 2, 2, 9, 0),
      }.entries) {
        final result =
            await _scheduler(store, gateway, now: entry.key).reconcile();
        expect(result.scheduledFor, entry.value, reason: 'now=${entry.key}');
      }
    });
  });

  group('failure handling', () {
    test('an initialize failure is reported, never a fake success', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway(failInitialize: true);

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.failed);
      expect(result.error, isA<NotificationInitFailure>());
      expect(result.isScheduled, isFalse);
    });

    test('a schedule failure is reported, never a fake success', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway(failSchedule: true);

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.failed);
      expect(result.error, isA<NotificationScheduleFailure>());
      expect(gateway.scheduled, isEmpty);
    });

    test('a permission-query failure is reported and schedules nothing',
        () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway(failPermissionQuery: true);

      final result = await _scheduler(store, gateway, now: now).reconcile();

      expect(result.status, GoalsReminderSyncStatus.failed);
      expect(gateway.scheduled, isEmpty);
    });

    test('a failure never mutates the stored goals', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final before = await store.getString(kGoalsKey);
      final gateway = FakeNotificationGateway(failSchedule: true);

      await _scheduler(store, gateway, now: now).reconcile();

      expect(await store.getString(kGoalsKey), before);
    });

    test('a corrupt preference blob falls back to OFF, never to ON', () async {
      final store = _storeWith([_fundableGoal()]);
      await store.setString(kGoalsReminderSettingsKey, '{not json');
      final gateway = FakeNotificationGateway();

      expect((await _scheduler(store, gateway, now: now).reconcile()).status,
          GoalsReminderSyncStatus.disabled);
      expect(gateway.scheduled, isEmpty);
    });
  });

  group('notification content privacy', () {
    test('the body carries no amount, no goal name and no count', () async {
      final store = _storeWith([
        _fundableGoal(id: 'g1', target: 4321, saved: 0),
        _fundableGoal(id: 'g2', target: 8765, saved: 0),
      ]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      await _scheduler(store, gateway, now: now).reconcile();
      final posted = gateway.scheduled[kGoalsReminderNotificationId]!;
      final text = '${posted.title} ${posted.body}';

      for (final forbidden in ['4321', '8765', 'QA-SYNTHETIC-GOAL']) {
        expect(text.contains(forbidden), isFalse,
            reason: 'notification text leaked "$forbidden"');
      }
      expect(RegExp(r'\d').hasMatch(text), isFalse,
          reason: 'the reminder text must contain no figures at all — not an '
              'amount, not a goal count, not even the reminder day');
      expect(posted.payload, kGoalsReminderPayload);
    });

    test('the payload is a routing hint only', () async {
      final store = _storeWith([_fundableGoal()]);
      await _enablePreference(store);
      final gateway = FakeNotificationGateway();

      await _scheduler(store, gateway, now: now).reconcile();
      expect(gateway.scheduled[kGoalsReminderNotificationId]!.payload,
          'goals_reminder');
    });
  });
}
