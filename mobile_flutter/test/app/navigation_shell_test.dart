import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/app_screen.dart';
import 'package:familyfinance_pro/app/navigation/navigation_history_controller.dart';
import 'package:familyfinance_pro/app/navigation/navigation_shell.dart';
import 'package:familyfinance_pro/app/screens/placeholder_screen.dart';

/// Wraps [NavigationShell] the same way [AppBootstrap] does in production
/// (MaterialApp + RTL Directionality) so `showDialog`/PopScope context is
/// realistic, without needing a real database/bootstrap. Uses
/// [PlaceholderScreen] via the injectable `screenBuilder` (Milestone 6) so
/// these navigation-mechanics tests stay decoupled from the real screens'
/// `AppServicesScope`/repository requirements — this suite tests the SHELL,
/// not screen content.
Widget _harness(NavigationHistoryController controller) {
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: NavigationShell(
        controller: controller,
        screenBuilder: (screen) => PlaceholderScreen(screen: screen),
      ),
    ),
  );
}

Finder _titleFor(AppScreen s) => find.byKey(ValueKey('placeholder-title-${s.name}'));

void main() {
  testWidgets('initial route is Home', (tester) async {
    await tester.pumpWidget(_harness(NavigationHistoryController()));
    expect(_titleFor(AppScreen.home), findsOneWidget);
    expect(find.byKey(const ValueKey('shell-bottom-nav')), findsOneWidget);
  });

  testWidgets('tapping each bottom-nav destination navigates to that screen', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    for (final screen in AppScreen.values) {
      await tester.tap(find.byKey(ValueKey('nav-destination-${screen.name}')));
      await tester.pumpAndSettle();
      expect(controller.current, screen);
    }
  });

  testWidgets('active navigation state: selectedIndex on the NavigationBar matches current screen', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    await tester.tap(find.byKey(const ValueKey('nav-destination-goals')));
    await tester.pumpAndSettle();

    final bar = tester.widget<NavigationBar>(find.byKey(const ValueKey('shell-bottom-nav')));
    expect(bar.selectedIndex, AppScreen.values.indexOf(AppScreen.goals));
  });

  testWidgets('tapping the already-active destination does not push a duplicate history entry', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    await tester.tap(find.byKey(const ValueKey('nav-destination-home')));
    await tester.pumpAndSettle();
    expect(controller.history, [AppScreen.home]);
  });

  testWidgets('system Back from a secondary screen returns to the actual previous screen', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    await tester.tap(find.byKey(const ValueKey('nav-destination-forecast')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-destination-goals')));
    await tester.pumpAndSettle();
    expect(_titleFor(AppScreen.goals), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_titleFor(AppScreen.forecast), findsOneWidget);
  });

  testWidgets('repeated Back walks the actual visited history without looping or duplicating', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    for (final s in [AppScreen.forecast, AppScreen.goals, AppScreen.categories, AppScreen.settings]) {
      await tester.tap(find.byKey(ValueKey('nav-destination-${s.name}')));
      await tester.pumpAndSettle();
    }
    expect(_titleFor(AppScreen.settings), findsOneWidget);

    final expectedOrder = [AppScreen.categories, AppScreen.goals, AppScreen.forecast, AppScreen.home];
    for (final expectedScreen in expectedOrder) {
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(_titleFor(expectedScreen), findsOneWidget);
    }

    // One more Back at the true root must not crash, loop, or reopen
    // anything already consumed — it is left to normal Android root
    // behavior (exit), which in a test harness is simply a no-op.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_titleFor(AppScreen.home), findsOneWidget);
  });

  testWidgets('transient UI (a dialog) consumes Back before in-app screen history', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    await tester.tap(find.byKey(const ValueKey('nav-destination-forecast')));
    await tester.pumpAndSettle();
    // Return to Home to use its info-dialog fixture, without losing the
    // Forecast visit from history.
    await tester.tap(find.byKey(const ValueKey('nav-destination-home')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('home-info-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-info-dialog')), findsOneWidget);

    // Back must close the dialog FIRST — it must NOT also pop the in-app
    // screen history (still Home afterwards, Forecast still one Back away).
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-info-dialog')), findsNothing);
    expect(_titleFor(AppScreen.home), findsOneWidget);
    expect(controller.history, [AppScreen.forecast, AppScreen.home]);

    // A second Back now correctly reaches the in-app history.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_titleFor(AppScreen.forecast), findsOneWidget);
  });

  testWidgets('repeated Back after a transient is closed does not reopen it', (tester) async {
    final controller = NavigationHistoryController();
    await tester.pumpWidget(_harness(controller));

    await tester.tap(find.byKey(const ValueKey('home-info-button')));
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute(); // closes the dialog
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-info-dialog')), findsNothing);

    await tester.binding.handlePopRoute(); // root Back — nothing left to consume
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-info-dialog')), findsNothing);
    expect(_titleFor(AppScreen.home), findsOneWidget);
  });
}
