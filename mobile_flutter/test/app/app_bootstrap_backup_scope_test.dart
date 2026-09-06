import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/app_bootstrap.dart';
import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/services/backup_transfer_coordinator.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';

import '../fakes/fake_notification_gateway.dart';
import '../fakes/fake_secure_secret_store.dart';

/// Milestone 10 blocker fix — the production composition root must own the
/// backup coordinator.
///
/// `SettingsScreen` falls back to a screen-owned coordinator when no scope is
/// installed, which keeps bare widget tests working — but that fallback is
/// disposed with the screen and therefore offers NO lock-survival guarantee.
/// If production ever lost this scope, the original blocker would come back
/// silently and every other test would still pass. This test is what makes
/// that regression impossible to miss.
void main() {
  testWidgets('AppBootstrap installs a BackupTransferCoordinatorScope above '
      'the navigation shell', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(AppBootstrap(
      databaseOpener: () async => db,
      secureSecretStore: FakeSecureSecretStore(),
      pinKdfIterations: 1000,
      notificationGateway: FakeNotificationGateway(),
    ));
    await tester.pumpAndSettle();

    final shellContext = tester.element(find.byType(NavigationShell));
    final coordinator = BackupTransferCoordinatorScope.readOf(shellContext);

    expect(coordinator, isNotNull,
        reason: 'without this scope the SAF-lock blocker returns');
    // Wired to the same data-replaced signal the rest of the app listens to,
    // so a restore that finishes while locked still refreshes the screens.
    expect(coordinator!.dataRevision, isNotNull);
    expect(coordinator.state, BackupUiState.idle);
    expect(coordinator.hasPendingConfirmation, isFalse);
  });
}
