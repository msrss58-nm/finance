// Top-level app smoke test (Milestone 5). Replaces the default
// counter-app template test, which referenced MyApp/MyHomePage —
// removed when the real production entry point (AppBootstrap +
// NavigationShell) replaced the Flutter starter template in lib/main.dart.
//
// Uses AppBootstrap's injectable databaseOpener rather than calling
// openProductionDatabase() (which needs a real path_provider platform
// channel, unavailable in a plain widget test) — detailed
// startup/navigation behavior has its own focused suite under test/app/.
//
// Milestone 7: also injects a fake secure store. The real one is a
// Keystore/Keychain platform channel that does not exist in a plain widget
// test; without the fake, AuthController would (correctly) report a storage
// failure and gate the app, so this test would no longer be testing
// startup. The fake starts empty => no PIN configured => AuthNotConfigured.
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/app_bootstrap.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';

import 'fakes/fake_secure_secret_store.dart';

void main() {
  testWidgets('app boots through AppBootstrap to the real Home screen', (tester) async {
    await tester.pumpWidget(
      AppBootstrap(
        databaseOpener: () async => AppDatabase(NativeDatabase.memory()),
        secureSecretStore: FakeSecureSecretStore(),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('bootstrap-ready')), findsOneWidget);
    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
  });
}
