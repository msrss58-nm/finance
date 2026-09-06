import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/settings_screen.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/domain/models/app_settings.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_secure_secret_store.dart';

/// Milestone 7 added the PIN section to this screen, so the harness now also
/// provides an [AuthScope]. The work factor is deliberately tiny: the
/// production 210000 iterations would make widget tests unusably slow, and
/// the iteration count is stored per-record so it cannot affect correctness.
Widget _harness(AppServices services) {
  final pinService = PinService(FakeSecureSecretStore(), iterations: 1000);
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: AuthScope(
        controller: AuthController(pinService),
        pinService: pinService,
        child: AppServicesScope(services: services, child: const SettingsScreen()),
      ),
    ),
  );
}

void main() {
  testWidgets('shows a loading indicator before data resolves', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));

    expect(find.byKey(const ValueKey('screen-loading')), findsOneWidget);
    await tester.pumpAndSettle();
    await db.close();
  });

  testWidgets('default settings: opening balance unset, defaults rendered', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-settings')), findsOneWidget);
    expect(find.text('לא הוגדר'), findsWidgets);
    expect(find.text('system'), findsOneWidget);
    await db.close();
  });

  testWidgets('populated settings reflect real stored values', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final store = DriftKeyValueStore(db);
    await SettingsRepositoryImpl(store).save(
      AppSettings(
        theme: const LegacyStringField('dark'),
        primaryColor: const LegacyStringField('blue'),
        fontSize: const LegacyStringField('large'),
        pinEnabled: true,
        openingBalance: const OpeningBalanceConfig(
          amount: 5000,
          dateStr: '2026-09-01',
          includedWithdrawalIds: [],
        ),
        notifications: const NotificationPrefs(),
        experimentalFlags: const {},
        legacy: LegacySettingsFields.empty,
      ),
    );

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.text('dark'), findsOneWidget);
    expect(find.textContaining('5000'), findsOneWidget);
    expect(find.text('2026-09-01'), findsOneWidget);
    await db.close();
  });

  testWidgets('legacy pinEnabled is not presented as the live lock state', (tester) async {
    // Tall surface so the security section (last in the list) is laid out.
    await tester.binding.setSurfaceSize(const Size(800, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final store = DriftKeyValueStore(db);
    // Legacy Web field says "PIN on" while the real PinService has no record.
    // The screen must report the REAL state, not the inert legacy flag.
    await SettingsRepositoryImpl(store).save(
      AppSettings(
        theme: const LegacyStringField('system'),
        primaryColor: const LegacyStringField('green'),
        fontSize: const LegacyStringField('medium'),
        pinEnabled: true,
        pinHash: 'legacy-hash',
        openingBalance: null,
        notifications: const NotificationPrefs(),
        experimentalFlags: const {},
        legacy: LegacySettingsFields.empty,
      ),
    );

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(find.text('נעילת PIN פעילה'), findsNothing);

    // And the legacy fields are still persisted — presentation changed, data
    // was not dropped.
    final reloaded = await SettingsRepositoryImpl(store).load();
    expect(reloaded.pinEnabled, isTrue);
    expect(reloaded.pinHash, 'legacy-hash');
    await db.close();
  });

  testWidgets('repository failure is shown as a real error, not fabricated defaults', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await db.customSelect('select 1').getSingle();
    await db.close();
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-error-text')), findsOneWidget);
    expect(find.byKey(const ValueKey('settings-list')), findsNothing);
  });
}
