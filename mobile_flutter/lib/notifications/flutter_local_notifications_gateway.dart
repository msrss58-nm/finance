import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

import 'notification_gateway.dart';

/// The Android notification channel the Goals reminder is posted on.
///
/// `defaultImportance` on purpose: a monthly savings reminder is not urgent,
/// must not interrupt with a heads-up banner, and must never look like an
/// alarm. Nothing here requests an exact alarm or a full-screen intent.
const String kGoalsReminderChannelId = 'goals_reminder';
const String kGoalsReminderChannelName = 'תזכורת יעדים';
const String kGoalsReminderChannelDescription =
    'תזכורת חודשית להעברת הסכום ליעדי החיסכון';

/// Production [NotificationGateway], over `flutter_local_notifications`
/// 22.3.0.
///
/// ## Why there is no timezone-detection package
///
/// `zonedSchedule` takes a `TZDateTime`, and the usual recipe pairs the
/// `timezone` database with a package that discovers the device's IANA zone
/// name. That extra package is deliberately NOT used here, and it is not
/// needed:
///
/// Dart's own `DateTime` is already timezone-aware through the OS. Building
/// `DateTime(y, m, 2, 9, 0)` produces the LOCAL wall-clock moment, and the
/// runtime resolves its absolute instant using the platform's real zone
/// rules **for that future date**, DST transitions included. Handing that
/// instant to `TZDateTime.from(..., tz.UTC)` therefore schedules exactly the
/// intended local wall-clock time without ever needing the tz database or a
/// zone name — `tz.UTC` is a constant of the `timezone` package and requires
/// no `initializeTimeZones()` call.
///
/// The one thing this cannot follow on its own is the user CHANGING their
/// device timezone after a reminder was scheduled. That is handled the same
/// way every other state change is: `GoalsReminderScheduler.reconcile()` runs
/// on app start and on every resume and recomputes the instant from scratch.
class FlutterLocalNotificationsGateway implements NotificationGateway {
  FlutterLocalNotificationsGateway({
    FlutterLocalNotificationsPlugin? plugin,
    this.onNotificationTapped,
  }) : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  /// Invoked with the notification's payload when the user taps it while the
  /// app is running. The tap NEVER decides what is shown on screen: AuthGate
  /// is above the Navigator and refuses to build anything while locked.
  final void Function(String? payload)? onNotificationTapped;

  bool _initialized = false;

  bool get _isAndroid => !kIsWeb && Platform.isAndroid;
  bool get _isApple => !kIsWeb && (Platform.isIOS || Platform.isMacOS);

  @override
  Future<NotificationResult<void>> initialize() async {
    if (_initialized) return const NotificationOk(null);
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          // Permission is NOT requested at initialization: it is requested
          // only when the user turns the reminder on (Milestone 9 section 4).
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
          macOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) =>
            onNotificationTapped?.call(response.payload),
      );
      _initialized = true;
      return const NotificationOk(null);
    } catch (e) {
      return NotificationFailed(
        NotificationInitFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  /// The payload of the notification that cold-started the app, or `null`.
  ///
  /// Read once by the bootstrap. It is only a routing hint; it can never
  /// unlock anything.
  Future<String?> launchPayload() async {
    try {
      final details = await _plugin.getNotificationAppLaunchDetails();
      if (details == null || !details.didNotificationLaunchApp) return null;
      return details.notificationResponse?.payload;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      requestPermission() async {
    try {
      if (_isAndroid) {
        final android = _plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        if (android == null) {
          return const NotificationOk(NotificationPermissionStatus.notApplicable);
        }
        // Returns null on Android below 13, where there is no runtime
        // notification permission at all.
        final granted = await android.requestNotificationsPermission();
        if (granted == null) {
          return const NotificationOk(NotificationPermissionStatus.notApplicable);
        }
        return NotificationOk(granted
            ? NotificationPermissionStatus.granted
            : NotificationPermissionStatus.denied);
      }
      if (_isApple) {
        final darwin = _plugin.resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>();
        final granted = await darwin?.requestPermissions(alert: true, badge: true, sound: true);
        return NotificationOk(granted == true
            ? NotificationPermissionStatus.granted
            : NotificationPermissionStatus.denied);
      }
      return const NotificationOk(NotificationPermissionStatus.notApplicable);
    } catch (e) {
      return NotificationFailed(
        NotificationPermissionFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      permissionStatus() async {
    try {
      if (_isAndroid) {
        final android = _plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        if (android == null) {
          return const NotificationOk(NotificationPermissionStatus.notApplicable);
        }
        final enabled = await android.areNotificationsEnabled();
        if (enabled == null) {
          return const NotificationOk(NotificationPermissionStatus.notApplicable);
        }
        return NotificationOk(enabled
            ? NotificationPermissionStatus.granted
            : NotificationPermissionStatus.denied);
      }
      // iOS/macOS expose no non-prompting query through this plugin; report
      // "not applicable" rather than guessing, and never prompt from here.
      return const NotificationOk(NotificationPermissionStatus.notApplicable);
    } catch (e) {
      return NotificationFailed(
        NotificationPermissionFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<NotificationResult<void>> schedule(
    ScheduledNotification notification,
  ) async {
    if (!kOwnedNotificationIds.contains(notification.id)) {
      return const NotificationFailed(NotificationScheduleFailure());
    }
    try {
      await _plugin.zonedSchedule(
        id: notification.id,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        // See the class doc: the local DateTime already carries the correct
        // absolute instant for its date, DST included.
        scheduledDate: tz.TZDateTime.from(notification.whenLocal, tz.UTC),
        // INEXACT on purpose. A monthly savings reminder does not justify
        // SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM, and neither permission is
        // declared. `allowWhileIdle` only lets it through Doze at roughly the
        // requested time.
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            kGoalsReminderChannelId,
            kGoalsReminderChannelName,
            channelDescription: kGoalsReminderChannelDescription,
            importance: Importance.defaultImportance,
            priority: Priority.defaultPriority,
            // The reminder body is generic by design, but this also stops the
            // OS from surfacing it on a locked screen where the app's own PIN
            // policy does not apply.
            visibility: NotificationVisibility.private,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: false,
            presentSound: false,
          ),
        ),
      );
      return const NotificationOk(null);
    } catch (e) {
      return NotificationFailed(
        NotificationScheduleFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<NotificationResult<void>> cancel(int id) async {
    if (!kOwnedNotificationIds.contains(id)) {
      return const NotificationFailed(NotificationCancelFailure());
    }
    try {
      await _plugin.cancel(id: id);
      return const NotificationOk(null);
    } catch (e) {
      return NotificationFailed(
        NotificationCancelFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<NotificationResult<void>> cancelAllOwned() async {
    // Never `cancelAll()`: that would also drop notifications this app does
    // not own.
    for (final id in kOwnedNotificationIds) {
      final result = await cancel(id);
      if (result is NotificationFailed<void>) return result;
    }
    return const NotificationOk(null);
  }

  @override
  Future<NotificationResult<List<int>>> pendingOwnedIds() async {
    try {
      final pending = await _plugin.pendingNotificationRequests();
      return NotificationOk([
        for (final p in pending)
          if (kOwnedNotificationIds.contains(p.id)) p.id,
      ]);
    } catch (e) {
      return NotificationFailed(
        NotificationQueryFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<NotificationResult<bool>> openSystemNotificationSettings() async {
    try {
      final opened = await _plugin.openAppNotificationSettings();
      return NotificationOk(opened ?? false);
    } catch (e) {
      return NotificationFailed(
        NotificationQueryFailure(causeType: e.runtimeType.toString()),
      );
    }
  }
}
