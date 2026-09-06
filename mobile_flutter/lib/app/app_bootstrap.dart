import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import '../data/persistence/drift/app_database.dart';
import '../data/persistence/drift/database_opener.dart';
import '../security/app_lock_lifecycle_observer.dart';
import '../security/auth_controller.dart';
import '../security/flutter_secure_secret_store.dart';
import '../security/pin_service.dart';
import '../security/pin_verifier.dart' show kPinKdfIterations;
import '../security/secure_secret_store.dart';
import '../notifications/flutter_local_notifications_gateway.dart';
import '../notifications/goals_reminder_scheduler.dart';
import '../notifications/notification_gateway.dart';
import '../security/secure_window.dart';
import 'navigation/navigation_shell.dart';
import 'security/auth_gate.dart';
import 'security/auth_scope.dart';
import 'services/app_services.dart';
import 'services/app_services_scope.dart';
import 'services/data_revision.dart';
import 'services/notification_scope.dart';

const String _kDatabaseFileName = 'familyfinance.sqlite';

/// Resolves the production on-device database file path (the platform's
/// app-documents directory, same directory family verified reachable and
/// durable by the Milestone 4 physical Android smoke test) and opens it
/// through the already-approved, already-tested [openAppDatabase] bootstrap
/// helper — reused completely unchanged, not reimplemented here.
Future<AppDatabase> openProductionDatabase() async {
  final docsDir = await getApplicationDocumentsDirectory();
  final file = File('${docsDir.path}/$_kDatabaseFileName');
  return openAppDatabase(file);
}

/// The real production entry point's root widget.
///
/// Wires two INDEPENDENT composition roots, deliberately not merged:
///   - financial: database -> [AppServices] -> [AppServicesScope]
///   - security:  [SecureSecretStore] -> [PinService] -> [AuthController]
///                -> [AuthScope]
///
/// They share no object. The security layer cannot reach a repository and
/// the data layer cannot reach the PIN, which is what makes Milestone 7
/// section 12's isolation structural.
///
/// Startup ordering (section 5): both initialize concurrently, but
/// [AuthGate] gates the entire Navigator, so no financial UI can be built
/// or become interactable until the security state is known AND permits it.
/// A database that finishes opening first simply waits behind the gate.
class AppBootstrap extends StatefulWidget {
  const AppBootstrap({
    super.key,
    Future<AppDatabase> Function()? databaseOpener,
    this.secureSecretStore,
    this.secureWindowController,
    this.pinKdfIterations,
    this.notificationGateway,
    PendingNotificationRoute? pendingNotificationRoute,
  })  : _databaseOpener = databaseOpener ?? openProductionDatabase,
        _injectedPendingRoute = pendingNotificationRoute;

  /// Injectable for tests, so startup success/failure can be exercised
  /// without touching real device storage.
  final Future<AppDatabase> Function() _databaseOpener;

  /// Injectable for tests. Production uses the Keystore/Keychain-backed
  /// [FlutterSecureSecretStore].
  final SecureSecretStore? secureSecretStore;

  /// Injectable for tests. Production applies FLAG_SECURE on Android.
  final SecureWindowController? secureWindowController;

  /// Injectable purely so tests are not forced to pay the real (deliberately
  /// slow) key-derivation cost. Production always uses the real work factor.
  final int? pinKdfIterations;

  /// Injectable for tests (Milestone 9). Production uses the real
  /// `flutter_local_notifications`-backed gateway.
  final NotificationGateway? notificationGateway;

  /// Injectable for tests (Milestone 9), so a notification tap can be
  /// simulated without a real OS delivery. Production creates and owns its
  /// own instance.
  final PendingNotificationRoute? _injectedPendingRoute;

