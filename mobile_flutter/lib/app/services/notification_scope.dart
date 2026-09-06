import 'package:flutter/widgets.dart';

import '../../notifications/goals_reminder_scheduler.dart';

/// Milestone 9's composition-root exposure, deliberately a THIRD scope
/// alongside [AppServicesScope] (financial) and `AuthScope` (security).
///
/// Keeping it separate is the same structural argument Milestone 7 made:
/// the notification coordinator must not travel inside the financial DI
/// bundle, and it must not be reachable from the security bundle at all.
///
/// [scheduler] is nullable because it only exists once the database has
/// opened, and because several existing tests mount screens with no
/// notification wiring at all. A missing scheduler means "reminders
/// unavailable" — an honest disabled state, never a silent claim that the
/// reminder is on.
class NotificationScope extends InheritedWidget {
  const NotificationScope({
    super.key,
    required this.scheduler,
    required super.child,
  });

  final GoalsReminderScheduler? scheduler;

  static GoalsReminderScheduler? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<NotificationScope>()?.scheduler;

  @override
  bool updateShouldNotify(NotificationScope oldWidget) =>
      !identical(scheduler, oldWidget.scheduler);
}

/// A notification tap that is waiting for the app to become viewable.
///
/// A tap can arrive while the app is locked (or before the Navigator even
/// exists, on a cold start). It must NEVER decide what is on screen by
/// itself: `AuthGate` sits above the Navigator and does not build its child
/// while locked, so this value simply sits here until a screen is actually
/// allowed to exist, and is then consumed exactly once.
class PendingNotificationRoute extends ChangeNotifier {
  String? _payload;

  String? get payload => _payload;

  bool get hasPending => _payload != null;

  void set(String? payload) {
    if (payload == null || payload == _payload) return;
    _payload = payload;
    notifyListeners();
  }

  /// Returns the pending payload and clears it, so one tap can never produce
  /// two navigations.
  String? take() {
    final value = _payload;
    _payload = null;
    return value;
  }
}

/// Publishes the pending tap to the navigation shell.
class PendingNotificationRouteScope
    extends InheritedNotifier<PendingNotificationRoute> {
  const PendingNotificationRouteScope({
    super.key,
    required PendingNotificationRoute route,
    required super.child,
  }) : super(notifier: route);

  static PendingNotificationRoute? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<PendingNotificationRouteScope>()
      ?.notifier;
}
