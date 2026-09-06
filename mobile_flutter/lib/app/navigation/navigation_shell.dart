import 'package:flutter/material.dart';

import '../screens/categories_screen.dart';
import '../screens/forecast_screen.dart';
import '../screens/goals_screen.dart';
import '../screens/home_screen.dart';
import '../screens/settings_screen.dart';
import '../../notifications/notification_gateway.dart';
import '../services/data_revision.dart';
import '../services/notification_scope.dart';
import 'app_screen.dart';
import 'navigation_history_controller.dart';

/// Maps each [AppScreen] to its real Milestone 6 screen widget. The ONLY
/// production screen-selection logic lives here — [NavigationShell] itself
/// stays agnostic to which widget backs a given screen.
///
/// Milestone 8 wraps the four read-only screens in [RefreshOnDataRevision]
/// so a completed backup restore re-issues their cached loads. Settings is
/// deliberately NOT wrapped: it hosts the import flow itself and refreshes
/// its own data in place, so remounting it would destroy the very result
/// message the user just produced. Navigation itself is untouched — this is
/// still a plain widget-for-screen mapping.
Widget defaultScreenBuilder(AppScreen screen) => switch (screen) {
      AppScreen.home => const RefreshOnDataRevision(child: HomeScreen()),
      AppScreen.forecast => const RefreshOnDataRevision(child: ForecastScreen()),
      AppScreen.goals => const RefreshOnDataRevision(child: GoalsScreen()),
      AppScreen.categories =>
        const RefreshOnDataRevision(child: CategoriesScreen()),
      AppScreen.settings => const SettingsScreen(),
    };

/// The native navigation shell (Milestone 5) — the single source of truth
/// for which of the 5 primary screens is visible and for in-app Back
/// semantics between them.
///
/// Architecture, deliberately NOT a second/parallel navigator:
/// - All 5 screens are mounted simultaneously in an [IndexedStack] (state
///   preserved across tab switches) and selection is driven entirely by
///   [NavigationHistoryController] — no [Navigator.push] is used for
///   switching between the 5 tabs, so there is no separate route stack to
///   keep in sync with the bottom nav.
/// - Everything still lives on the ONE real [Navigator] that
///   [MaterialApp] provides (this widget IS `MaterialApp.home`). A dialog/
///   bottom sheet/anything shown via the standard `showDialog`/
///   `showModalBottomSheet` APIs pushes a route onto that SAME navigator,
///   above this widget's route — so Android Back closes it first, using
///   Flutter's own built-in route-popping behavior, before this widget's
///   [PopScope] is ever consulted. No Web-style history reimplementation.
/// - [PopScope.canPop] is `true` exactly when [NavigationHistoryController]
///   has nothing left to go back to (we're at the single root entry) — at
///   that point Android's normal root behavior (exit/backgrounds the app)
///   proceeds untouched, matching section 3.C.
///
/// Restoration: NOT implemented in this milestone. Every cold start begins
/// with history at [AppScreen.home] (see [NavigationHistoryController]'s
/// default). This is a deliberate, documented choice, not an oversight:
/// there is no persisted UI state of any real value yet (every screen is a
/// placeholder), and section 5 explicitly warns against persisting
/// navigation history into the database. Real restoration (e.g. via
/// Flutter's `RestorationMixin`) can be added in Milestone 6 if a product
/// decision calls for resuming the last-viewed tab after OS process death.
class NavigationShell extends StatefulWidget {
  const NavigationShell({super.key, this.controller, this.screenBuilder = defaultScreenBuilder});

  /// Injectable for tests; production code omits this and gets a fresh
  /// [NavigationHistoryController] owned (and disposed) by this widget.
  final NavigationHistoryController? controller;

  /// Injectable for tests that want to exercise pure navigation mechanics
  /// (bottom-nav taps, Back semantics, transient-UI priority) without
  /// needing a real [AppServicesScope]/database — production code omits
  /// this and gets the real 5 screens via [defaultScreenBuilder].
  final Widget Function(AppScreen screen) screenBuilder;

  @override
  State<NavigationShell> createState() => _NavigationShellState();
}

class _NavigationShellState extends State<NavigationShell> {
  late final NavigationHistoryController _controller;
  late final bool _ownsController;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _controller = widget.controller ?? NavigationHistoryController();
    _controller.addListener(_onHistoryChanged);
  }

  void _onHistoryChanged() => setState(() {});

  /// Milestone 9: consumes a notification tap that was waiting for the app to
  /// become viewable.
  ///
  /// This runs only from [didChangeDependencies], i.e. only once this widget
  /// is actually being built — and `AuthGate` does not build its child while
  /// the app is locked. A tap therefore cannot move the app anywhere until
  /// after a successful unlock, and it uses the SAME
  /// [NavigationHistoryController.navigateTo] a bottom-nav tap uses, so no
  /// extra route and no duplicate history entry is created. The payload is
  /// taken (not peeked), so one tap can navigate at most once.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final pending = PendingNotificationRouteScope.maybeOf(context);
    if (pending == null || !pending.hasPending) return;
    final payload = pending.take();
    if (payload != kGoalsReminderPayload) return;
    // Deferred to the end of the frame: navigateTo() notifies listeners,
    // and calling setState during a dependency change is not allowed.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _controller.navigateTo(AppScreen.goals);
    });
  }

  @override
  void dispose() {
    _controller.removeListener(_onHistoryChanged);
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final current = _controller.current;
    final currentIndex = AppScreen.values.indexOf(current);

    return PopScope(
      canPop: !_controller.canGoBack,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _controller.pop();
      },
      child: Scaffold(
        body: IndexedStack(
          index: currentIndex,
          children: [
            for (final screen in AppScreen.values)
              KeyedSubtree(
                key: ValueKey('screen-${screen.name}'),
                child: widget.screenBuilder(screen),
              ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          key: const ValueKey('shell-bottom-nav'),
          selectedIndex: currentIndex,
          onDestinationSelected: (index) => _controller.navigateTo(AppScreen.values[index]),
          destinations: [
            for (final screen in AppScreen.values)
              NavigationDestination(
                key: ValueKey('nav-destination-${screen.name}'),
                icon: Icon(_iconFor(screen)),
                label: screen.label,
              ),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(AppScreen screen) => switch (screen) {
        AppScreen.home => Icons.home_outlined,
        AppScreen.forecast => Icons.show_chart,
        AppScreen.goals => Icons.flag_outlined,
        AppScreen.categories => Icons.category_outlined,
        AppScreen.settings => Icons.settings_outlined,
      };
}
