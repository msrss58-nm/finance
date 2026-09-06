import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';

/// Milestone 6, section 10 — "Navigation compatibility": the Milestone 5
/// navigation-shell tests (test/app/navigation_shell_test.dart) exercise the
/// shell's mechanics using [PlaceholderScreen], proving the ARCHITECTURE is
/// sound — but they never actually mount the 5 real screens built in this
/// milestone together. This suite closes that gap: it wires up
/// [NavigationShell]'s real `defaultScreenBuilder` (Home/Forecast/Goals/
/// Categories/Settings) behind a real, empty, in-memory database, and walks
/// the same navigation/Back scenarios already proven at the architecture
/// level — now against the actual screens a user will see.
void main() {
  Widget harness(AppServices services) => MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: AppServicesScope(services: services, child: const NavigationShell()),
        ),
      );

  testWidgets('all five real screens load in the shell without error', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);

    for (final name in ['forecast', 'goals', 'categories', 'settings']) {
      await tester.tap(find.byKey(ValueKey('nav-destination-$name')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(ValueKey('screen-loaded-$name')),
        findsOneWidget,
        reason: 'real $name screen should be showing after navigating to it',
      );
    }
    await db.close();
  });

  testWidgets('Back walks the real visited history across the real screens, no duplicates/loops', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(harness(services));
    await tester.pumpAndSettle();

    for (final name in ['forecast', 'goals', 'settings']) {
      await tester.tap(find.byKey(ValueKey('nav-destination-$name')));
      await tester.pumpAndSettle();
    }
    expect(find.byKey(const ValueKey('screen-loaded-settings')), findsOneWidget);

    for (final expected in ['goals', 'forecast', 'home']) {
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey('screen-loaded-$expected')), findsOneWidget);
    }

    // Root Back with nothing left — must not crash or loop back into an
    // already-consumed screen.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
    await db.close();
  });

  testWidgets('re-tapping the active tab does not push a duplicate history entry', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(harness(services));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('nav-destination-categories')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-destination-categories')));
    await tester.pumpAndSettle();

    // A single Back must return straight to Home (root) — if the duplicate
    // tap had pushed a second entry, this Back would land on categories
    // again instead.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
    await db.close();
  });
}
