import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/app_screen.dart';
import 'package:familyfinance_pro/app/navigation/navigation_history_controller.dart';
import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/screens/settings_screen.dart';
import 'package:familyfinance_pro/app/security/auth_gate.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/app/services/backup_transfer_coordinator.dart';
import 'package:familyfinance_pro/app/services/data_revision.dart';
import 'package:familyfinance_pro/data/backup/backup_transfer_service.dart';
import 'package:familyfinance_pro/data/files/backup_file_gateway.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/security/app_lock_lifecycle_observer.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_secure_secret_store.dart';

/// Milestone 10 blocker regression — SAF + PIN lifecycle.
///
/// The 824 tests that existed before this fix all passed while the feature was
/// physically broken on the device, because none of them ever put a REAL
/// lifecycle event in the middle of a picker round trip. Every test here does
/// exactly that: the picker is held open, `AppLifecycleState.paused` is
/// delivered to the real [AppLockLifecycleObserver], the real [AuthGate]
/// removes the whole shell (disposing `SettingsScreen`), and only then does the
/// picker return.
///
/// Everything below the gateway is real: the real [BackupTransferService], the
/// real validator and the real restore transaction over a real in-memory Drift
/// database.

const Key _exportButton = ValueKey('settings-backup-export-button');
const Key _importButton = ValueKey('settings-backup-import-button');
const Key _status = ValueKey('settings-backup-status');
const Key _confirmDialog = ValueKey('backup-import-confirm-dialog');
const Key _confirmApprove = ValueKey('backup-import-confirm-approve');
const Key _confirmCancel = ValueKey('backup-import-confirm-cancel');
const Key _lockScreen = ValueKey('lock-screen');
const Key _settingsList = ValueKey('settings-list');

const String _kPin = '246810';
const int _kFastIterations = 1000;

const String _restoredItems = '[{"id":7,"type":"fixed","title":"QA-SYNTHETIC",'
    '"amount":1234,"day":3,"isArchived":false}]';

String _validEnvelope({Object? schemaVersion = 2}) => jsonEncode({
      'schemaVersion': schemaVersion,
      'exportedAt': '2026-09-06T10:00:00.000',
      'data': {
        kDataKey: _restoredItems,
        kSettingsKey: '{"theme":"dark"}',
        kGoalsKey: '[]',
      },
    });

/// A gateway whose picker/save can be held open for as long as a test wants,
/// which is what makes "the app locked WHILE the picker was open" expressible.
class _HeldBackupFileGateway implements BackupFileGateway {
  final List<Completer<FileTransferResult<PickedFile>>> _pickCompleters = [];
  final List<Completer<FileTransferResult<Uri>>> _saveCompleters = [];

  int saveCalls = 0;
  int pickCalls = 0;
  Uint8List? lastSavedBytes;

  @override
  Future<FileTransferResult<Uri>> saveBackup({
    required String suggestedFileName,
    required Uint8List bytes,
    required String mimeType,
  }) {
    saveCalls++;
    lastSavedBytes = bytes;
    final completer = Completer<FileTransferResult<Uri>>();
    _saveCompleters.add(completer);
    return completer.future;
  }

  @override
  Future<FileTransferResult<PickedFile>> pickBackup() {
    pickCalls++;
    final completer = Completer<FileTransferResult<PickedFile>>();
    _pickCompleters.add(completer);
    return completer.future;
  }

  void completeSave({Uri? uri, FileTransferError? error}) {
    _saveCompleters.removeAt(0).complete(
          error != null
              ? FileTransferFailed<Uri>(error)
              : FileTransferOk(uri ?? Uri.parse('content://test/backup.json')),
        );
  }

  void cancelSave() =>
      _saveCompleters.removeAt(0).complete(const FileTransferCancelled<Uri>());

