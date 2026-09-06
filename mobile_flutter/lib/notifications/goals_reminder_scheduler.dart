import '../data/repositories/goals_reminder_settings_repository.dart';
import '../data/repositories/goals_repository.dart';
import '../domain/goals/goal_reminders.dart';
import '../domain/goals/goals_reminder_schedule.dart';
import '../domain/models/goal.dart';
import 'notification_gateway.dart';

/// Milestone 9's coordinator: the ONE place that decides whether the monthly
/// Goals reminder should exist, when it should fire, and keeps the OS in
/// sync with that decision.
///
/// What it deliberately does NOT do:
///   - calculate Goals funding. Whether there is an actionable amount comes
///     straight from `getGoalsDueForReminderFromState()`, the authoritative
///     domain function ported in Milestone 5. No savings algorithm, no
///     deadline maths and no FIFO allocation is reimplemented here.
///   - write to any financial repository. It only READS goals.
///   - touch `SecureSecretStore`, the PIN, or any security state.
///   - decide what the user sees. Navigation after a tap is gated by
///     AuthGate, which this class cannot reach.
///
/// The notification body never carries an amount — see [kGoalsReminderBody].

/// The exact text the reminder is posted with.
///
/// Public constants, not private fields, so the on-device delivery test can
/// assert that what the OS actually showed is byte-for-byte the production
/// text — not a copy that could drift away from it.
const String kGoalsReminderTitle = 'תזכורת יעדים';

/// Generic on purpose (Milestone 9, section 6): no amount, no goal names, no
/// count, no figures at all. A lock screen sits outside this app's PIN
/// policy, so nothing the user would not want a bystander to read may go
/// here. The exact amount is shown inside the app, after unlocking.
const String kGoalsReminderBody =
    'הגיע הזמן להעביר את הסכום החודשי לחשבון החיסכון. פתחו את האפליקציה לפרטים.';

/// The outcome of one reconciliation, so callers (and tests) can assert on
/// WHY the reminder is or is not scheduled rather than inferring it.
enum GoalsReminderSyncStatus {
  /// A reminder is scheduled for [GoalsReminderSyncResult.scheduledFor].
  scheduled,

  /// The user has the reminder switched off. Nothing is scheduled.
  disabled,

  /// The OS refuses notifications. Not an error; nothing is scheduled.
  permissionDenied,

  /// The reminder is on and permitted, but the authoritative Goals logic
  /// reports nothing actionable on the next reminder date.
  nothingToRemind,

  /// The stored Goals dataset is invalid, so no reminder can be justified.
  /// Mirrors `getGoalsDueForReminderFromState()`'s own guard.
  goalsDataInvalid,

  /// A real notification-layer failure. Nothing is claimed to be scheduled.
  failed,
}

class GoalsReminderSyncResult {
  const GoalsReminderSyncResult(
    this.status, {
    this.scheduledFor,
    this.error,
  });

  final GoalsReminderSyncStatus status;

  /// Local wall-clock instant the reminder will fire at, when
  /// [status] is [GoalsReminderSyncStatus.scheduled].
  final DateTime? scheduledFor;

  final NotificationError? error;

  bool get isScheduled => status == GoalsReminderSyncStatus.scheduled;
}