  @override
  State<AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends State<AppBootstrap> {
  late final Future<AppServices> _servicesFuture;
  late final PinService _pinService;
  late final AuthController _authController;
  late final AppLockLifecycleObserver _lifecycleObserver;

  /// Milestone 8: the single, app-run-scoped "the stored data was replaced"
  /// signal. Owned and disposed here — not a global, not a singleton.
  final DataRevision _dataRevision = DataRevision();

  /// Milestone 9. All three are app-run-scoped and owned here, mirroring the
  /// security and financial roots: no global, no singleton, no service
  /// locator.
  late final NotificationGateway _notificationGateway;
  late final PendingNotificationRoute _pendingNotificationRoute =
      widget._injectedPendingRoute ?? PendingNotificationRoute();

  /// Only an instance this widget created may be disposed here.
  bool get _ownsPendingRoute => widget._injectedPendingRoute == null;
  GoalsReminderScheduler? _reminderScheduler;

  /// Reconciles the reminder whenever the app comes back to the foreground —
  /// the cheapest correct answer to "the month rolled over", "the user
  /// changed timezone" and "the user granted the permission in system
  /// settings" all at once.
  late final _ReminderLifecycleObserver _reminderLifecycleObserver;

  @override
  void initState() {
    super.initState();
    // AppServices.fromDatabase is called exactly once here, not per-build —
    // the database is opened once and the resulting repository instances
    // are reused for the lifetime of the app run.
    _servicesFuture = widget._databaseOpener().then(AppServices.fromDatabase);
    // Attach a listener immediately so the future is always OBSERVED. Before
    // the security gate existed, the FutureBuilder below subscribed during
    // the very first build; now the Navigator (and therefore that
    // FutureBuilder) is not built until AuthGate opens, so a database that
    // fails to open in the meantime would complete with nobody listening and
    // be reported as an unhandled async error instead of reaching the
    // bootstrap-failed screen. This no-op listener only marks it handled —
    // FutureBuilder still receives the same error when it does subscribe.
    unawaited(_servicesFuture.then((_) {}, onError: (Object error, StackTrace stack) {}));

    _pinService = PinService(
      widget.secureSecretStore ?? FlutterSecureSecretStore(),
      iterations: widget.pinKdfIterations ?? kPinKdfIterations,
    );
    _authController = AuthController(
      _pinService,
      secureWindow:
          widget.secureWindowController ?? const PlatformSecureWindowController(),
    );
    _lifecycleObserver = AppLockLifecycleObserver(_authController);
    WidgetsBinding.instance.addObserver(_lifecycleObserver);

    // Milestone 9. The gateway is created eagerly (it owns the plugin
    // handle and the tap callback); the SCHEDULER only exists once the
    // database has opened, because it reads Goals.
    _notificationGateway = widget.notificationGateway ??
        FlutterLocalNotificationsGateway(
          onNotificationTapped: _pendingNotificationRoute.set,
        );
    _reminderLifecycleObserver = _ReminderLifecycleObserver(
      () => unawaited(_reminderScheduler?.reconcile() ?? Future<void>.value()),
    );
    WidgetsBinding.instance.addObserver(_reminderLifecycleObserver);
    _dataRevision.addListener(_onDataReplaced);

    unawaited(_servicesFuture.then((services) {
      if (!mounted) return;
      final scheduler = GoalsReminderScheduler(
        goals: services.goals,
        settings: services.goalsReminderSettings,
        gateway: _notificationGateway,
      );
      setState(() => _reminderScheduler = scheduler);
      // Startup reconciliation. Never awaited by the UI: a notification
      // problem must not delay or block the app.
      unawaited(scheduler.reconcile());
      final gateway = _notificationGateway;
      if (gateway is FlutterLocalNotificationsGateway) {
        // Cold start FROM a notification tap. This is only a routing hint;
        // AuthGate still decides whether anything may be shown.
        unawaited(gateway
            .launchPayload()
            .then(_pendingNotificationRoute.set, onError: (Object _) {}));
      }
    }, onError: (Object _, StackTrace _) {}));
    // Not awaited: the widget tree renders the AuthInitializing state
    // (which does NOT allow sensitive content) until this resolves.
    unawaited(_authController.initialize());
  }

  /// A completed restore replaced every stored value, Goals included, so the
  /// reminder decision is stale. DataRevision is used here purely as a
  /// TRIGGER — the notification's own state stays in the scheduler.
  void _onDataReplaced() {
    unawaited(_reminderScheduler?.reconcile() ?? Future<void>.value());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    WidgetsBinding.instance.removeObserver(_reminderLifecycleObserver);
    _authController.dispose();
    _dataRevision.removeListener(_onDataReplaced);
    _dataRevision.dispose();
    if (_ownsPendingRoute) _pendingNotificationRoute.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: _authController,
      pinService: _pinService,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        // AuthGate is installed through `builder`, i.e. ABOVE the Navigator,
        // so that no route the app can push — including a dialog or a modal
        // bottom sheet — is ever able to paint on top of the lock screen.
        // Directionality lives here too, so the lock screen, every app
        // screen and every dialog all get RTL from one place.
        builder: (context, child) => Directionality(
          textDirection: TextDirection.rtl,
          child: AuthGate(child: child ?? const SizedBox.shrink()),
        ),
        home: FutureBuilder<AppServices>(
          future: _servicesFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Scaffold(
                key: ValueKey('bootstrap-loading'),
                body: Center(child: CircularProgressIndicator()),
              );
            }
            if (snapshot.hasError) {
              return Scaffold(
                key: const ValueKey('bootstrap-failed'),
                body: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'שגיאת אתחול אחסון:\n${snapshot.error}',
                      key: const ValueKey('bootstrap-error-text'),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              );
            }
            return KeyedSubtree(
              key: const ValueKey('bootstrap-ready'),
              child: AppServicesScope(
                services: snapshot.data!,
                child: DataRevisionScope(
                  revision: _dataRevision,
                  child: NotificationScope(
                    scheduler: _reminderScheduler,
                    child: PendingNotificationRouteScope(
                      route: _pendingNotificationRoute,
                      child: const NavigationShell(),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Fires [onResumed] when the app returns to the foreground.
///
/// Deliberately a SECOND, independent observer rather than a branch inside
/// [AppLockLifecycleObserver]: the lock policy is security-critical and
/// Milestone 7 owns it. Nothing here can lock, unlock, or otherwise
/// influence that policy.
class _ReminderLifecycleObserver with WidgetsBindingObserver {
  _ReminderLifecycleObserver(this.onResumed);

  final void Function() onResumed;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) onResumed();
  }
}
