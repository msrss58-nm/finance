/// Milestone 9's OS-notification boundary.
///
/// This layer knows about scheduling a notification at an instant and about
/// notification permission. It deliberately knows NOTHING about:
///   - Goals, funding, deadlines or any financial calculation,
///   - repositories, Drift, or any write path,
///   - the PIN, `SecureSecretStore`, or any security state.
///
/// As with Milestone 8's file gateway, that narrowness is what makes "the
/// notification layer cannot mutate financial data" a structural property
/// rather than a convention: there is no repository reachable from here.
library;

/// Whether the OS currently permits this app to post notifications.
enum NotificationPermissionStatus {
  /// The app may post notifications.
  granted,

  /// The user (or the OS) has refused. This is NOT an application error —
  /// the app stays fully usable, the reminder simply cannot be delivered.
  denied,

  /// The platform does not expose a permission concept the app can query
  /// (e.g. Android below 13). Treated as "may post".
  notApplicable,
}

/// Typed, secret-free failure from the notification layer.
///
/// Same hard rule as the security and file layers: [message] is a fixed
/// Hebrew literal and [causeType] is at most the runtime TYPE NAME of an
/// underlying platform exception — never its text, and never any part of a
/// notification payload (which describes the user's finances).
sealed class NotificationError {
  const NotificationError(this.message, {this.causeType});

  final String message;
  final String? causeType;

  @override
  String toString() => causeType == null
      ? '$runtimeType: $message'
      : '$runtimeType: $message ($causeType)';
}

final class NotificationInitFailure extends NotificationError {
  const NotificationInitFailure({super.causeType})
      : super('אתחול ההתראות נכשל');
}

final class NotificationPermissionFailure extends NotificationError {
  const NotificationPermissionFailure({super.causeType})
      : super('בדיקת הרשאת ההתראות נכשלה');
}

final class NotificationScheduleFailure extends NotificationError {
  const NotificationScheduleFailure({super.causeType})
      : super('קביעת התזכורת נכשלה');
}

final class NotificationCancelFailure extends NotificationError {
  const NotificationCancelFailure({super.causeType})
      : super('ביטול התזכורת נכשל');
}

final class NotificationQueryFailure extends NotificationError {
  const NotificationQueryFailure({super.causeType})
      : super('קריאת מצב ההתראות נכשלה');
}

/// Two-valued outcome. Unlike the file gateway there is no "cancelled" case:
/// nothing here is a modal the user can back out of. A refused permission is
/// a successful call that returns [NotificationPermissionStatus.denied].
sealed class NotificationResult<T> {
  const NotificationResult();
}

final class NotificationOk<T> extends NotificationResult<T> {
  const NotificationOk(this.value);
  final T value;
}

final class NotificationFailed<T> extends NotificationResult<T> {
  const NotificationFailed(this.error);
  final NotificationError error;
}

/// A notification this app owns, described in LOCAL wall-clock terms.
///
/// [whenLocal] is a plain local [DateTime]. Converting it to an absolute
/// instant is the gateway's job — see [NotificationGateway.schedule].
class ScheduledNotification {
  const ScheduledNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.whenLocal,
    this.payload,
  });

  final int id;
  final String title;

  /// Deliberately generic. See `GoalsReminderScheduler` for the privacy rule:
  /// no amount, no goal breakdown, nothing that should not sit on a lock
  /// screen.
  final String body;

  final DateTime whenLocal;
  final String? payload;
}

/// Every notification id this app is allowed to touch.
///
/// The gateway may only ever cancel ids in this set. `cancelAll()` is never
/// called: it would also remove notifications posted by anything else in the
/// app, now or in the future.
const int kGoalsReminderNotificationId = 9001;
const Set<int> kOwnedNotificationIds = {kGoalsReminderNotificationId};

/// The payload attached to the Goals reminder, used only to decide where to
/// navigate after the user unlocks. It carries no financial information.
const String kGoalsReminderPayload = 'goals_reminder';

abstract interface class NotificationGateway {
  /// Must be safe to call more than once.
  Future<NotificationResult<void>> initialize();

  /// Asks the OS for permission. Callers must not call this repeatedly after
  /// a refusal — see `GoalsReminderSettings.permissionRequested`.
  Future<NotificationResult<NotificationPermissionStatus>> requestPermission();

  /// Reads the current status without prompting.
  Future<NotificationResult<NotificationPermissionStatus>> permissionStatus();

  /// Schedules [notification] at the absolute instant that
  /// [ScheduledNotification.whenLocal] denotes in the device's local time.
  ///
  /// Scheduling an id that is already scheduled REPLACES it — the platform
  /// keys pending notifications by id, so this can never accumulate
  /// duplicates for one id.
  Future<NotificationResult<void>> schedule(ScheduledNotification notification);

  /// Cancels one id. Must refuse an id outside [kOwnedNotificationIds].
  Future<NotificationResult<void>> cancel(int id);

  /// Cancels every id in [kOwnedNotificationIds] and nothing else.
  Future<NotificationResult<void>> cancelAllOwned();

  /// The ids from [kOwnedNotificationIds] that are currently scheduled.
  Future<NotificationResult<List<int>>> pendingOwnedIds();

  /// Opens the OS notification settings for this app, when the platform
  /// supports it. `false` means "not supported / did not open" — never an
  /// error the user needs to see.
  Future<NotificationResult<bool>> openSystemNotificationSettings();
}