class GoalsReminderScheduler {
  GoalsReminderScheduler({
    required this.goals,
    required this.settings,
    required this.gateway,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final GoalsRepository goals;
  final GoalsReminderSettingsRepository settings;
  final NotificationGateway gateway;
  final DateTime Function() _clock;

  /// Serialises reconciliations. Two triggers can easily land at once — an
  /// app resume while a restore is still settling, say — and running the
  /// cancel/schedule pair concurrently is exactly how a duplicate or a lost
  /// schedule would appear.
  Future<GoalsReminderSyncResult>? _inFlight;


  /// Brings the OS into line with the current state. Safe to call as often as
  /// wanted: repeated calls converge on the same single scheduled reminder.
  Future<GoalsReminderSyncResult> reconcile() {
    final running = _inFlight;
    if (running != null) return running;
    final future = _reconcile();
    _inFlight = future;
    return future.whenComplete(() => _inFlight = null);
  }

  Future<GoalsReminderSyncResult> _reconcile() async {
    final init = await gateway.initialize();
    if (init is NotificationFailed<void>) {
      return GoalsReminderSyncResult(
        GoalsReminderSyncStatus.failed,
        error: init.error,
      );
    }

    final prefs = await settings.load();
    if (!prefs.enabled) {
      return _cancelAndReport(GoalsReminderSyncStatus.disabled);
    }

    final permission = await gateway.permissionStatus();
    switch (permission) {
      case NotificationFailed<NotificationPermissionStatus>(error: final e):
        return GoalsReminderSyncResult(
          GoalsReminderSyncStatus.failed,
          error: e,
        );
      case NotificationOk<NotificationPermissionStatus>(value: final status):
        if (status == NotificationPermissionStatus.denied) {
          return _cancelAndReport(GoalsReminderSyncStatus.permissionDenied);
        }
    }

    final state = await goals.load();
    if (state is! GoalsValid) {
      return _cancelAndReport(GoalsReminderSyncStatus.goalsDataInvalid);
    }

    final when = nextGoalsReminderDateTime(now: _clock());

    // THE financial decision, delegated in full: would the authoritative
    // reminder logic put anything in front of the user on that date?
    final due = getGoalsDueForReminderFromState(state, now: when);
    if (due.isEmpty) {
      return _cancelAndReport(GoalsReminderSyncStatus.nothingToRemind);
    }

    // Cancel first, then schedule. The platform already replaces by id, so
    // this is belt-and-braces — but it makes "exactly one owned reminder"
    // true even if the id set ever grows.
    final cancelled = await gateway.cancelAllOwned();
    if (cancelled is NotificationFailed<void>) {
      return GoalsReminderSyncResult(
        GoalsReminderSyncStatus.failed,
        error: cancelled.error,
      );
    }

    final scheduled = await gateway.schedule(
      ScheduledNotification(
        id: kGoalsReminderNotificationId,
        title: kGoalsReminderTitle,
        body: kGoalsReminderBody,
        whenLocal: when,
        payload: kGoalsReminderPayload,
      ),
    );
    if (scheduled is NotificationFailed<void>) {
      // Never report success we do not have.
      return GoalsReminderSyncResult(
        GoalsReminderSyncStatus.failed,
        error: scheduled.error,
      );
    }

    return GoalsReminderSyncResult(
      GoalsReminderSyncStatus.scheduled,
      scheduledFor: when,
    );
  }

  Future<GoalsReminderSyncResult> _cancelAndReport(
    GoalsReminderSyncStatus status,
  ) async {
    final cancelled = await gateway.cancelAllOwned();
    if (cancelled is NotificationFailed<void>) {
      return GoalsReminderSyncResult(
        GoalsReminderSyncStatus.failed,
        error: cancelled.error,
      );
    }
    return GoalsReminderSyncResult(status);
  }

  /// Turns the reminder on, requesting OS permission the first time.
  ///
  /// Permission is requested HERE — when the user opts in — and never on app
  /// launch. After a refusal the prompt is not shown again (the OS would not
  /// show it anyway); the caller surfaces the system-settings route instead.
  Future<GoalsReminderSyncResult> enable() async {
    final init = await gateway.initialize();
    if (init is NotificationFailed<void>) {
      return GoalsReminderSyncResult(
        GoalsReminderSyncStatus.failed,
        error: init.error,
      );
    }

    final prefs = await settings.load();
    var next = prefs.copyWith(enabled: true);

    if (!prefs.permissionRequested) {
      final requested = await gateway.requestPermission();
      next = next.copyWith(permissionRequested: true);
      if (requested is NotificationFailed<NotificationPermissionStatus>) {
        // The preference is still stored as ON: the user's intent is real
        // even if the platform call failed. reconcile() will report the
        // honest state.
        await settings.save(next);
        return GoalsReminderSyncResult(
          GoalsReminderSyncStatus.failed,
          error: requested.error,
        );
      }
    }

    await settings.save(next);
    return reconcile();
  }

  /// Turns the reminder off and cancels ONLY this app's own reminder.
  Future<GoalsReminderSyncResult> disable() async {
    final prefs = await settings.load();
    await settings.save(prefs.copyWith(enabled: false));
    return reconcile();
  }

  /// Current preference, for the Settings UI.
  Future<GoalsReminderSettings> currentSettings() => settings.load();

  /// Current OS permission state, without prompting.
  Future<NotificationPermissionStatus?> currentPermission() async {
    final result = await gateway.permissionStatus();
    return switch (result) {
      NotificationOk<NotificationPermissionStatus>(value: final v) => v,
      NotificationFailed<NotificationPermissionStatus>() => null,
    };
  }
}
