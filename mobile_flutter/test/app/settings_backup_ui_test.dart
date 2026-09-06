import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/app_screen.dart';
import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/screens/settings_screen.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/app/services/data_revision.dart';
import 'package:familyfinance_pro/data/files/backup_file_gateway.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_backup_file_gateway.dart';
import '../fakes/fake_secure_secret_store.dart';

/// Milestone 8 — the Settings backup UI.
///
/// The gateway is faked, so no platform channel and no real file are
/// involved; everything below the gateway (validator, restore transaction)
/// is the real implementation running against a real in-memory Drift
/// database.

const Key _exportButton = ValueKey('settings-backup-export-button');
const Key _importButton = ValueKey('settings-backup-import-button');
const Key _status = ValueKey('settings-backup-status');
const Key _confirmDialog = ValueKey('backup-import-confirm-dialog');
const Key _confirmApprove = ValueKey('backup-import-confirm-approve');
const Key _confirmCancel = ValueKey('backup-import-confirm-cancel');

const String _validItems = '[{"id":1,"type":"fixed","title":"שכירות",'
    '"amount":4000,"day":1,"isArchived":false}]';

String _envelope({Object? schemaVersion = 2, Map<String, String>? data}) =>
    jsonEncode({
      'schemaVersion': schemaVersion,
      'exportedAt': '2026-09-06T10:00:00.000',
      'data': data ??
          {
            kDataKey: _validItems,
            kSettingsKey: '{"theme":"dark"}',
            kGoalsKey: '[]',
          },
    });

Widget _harness(
  AppServices services,
  BackupFileGateway gateway, {
  DataRevision? revision,
}) {
  final pinService = PinService(FakeSecureSecretStore(), iterations: 1000);
  final screen = SettingsScreen(fileGateway: gateway);
  final Widget body = revision == null
      ? AppServicesScope(services: services, child: screen)
      : AppServicesScope(
          services: services,
          child: DataRevisionScope(revision: revision, child: screen),
        );
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: AuthScope(
        controller: AuthController(pinService),
        pinService: pinService,
        child: body,
      ),
    ),
  );
}

Future<void> _scrollToBackupSection(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.byKey(_importButton),
    200,
    scrollable: find.descendant(
      of: find.byKey(const ValueKey('settings-list')),
      matching: find.byType(Scrollable),
    ),
  );
  await tester.pumpAndSettle();
}

String _statusText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(_status)).data!;