  void completePickText(String text, {String name = 'backup.json'}) {
    _pickCompleters.removeAt(0).complete(
          FileTransferOk(
            PickedFile(name: name, bytes: Uint8List.fromList(utf8.encode(text))),
          ),
        );
  }

  void cancelPick() => _pickCompleters
      .removeAt(0)
      .complete(const FileTransferCancelled<PickedFile>());

  void failPick(FileTransferError error) =>
      _pickCompleters.removeAt(0).complete(FileTransferFailed<PickedFile>(error));
}

/// Mirrors production exactly: `AuthScope` wraps the `MaterialApp`, `AuthGate`
/// is installed through `builder` (ABOVE the Navigator), and the coordinator
/// scope sits above the navigation shell — i.e. above everything the gate
/// tears down.
class _Harness {
  _Harness({
    required this.services,
    required this.gateway,
    required this.dataRevision,
  })  : pinService = PinService(FakeSecureSecretStore(), iterations: _kFastIterations),
        coordinator = BackupTransferCoordinator(dataRevision: dataRevision),
        navigationController = NavigationHistoryController() {
    authController = AuthController(pinService);
    lifecycleObserver = AppLockLifecycleObserver(authController);
  }

  final AppServices services;
  final _HeldBackupFileGateway gateway;
  final DataRevision dataRevision;
  final PinService pinService;
  final BackupTransferCoordinator coordinator;
  final NavigationHistoryController navigationController;
  late final AuthController authController;
  late final AppLockLifecycleObserver lifecycleObserver;

  Widget build() => AuthScope(
        controller: authController,
        pinService: pinService,
        child: MaterialApp(
          builder: (context, child) => Directionality(
            textDirection: TextDirection.rtl,
            child: AuthGate(child: child ?? const SizedBox.shrink()),
          ),
          home: AppServicesScope(
            services: services,
            child: DataRevisionScope(
              revision: dataRevision,
              child: BackupTransferCoordinatorScope(
                coordinator: coordinator,
                child: NavigationShell(
                  controller: navigationController,
                  screenBuilder: (screen) => screen == AppScreen.settings
                      ? SettingsScreen(fileGateway: gateway)
                      : Center(child: Text('screen-${screen.name}')),
                ),
              ),
            ),
          ),
        ),
      );

  void dispose() {
    authController.dispose();
    coordinator.dispose();
    navigationController.dispose();
    dataRevision.dispose();
  }
}

Future<_Harness> _pumpUnlockedSettings(
  WidgetTester tester, {
  required AppServices services,
  required _HeldBackupFileGateway gateway,
  required DataRevision dataRevision,
  bool withPin = true,
}) async {
  final harness = _Harness(
    services: services,
    gateway: gateway,
    dataRevision: dataRevision,
  );
  if (withPin) await harness.pinService.setPin(_kPin);
  await harness.authController.initialize();
  WidgetsBinding.instance.addObserver(harness.lifecycleObserver);
  addTearDown(
      () => WidgetsBinding.instance.removeObserver(harness.lifecycleObserver));

  await tester.pumpWidget(harness.build());
  await tester.pumpAndSettle();
  if (withPin) await _unlock(tester, harness);
  harness.navigationController.navigateTo(AppScreen.settings);
  await tester.pumpAndSettle();
  return harness;
}

Future<void> _unlock(WidgetTester tester, _Harness harness) async {
  expect(find.byKey(_lockScreen), findsOneWidget,
      reason: 'a configured PIN must show the lock screen');
  await tester.enterText(find.byKey(const ValueKey('lock-pin-field')), _kPin);
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('lock-submit')));
  await tester.pumpAndSettle();
  expect(find.byKey(_lockScreen), findsNothing);
}

/// Delivers a REAL lifecycle event, exactly as the OS does when the SAF picker
/// takes the foreground. Nothing here calls `lock()` directly — the point is to
/// prove the real Milestone 7 policy is what locks.
/// The exact sequence Android delivers when another activity (the SAF picker)
/// takes the foreground: resumed -> inactive -> hidden -> paused.
Future<void> _background(WidgetTester tester) async {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
  await tester.pumpAndSettle();
}

