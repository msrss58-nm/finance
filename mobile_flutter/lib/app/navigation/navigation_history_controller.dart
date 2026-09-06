import 'package:flutter/foundation.dart';

import 'app_screen.dart';

/// Pure navigation state — deliberately separate from persistence/domain
/// state (Milestone 5, section 5) and from any widget. Holds an ordered,
/// **deduplicated** "most-recently-visited" stack of the five [AppScreen]
/// values: navigating to a screen already present anywhere in the history
/// removes its earlier occurrence and re-appends it at the end, rather than
/// pushing a second copy. Because there are only 5 possible distinct
/// screens, this makes the history INHERENTLY BOUNDED at a maximum of 5
/// entries no matter how many times the user bounces between tabs — there
/// is no unbounded route-stack growth to guard against separately.
///
/// Not persisted anywhere: a cold app start always begins with a
/// single-entry history at [AppScreen.home]. See NavigationShell's class
/// doc for why no restoration is implemented in this milestone.
class NavigationHistoryController extends ChangeNotifier {
  NavigationHistoryController({AppScreen initial = AppScreen.home})
      : _history = [initial];

  final List<AppScreen> _history;

  AppScreen get current => _history.last;

  /// Read-only snapshot, for tests/inspection only — callers must never
  /// mutate this list directly.
  List<AppScreen> get history => List.unmodifiable(_history);

  /// Navigates to [screen]. A no-op (no notification) if [screen] is
  /// already the current screen — this is what prevents a duplicate route
  /// push when the user taps the already-active bottom-nav destination.
  void navigateTo(AppScreen screen) {
    if (_history.last == screen) return;
    _history.remove(screen);
    _history.add(screen);
    notifyListeners();
  }

  /// Pops to the previous screen in history. Returns `true` if there WAS a
  /// previous screen to go back to (history shrank); returns `false` if
  /// already at the single root entry, in which case the caller (the
  /// shell's `PopScope`) must let normal Android root Back behavior
  /// proceed instead of consuming the event.
  bool pop() {
    if (_history.length <= 1) return false;
    _history.removeLast();
    notifyListeners();
    return true;
  }

  /// Whether [pop] would currently do anything — mirrors `PopScope.canPop`
  /// (which must be the NEGATION of this: canPop = !canGoBack).
  bool get canGoBack => _history.length > 1;
}
