import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/navigation/app_screen.dart';
import 'package:familyfinance_pro/app/navigation/navigation_history_controller.dart';

void main() {
  group('NavigationHistoryController', () {
    test('initial state is a single-entry history at home', () {
      final c = NavigationHistoryController();
      expect(c.current, AppScreen.home);
      expect(c.history, [AppScreen.home]);
      expect(c.canGoBack, isFalse);
    });

    test('navigateTo appends and notifies', () {
      final c = NavigationHistoryController();
      var notified = 0;
      c.addListener(() => notified++);
      c.navigateTo(AppScreen.forecast);
      expect(c.current, AppScreen.forecast);
      expect(c.history, [AppScreen.home, AppScreen.forecast]);
      expect(notified, 1);
    });

    test('navigating to the already-current screen is a no-op (no duplicate push)', () {
      final c = NavigationHistoryController();
      var notified = 0;
      c.addListener(() => notified++);
      c.navigateTo(AppScreen.home); // already current
      expect(c.history, [AppScreen.home]);
      expect(notified, 0);
    });

    test('re-visiting an earlier screen collapses the duplicate (bounded history, no loops)', () {
      final c = NavigationHistoryController();
      c.navigateTo(AppScreen.forecast);
      c.navigateTo(AppScreen.goals);
      c.navigateTo(AppScreen.forecast); // revisit — must not create a second entry
      expect(c.history, [AppScreen.home, AppScreen.goals, AppScreen.forecast]);
    });

    test('history never exceeds the number of distinct screens, however much bouncing occurs', () {
      final c = NavigationHistoryController();
      final sequence = [
        AppScreen.forecast, AppScreen.goals, AppScreen.forecast, AppScreen.goals,
        AppScreen.categories, AppScreen.forecast, AppScreen.settings, AppScreen.goals,
        AppScreen.forecast, AppScreen.categories, AppScreen.settings,
      ];
      for (final s in sequence) {
        c.navigateTo(s);
      }
      expect(c.history.length, lessThanOrEqualTo(AppScreen.values.length));
      expect(c.history.toSet().length, c.history.length); // no duplicates ever
    });

    test('pop returns to the actual previous screen and reports true while history remains', () {
      final c = NavigationHistoryController();
      c.navigateTo(AppScreen.forecast);
      c.navigateTo(AppScreen.goals);
      expect(c.pop(), isTrue);
      expect(c.current, AppScreen.forecast);
      expect(c.pop(), isTrue);
      expect(c.current, AppScreen.home);
    });

    test('pop at the root returns false and leaves history untouched (root Back is not consumed)', () {
      final c = NavigationHistoryController();
      expect(c.pop(), isFalse);
      expect(c.history, [AppScreen.home]);
    });

    test('repeated pop never loops or reopens an already-consumed entry', () {
      final c = NavigationHistoryController();
      c.navigateTo(AppScreen.forecast);
      c.navigateTo(AppScreen.goals);
      c.navigateTo(AppScreen.categories);
      final visited = <AppScreen>[c.current];
      while (c.pop()) {
        visited.add(c.current);
      }
      expect(visited, [AppScreen.categories, AppScreen.goals, AppScreen.forecast, AppScreen.home]);
      // One more pop attempt must still safely report false, not throw or loop.
      expect(c.pop(), isFalse);
      expect(c.current, AppScreen.home);
    });
  });
}