/// ...and the reverse on the way back: paused -> hidden -> inactive -> resumed.
Future<void> _foreground(WidgetTester tester) async {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  await tester.pumpAndSettle();
}

Future<void> _scrollToBackup(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.byKey(_importButton),
    200,
    scrollable: find.descendant(
      of: find.byKey(_settingsList),
      matching: find.byType(Scrollable),
    ),
  );
  await tester.pumpAndSettle();
}

String _statusText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(_status)).data!;

void main() {
  // ---------------------------------------------------------------------
  // IMPORT WITH PIN / LIFECYCLE — the exact physical failure mode
  // ---------------------------------------------------------------------

  testWidgets('a validated import survives a lock during the picker and is '
      'confirmed after unlocking, restoring exactly once', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();
    final revision = DataRevision();
    var revisionBumps = 0;
    revision.addListener(() => revisionBumps++);

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: revision);
    await _scrollToBackup(tester);

    // 1. The user starts an import; the picker opens and is held open.
    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    expect(gateway.pickCalls, 1);

    // 2. The picker takes the foreground -> the REAL policy locks the app and
    //    AuthGate removes the shell, disposing SettingsScreen.
    await _background(tester);
    expect(find.byKey(_lockScreen), findsOneWidget,
        reason: 'the lifecycle policy must still lock immediately');
    expect(find.byKey(_settingsList), findsNothing,
        reason: 'AuthGate must not build the shell while locked');

    // 3. The picker returns a valid backup while the app is locked. Before the
    //    fix this landed in a disposed State and was silently discarded.
    gateway.completePickText(_validEnvelope());
    await _foreground(tester);
    await tester.pumpAndSettle();

    // Still locked, no dialog, and above all NOTHING written.
    expect(find.byKey(_lockScreen), findsOneWidget);
    expect(find.byKey(_confirmDialog), findsNothing);
    expect(await store.getString(kDataKey), '[]');
    expect(harness.coordinator.hasPendingConfirmation, isTrue,
        reason: 'the validated import must be retained across the lock');

    // 4. The user unlocks -> the confirmation finally appears.
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    expect(find.byKey(_confirmDialog), findsOneWidget);

    // 5. Confirm -> exactly one restore.
    await tester.tap(find.byKey(_confirmApprove));
    await tester.pumpAndSettle();

    expect(await store.getString(kDataKey), _restoredItems);
    expect(revisionBumps, 1, reason: 'exactly one data-replaced signal');
    expect(harness.coordinator.hasPendingConfirmation, isFalse);
    expect(harness.coordinator.state, BackupUiState.success);
    expect(find.byKey(_confirmDialog), findsNothing);

    harness.dispose();
    await db.close();
  });

  testWidgets('after unlocking, the shell returns the user to Settings rather '
      'than the default Home', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.completePickText(_validEnvelope());
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();

    expect(harness.navigationController.current, AppScreen.settings,
        reason: 'the pending confirmation lives on Settings');

    harness.dispose();
    await db.close();
  });

  testWidgets('cancelling the confirmation after an unlock writes nothing and '
      'clears the pending import', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();
    final revision = DataRevision();
    var revisionBumps = 0;
    revision.addListener(() => revisionBumps++);

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: revision);
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.completePickText(_validEnvelope());
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(_confirmCancel));
    await tester.pumpAndSettle();

    expect(await store.getString(kDataKey), '[]', reason: 'zero writes');
    expect(revisionBumps, 0);
    expect(harness.coordinator.hasPendingConfirmation, isFalse);
    expect(harness.coordinator.state, BackupUiState.cancelled);

    harness.dispose();
    await db.close();
  });

  testWidgets('locking again while the confirmation dialog is open re-presents '
      'it after the next unlock, and never writes in between', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.completePickText(_validEnvelope());
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    expect(find.byKey(_confirmDialog), findsOneWidget);

    // The app locks again with the dialog open. Milestone 7 requires the
    // transient to go away with the lock, which is what destroys the presenter
    // without a user decision.
    //
    // The lock is driven through `AuthController.lock()` here rather than a
    // lifecycle event, matching the approved Milestone 7 test
    // (`auth_gate_test.dart`, "an open dialog does not survive a lock"). With a
    // modal route already open, delivering the lifecycle events through the
    // TEST BINDING leaves the AuthScope element dirty-but-unscheduled, so the
    // gate never rebuilds in the harness. That is reproducible with a plain
    // `showDialog` and none of this milestone's code involved, i.e. it is a
    // harness artifact, not app behaviour — the real device is the authority
    // for this path and is exercised in the physical QA for this fix. Every
    // other test in this file still drives REAL lifecycle events.
    harness.authController.lock();
    await tester.pumpAndSettle();
    expect(find.byKey(_lockScreen), findsOneWidget);
    expect(find.byKey(_confirmDialog), findsNothing);

    // Nothing was decided, so nothing was written and the import is still held.
    expect(await store.getString(kDataKey), '[]');
    expect(harness.coordinator.hasPendingConfirmation, isTrue);

    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    expect(find.byKey(_confirmDialog), findsOneWidget,
        reason: 'the confirmation must come back, not be silently dropped');

    await tester.tap(find.byKey(_confirmApprove));
    await tester.pumpAndSettle();
    expect(await store.getString(kDataKey), _restoredItems);

    harness.dispose();
    await db.close();
  });

  testWidgets('one pending import produces exactly one dialog across many '
      'rebuilds', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    gateway.completePickText(_validEnvelope());
    await tester.pumpAndSettle();

    // Force extra rebuilds of the whole subtree.
    for (var i = 0; i < 3; i++) {
      await tester.pump();
      harness.coordinator.notifyListeners();
      await tester.pumpAndSettle();
    }

    expect(find.byKey(_confirmDialog), findsOneWidget);
    expect(harness.coordinator.claimPendingConfirmation(), isNull,
        reason: 'the claim must already be held by the open dialog');

    harness.dispose();
    await db.close();
  });

  // ---------------------------------------------------------------------
  // EXPORT WITH PIN / LIFECYCLE
  // ---------------------------------------------------------------------

  testWidgets('an export that completes while locked reports its result after '
      'unlocking, and writes the file exactly once', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, _restoredItems);
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_exportButton));
    await tester.pump();
    expect(gateway.saveCalls, 1);

    await _background(tester);
    expect(find.byKey(_lockScreen), findsOneWidget);

    // The platform finished writing the file while the app was locked.
    gateway.completeSave();
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(find.byKey(_status), findsOneWidget);
    expect(_statusText(tester), contains('הגיבוי נשמר'));
    expect(harness.coordinator.state, BackupUiState.success);
    expect(gateway.saveCalls, 1, reason: 'the file must not be written twice');

    harness.dispose();
    await db.close();
  });

  testWidgets('a cancelled export that resolves while locked leaves no stale '
      'pending state', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, _restoredItems);
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_exportButton));
    await tester.pump();
    await _background(tester);
    gateway.cancelSave();
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(harness.coordinator.state, BackupUiState.cancelled);
    expect(harness.coordinator.busy, isFalse, reason: 'controls re-enabled');
    expect(harness.coordinator.hasPendingConfirmation, isFalse);
    expect(_statusText(tester), contains('בוטל'));

    harness.dispose();
    await db.close();
  });

  testWidgets('a cancelled import picker that resolves while locked leaves no '
      'stale pending state', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.cancelPick();
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(find.byKey(_confirmDialog), findsNothing);
    expect(harness.coordinator.hasPendingConfirmation, isFalse);
    expect(harness.coordinator.state, BackupUiState.cancelled);
    expect(await store.getString(kDataKey), '[]');

    harness.dispose();
    await db.close();
  });

  // ---------------------------------------------------------------------
  // FAILURE PATHS THAT RESOLVE WHILE LOCKED
  // ---------------------------------------------------------------------

  testWidgets('a malformed backup rejected while locked shows a safe error '
      'after unlocking and writes nothing', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.completePickText('{ this is not a backup');
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(harness.coordinator.state, BackupUiState.validationFailure);
    expect(find.byKey(_confirmDialog), findsNothing);
    expect(await store.getString(kDataKey), '[]');
    // The message must never quote the rejected file's own contents.
    final message = _statusText(tester);
    expect(message, contains('אינו קובץ גיבוי תקין'));
    expect(message, isNot(contains('this is not a backup')));

    harness.dispose();
    await db.close();
  });

  /// NOTE on "unsupported schema": the backup contract deliberately does NOT
  /// reject a backup by version number — `schemaVersion >= 2` means
  /// goals-aware and anything else means legacy (see [RawBackupEnvelope]), so
  /// a higher version is forward-compatible by design, not an error. The
  /// rejection that DOES exist and matters here is structural: a key outside
  /// the `family_finance_` prefix — which is exactly what keeps a security key
  /// such as `ff_pin_v1` from ever being restored. That is the case exercised
  /// below, resolving while the app is locked.
  testWidgets('a backup carrying a foreign key is rejected while locked and '
      'reported safely after unlocking', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.completePickText(jsonEncode({
      'schemaVersion': 2,
      'exportedAt': '2026-09-06T10:00:00.000',
      'data': {kDataKey: _restoredItems, 'ff_pin_v1': 'injected'},
    }));
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(harness.coordinator.state, BackupUiState.validationFailure);
    expect(await store.getString(kDataKey), '[]',
        reason: 'a rejected backup writes nothing at all');
    expect(harness.coordinator.hasPendingConfirmation, isFalse);
    expect(await store.getString('ff_pin_v1'), isNull,
        reason: 'the injected security key must never be written');

    harness.dispose();
    await db.close();
  });

  testWidgets('a native file failure that resolves while locked is reported '
      'after unlocking and the app stays usable', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();
    await _background(tester);
    gateway.failPick(const FileReadFailure(causeType: 'PlatformException'));
    await _foreground(tester);
    await _unlock(tester, harness);
    await tester.pumpAndSettle();
    await _scrollToBackup(tester);

    expect(harness.coordinator.state, BackupUiState.fileIoFailure);
    expect(harness.coordinator.busy, isFalse);
    expect(tester.takeException(), isNull);
    // Still usable: the controls are live again.
    expect(
      tester.widget<OutlinedButton>(find.byKey(_importButton)).onPressed,
      isNotNull,
    );

    harness.dispose();
    await db.close();
  });

  // ---------------------------------------------------------------------
  // SECURITY INVARIANTS
  // ---------------------------------------------------------------------

  testWidgets('the lifecycle lock policy is untouched: paused still locks '
      'immediately, mid-operation included', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    final harness = await _pumpUnlockedSettings(tester,
        services: services, gateway: gateway, dataRevision: DataRevision());
    await _scrollToBackup(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pump();

    // A single `paused` while a backup operation is in flight must lock, with
    // no grace period and no special case for the picker.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pumpAndSettle();

    expect(find.byKey(_lockScreen), findsOneWidget);
    expect(find.byKey(_settingsList), findsNothing);
    expect(find.byKey(_status), findsNothing,
        reason: 'no backup UI may be readable while locked');

    harness.dispose();
    await db.close();
  });

  testWidgets('a pending import carries no PIN material and is never persisted',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();
    final secure = FakeSecureSecretStore();
    final pinService = PinService(secure, iterations: _kFastIterations);
    await pinService.setPin(_kPin);
    final writesBefore = secure.writeCount;
    final deletesBefore = secure.deleteCount;

    final coordinator = BackupTransferCoordinator();
    addTearDown(coordinator.dispose);
    final service = BackupTransferService(
      repository: services.backup,
      gateway: gateway,
    );

    unawaited(coordinator.startImport(service));
    await tester.pump();
    gateway.completePickText(_validEnvelope());
    await tester.pump();

    expect(coordinator.hasPendingConfirmation, isTrue);
    // The security store was neither read for, nor written by, the operation.
    expect(secure.writeCount, writesBefore);
    expect(secure.deleteCount, deletesBefore);
    expect(await pinService.isPinConfigured(), isTrue);
    expect(await pinService.verifyPin(_kPin), isTrue);

    // Nothing about the pending operation reached the app's own storage.
    final persisted = await store.keysWithPrefix('');
    expect(persisted.any((k) => k.contains('pending')), isFalse);
    expect(persisted.any((k) => k.contains('ff_pin')), isFalse);

    // And the operation state itself says nothing about a PIN.
    expect(coordinator.message.toLowerCase(), isNot(contains('pin')));

    await db.close();
  });

  testWidgets('process death while a confirmation is pending simply discards '
      'it — no partial restore is possible', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();

    // A pending confirmation exists only in this coordinator's memory...
    final coordinator = BackupTransferCoordinator();
    final service = BackupTransferService(
      repository: services.backup,
      gateway: gateway,
    );
    unawaited(coordinator.startImport(service));
    await tester.pump();
    gateway.completePickText(_validEnvelope());
    await tester.pump();
    expect(coordinator.hasPendingConfirmation, isTrue);
    expect(await store.getString(kDataKey), '[]',
        reason: 'nothing is written before confirmation');

    // ...so losing the process loses the operation, and only the operation.
    coordinator.dispose();

    // A fresh run starts clean, with the stored data exactly as it was.
    final restarted = BackupTransferCoordinator();
    addTearDown(restarted.dispose);
    expect(restarted.hasPendingConfirmation, isFalse);
    expect(restarted.state, BackupUiState.idle);
    expect(await store.getString(kDataKey), '[]');

    await db.close();
  });

  testWidgets('a second confirmation cannot replay a restore that already ran',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();
    final revision = DataRevision();
    addTearDown(revision.dispose);
    var bumps = 0;
    revision.addListener(() => bumps++);

    final coordinator = BackupTransferCoordinator(dataRevision: revision);
    addTearDown(coordinator.dispose);
    final service = BackupTransferService(
      repository: services.backup,
      gateway: gateway,
    );

    unawaited(coordinator.startImport(service));
    await tester.pump();
    gateway.completePickText(_validEnvelope());
    await tester.pump();

    await coordinator.commitPendingImport(deleteExistingGoals: false);
    expect(await store.getString(kDataKey), _restoredItems);
    expect(bumps, 1);

    // Every replay attempt after the fact is inert.
    await coordinator.commitPendingImport(deleteExistingGoals: false);
    coordinator.cancelPendingImport();
    expect(bumps, 1, reason: 'exactly one restore, ever');
    expect(coordinator.state, BackupUiState.success);
    expect(gateway.pickCalls, 1);

    await db.close();
  });

  testWidgets('a second start while an operation is in flight is ignored',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final gateway = _HeldBackupFileGateway();
    final coordinator = BackupTransferCoordinator();
    addTearDown(coordinator.dispose);
    final service = BackupTransferService(
      repository: services.backup,
      gateway: gateway,
    );

    unawaited(coordinator.startImport(service));
    await tester.pump();
    unawaited(coordinator.startImport(service));
    unawaited(coordinator.startExport(service));
    await tester.pump();

    expect(gateway.pickCalls, 1, reason: 'no second picker');
    expect(gateway.saveCalls, 0, reason: 'no export behind an open import');

    gateway.cancelPick();
    await tester.pump();
    await db.close();
  });
}
