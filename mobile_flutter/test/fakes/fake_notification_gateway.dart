import 'package:familyfinance_pro/notifications/notification_gateway.dart';

/// Programmable [NotificationGateway] test double.
///
/// Models the platform's own id semantics faithfully: [scheduled] is keyed by
/// id, so scheduling the same id twice REPLACES rather than accumulates —
/// which is what makes "no duplicates" a real assertion rather than an
/// artefact of the fake.
class FakeNotificationGateway implements NotificationGateway {
  FakeNotificationGateway({
    this.permission = NotificationPermissionStatus.granted,
    this.permissionOnRequest,
    this.failInitialize = false,
    this.failSchedule = false,
    this.failCancel = false,
    this.failPermissionQuery = false,
  });

  NotificationPermissionStatus permission;

  /// What `requestPermission()` resolves to. Defaults to [permission].
  NotificationPermissionStatus? permissionOnRequest;

  bool failInitialize;
  bool failSchedule;
  bool failCancel;
  bool failPermissionQuery;

  final Map<int, ScheduledNotification> scheduled = {};

  int initializeCalls = 0;
  int requestPermissionCalls = 0;
  int scheduleCalls = 0;
  int cancelCalls = 0;
  int openSystemSettingsCalls = 0;

  /// Every id this fake was ever asked to cancel — used to prove that only
  /// owned ids are ever touched.
  final List<int> cancelledIds = [];

  @override
  Future<NotificationResult<void>> initialize() async {
    initializeCalls++;
    if (failInitialize) {
      return const NotificationFailed(NotificationInitFailure());
    }
    return const NotificationOk(null);
  }

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      requestPermission() async {
    requestPermissionCalls++;
    final result = permissionOnRequest ?? permission;
    permission = result;
    return NotificationOk(result);
  }

  @override
  Future<NotificationResult<NotificationPermissionStatus>>
      permissionStatus() async {
    if (failPermissionQuery) {
      return const NotificationFailed(NotificationPermissionFailure());
    }
    return NotificationOk(permission);
  }

  @override
  Future<NotificationResult<void>> schedule(
    ScheduledNotification notification,
  ) async {
    scheduleCalls++;
    if (failSchedule) {
      return const NotificationFailed(NotificationScheduleFailure());
    }
    if (!kOwnedNotificationIds.contains(notification.id)) {
      return const NotificationFailed(NotificationScheduleFailure());
    }
    scheduled[notification.id] = notification;
    return const NotificationOk(null);
  }

  @override
  Future<NotificationResult<void>> cancel(int id) async {
    cancelCalls++;
    cancelledIds.add(id);
    if (failCancel) {
      return const NotificationFailed(NotificationCancelFailure());
    }
    if (!kOwnedNotificationIds.contains(id)) {
      return const NotificationFailed(NotificationCancelFailure());
    }
    scheduled.remove(id);
    return const NotificationOk(null);
  }

  @override
  Future<NotificationResult<void>> cancelAllOwned() async {
    for (final id in kOwnedNotificationIds) {
      final result = await cancel(id);
      if (result is NotificationFailed<void>) return result;
    }
    return const NotificationOk(null);
  }

  @override
  Future<NotificationResult<List<int>>> pendingOwnedIds() async =>
      NotificationOk(scheduled.keys.toList()..sort());

  @override
  Future<NotificationResult<bool>> openSystemNotificationSettings() async {
    openSystemSettingsCalls++;
    return const NotificationOk(true);
  }
}
