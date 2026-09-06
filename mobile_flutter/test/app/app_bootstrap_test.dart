import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/app_bootstrap.dart';
import 'package:familyfinance_pro/core/errors/data_errors.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';

import '../fakes/fake_secure_secret_store.dart';

/// Milestone 7 note: every test here injects an EMPTY fake secure store, so
/// the security layer resolves to "no PIN configured" and these tests keep
/// exercising exactly what they always did — persistence startup. The
/// security gate's own behaviour is covered by test/security/.
///
/// `pump()` is used rather than `pumpAndSettle()` wherever a spinner is
/// expected on screen (an indeterminate CircularProgressIndicator animates
/// forever, so pumpAndSettle would time out). Two pumps are needed before
/// the bootstrap state is observable: the first lets AuthController's async
/// initialize() complete, the second builds the Navigator behind the now-open
/// gate.
void main() {
  testWidgets('shows a loading state while the database is still opening', (tester) async {
    final completer = Completer<AppDatabase>();
    await tester.pumpWidget(AppBootstrap(
      databaseOpener: () => completer.future,
      secureSecretStore: FakeSecureSecretStore(),
    ));

    await tester.pump();
    await tester.pump();
    expect(find.byKey(const ValueKey('bootstrap-loading')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    completer.complete(AppDatabase(NativeDatabase.memory()));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('bootstrap-ready')), findsOneWidget);
  });

  testWidgets('navigation shell appears only after successful initialization', (tester) async {
    final completer = Completer<AppDatabase>();
    await tester.pumpWidget(AppBootstrap(
      databaseOpener: () => completer.future,
      secureSecretStore: FakeSecureSecretStore(),
    ));
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const ValueKey('screen-loaded-home')), findsNothing);

    completer.complete(AppDatabase(NativeDatabase.memory()));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
  });

  testWidgets('a persistence startup failure is surfaced, not silently swallowed', (tester) async {
    await tester.pumpWidget(
      AppBootstrap(
        databaseOpener: () async => throw const StorageOpenFailure('simulated open failure'),
        secureSecretStore: FakeSecureSecretStore(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('bootstrap-failed')), findsOneWidget);
    expect(find.byKey(const ValueKey('bootstrap-ready')), findsNothing);
    final errorText = tester.widget<Text>(find.byKey(const ValueKey('bootstrap-error-text')));
    expect(errorText.data, contains('StorageOpenFailure'));
    expect(errorText.data, contains('simulated open failure'));
  });

  testWidgets('a schema migration failure at startup is also surfaced with its real type', (tester) async {
    await tester.pumpWidget(
      AppBootstrap(
        databaseOpener: () async => throw const SchemaMigrationFailure(
          'no migration path',
          fromVersion: 1,
          toVersion: 2,
        ),
        secureSecretStore: FakeSecureSecretStore(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('bootstrap-failed')), findsOneWidget);
    final errorText = tester.widget<Text>(find.byKey(const ValueKey('bootstrap-error-text')));
    expect(errorText.data, contains('SchemaMigrationFailure'));
  });
}