void main() {
  testWidgets('both backup controls are present and idle shows no status',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services, FakeBackupFileGateway()));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    expect(find.byKey(_exportButton), findsOneWidget);
    expect(find.byKey(_importButton), findsOneWidget);
    expect(find.byKey(_status), findsNothing, reason: 'idle state');
    await db.close();
  });

  testWidgets('export writes a file through the gateway and reports success',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, _validItems);
    await store.setString(kGoalsKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway();

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_exportButton));
    await tester.pumpAndSettle();

    expect(gateway.saveCalls, 1);
    expect(gateway.lastSuggestedFileName, startsWith('familyfinance-backup-'));
    expect(gateway.lastSuggestedFileName, endsWith('.json'));
    expect(_statusText(tester), contains('הגיבוי נשמר'));

    final written = jsonDecode(utf8.decode(gateway.lastSavedBytes!))
        as Map<String, Object?>;
    expect(written['schemaVersion'], 2);
    expect((written['data'] as Map)[kDataKey], _validItems);
    await db.close();
  });

  testWidgets('cancelling the save dialog reports a cancellation, not an error',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway(
      saveResult: const FileTransferCancelled<Uri>(),
    );

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_exportButton));
    await tester.pumpAndSettle();

    expect(_statusText(tester), contains('בוטל'));
    await db.close();
  });

  testWidgets('import shows a confirmation before any write happens',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway()..willPickText(_envelope());

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();

    expect(find.byKey(_confirmDialog), findsOneWidget);
    // Still nothing written while the dialog is open.
    expect(await store.getString(kDataKey), '[]');
    await db.close();
  });

  testWidgets('cancelling the confirmation changes nothing', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway()..willPickText(_envelope());

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_confirmCancel));
    await tester.pumpAndSettle();

    expect(find.byKey(_confirmDialog), findsNothing);
    expect(await store.getString(kDataKey), '[]',
        reason: 'a cancelled confirmation must not write');
    expect(_statusText(tester), contains('בוטל'));
    await db.close();
  });

  testWidgets('a confirmed import restores the data and reports success',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway()..willPickText(_envelope());

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_confirmApprove));
    await tester.pumpAndSettle();

    expect(await store.getString(kDataKey), _validItems);
    expect(await store.getString(kSettingsKey), '{"theme":"dark"}');
    expect(_statusText(tester), contains('השחזור הושלם'));
    await db.close();
  });

  testWidgets('cancelling the picker reports a cancellation and writes nothing',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway(
      pickResult: const FileTransferCancelled<PickedFile>(),
    );

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();

    expect(find.byKey(_confirmDialog), findsNothing);
    expect(await store.getString(kDataKey), '[]');
    expect(_statusText(tester), contains('בוטל'));
    await db.close();
  });

  testWidgets('an invalid file is rejected with no confirmation and no write',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway()..willPickText('not a backup');

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();

    expect(find.byKey(_confirmDialog), findsNothing,
        reason: 'an invalid file must never reach the confirmation step');
    expect(await store.getString(kDataKey), '[]');
    expect(_statusText(tester), contains('תקין'));
    await db.close();
  });

  testWidgets('a rejection message never renders the file contents',
      (tester) async {
    const secret = 'SECRET-MARKER-4471';
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final gateway = FakeBackupFileGateway()
      ..willPickText('{"schemaVersion":2,"data":{"evil":"$secret"}}');

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();

    expect(_statusText(tester).contains(secret), isFalse);
    expect(find.textContaining(secret), findsNothing);
    await db.close();
  });

  testWidgets('both controls are disabled while an operation is in flight',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final gateway = _SlowGateway();

    await tester.pumpWidget(_harness(services, gateway));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_exportButton));
    await tester.pump(); // enter the working state, do not settle

    expect(tester.widget<ButtonStyleButton>(find.byKey(_exportButton)).onPressed,
        isNull);
    expect(tester.widget<ButtonStyleButton>(find.byKey(_importButton)).onPressed,
        isNull);

    // A second tap while busy must not start a second native interaction.
    await tester.tap(find.byKey(_exportButton), warnIfMissed: false);
    await tester.tap(find.byKey(_importButton), warnIfMissed: false);
    await tester.pump();
    expect(gateway.saveCalls, 1);
    expect(gateway.pickCalls, 0);

    gateway.release();
    await tester.pumpAndSettle();
    await db.close();
  });

  testWidgets('a successful restore bumps the data revision so other screens '
      'reload', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final store = DriftKeyValueStore(db);
    await store.setString(kDataKey, '[]');
    final services = AppServices.fromDatabase(db);
    final revision = DataRevision();
    addTearDown(revision.dispose);
    final gateway = FakeBackupFileGateway()..willPickText(_envelope());

    await tester.pumpWidget(_harness(services, gateway, revision: revision));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    expect(revision.revision, 0);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(_confirmApprove));
    await tester.pumpAndSettle();

    expect(revision.revision, 1,
        reason: 'the other four screens are remounted off this signal');
    await db.close();
  });

  testWidgets('a failed import does NOT bump the data revision', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final revision = DataRevision();
    addTearDown(revision.dispose);
    final gateway = FakeBackupFileGateway()..willPickText('garbage');

    await tester.pumpWidget(_harness(services, gateway, revision: revision));
    await tester.pumpAndSettle();
    await _scrollToBackupSection(tester);

    await tester.tap(find.byKey(_importButton));
    await tester.pumpAndSettle();

    expect(revision.revision, 0);
    await db.close();
  });

  testWidgets('RefreshOnDataRevision remounts its child when data is replaced',
      (tester) async {
    final revision = DataRevision();
    addTearDown(revision.dispose);
    _MountCounterState.mounts = 0;

    await tester.pumpWidget(
      DataRevisionScope(
        revision: revision,
        child: const Directionality(
          textDirection: TextDirection.rtl,
          child: RefreshOnDataRevision(child: _MountCounter()),
        ),
      ),
    );
    expect(_MountCounterState.mounts, 1);

    revision.markDataReplaced();
    await tester.pump();
    expect(_MountCounterState.mounts, 2,
        reason: 'a bumped revision must recreate the screen State so its '
            'cached future is re-issued');
  });

  testWidgets('the production screen builder wraps the four data screens only',
      (tester) async {
    // Settings owns the import flow and refreshes itself, so remounting it
    // would destroy the result message the user just produced.
    expect(defaultScreenBuilder(AppScreen.home), isA<RefreshOnDataRevision>());
    expect(defaultScreenBuilder(AppScreen.forecast), isA<RefreshOnDataRevision>());
    expect(defaultScreenBuilder(AppScreen.goals), isA<RefreshOnDataRevision>());
    expect(
        defaultScreenBuilder(AppScreen.categories), isA<RefreshOnDataRevision>());
    expect(defaultScreenBuilder(AppScreen.settings), isA<SettingsScreen>());
  });
}

/// Holds the save call open so the busy state can be observed.
class _SlowGateway extends FakeBackupFileGateway {
  final _completer = Completer<FileTransferResult<Uri>>();

  void release() => _completer.complete(FileTransferOk(Uri.parse('content://x')));

  @override
  Future<FileTransferResult<Uri>> saveBackup({
    required String suggestedFileName,
    required Uint8List bytes,
    required String mimeType,
  }) {
    saveCalls++;
    return _completer.future;
  }
}

class _MountCounter extends StatefulWidget {
  const _MountCounter();

  @override
  State<_MountCounter> createState() => _MountCounterState();
}

class _MountCounterState extends State<_MountCounter> {
  static int mounts = 0;

  @override
  void initState() {
    super.initState();
    mounts++;
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
