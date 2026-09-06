import 'package:flutter/widgets.dart';

/// Milestone 8's post-restore refresh mechanism — the smallest thing that
/// makes "all five screens reflect restored data" deterministic.
///
/// Why this shape:
///   - The five screens each hold a `Future` created once in
///     `didChangeDependencies()` (`_future ??= ...`). After a restore
///     replaces every `family_finance_*` value beneath them, those futures
///     are stale and nothing in the existing architecture would ever
///     re-issue them.
///   - This is NOT global mutable state: exactly one [DataRevision] is
///     created and owned by `_AppBootstrapState` (and disposed with it),
///     handed down the widget tree by [DataRevisionScope] — the same
///     InheritedWidget pattern `AppServicesScope` already uses. There is no
///     singleton, no static field and no service locator.
///   - It does not touch navigation. [NavigationShell], the
///     [NavigationHistoryController] and the bottom nav are untouched; only
///     the screen widgets a bumped revision remounts are affected, and the
///     selected tab is preserved.
class DataRevision extends ChangeNotifier {
  int _revision = 0;

  /// Increments whenever the underlying stored data was REPLACED wholesale
  /// (currently: a successful backup restore). Ordinary per-screen edits do
  /// not use this.
  int get revision => _revision;

  void markDataReplaced() {
    _revision++;
    notifyListeners();
  }
}

/// Publishes the one [DataRevision] to the screens below it.
class DataRevisionScope extends InheritedNotifier<DataRevision> {
  const DataRevisionScope({
    super.key,
    required DataRevision revision,
    required super.child,
  }) : super(notifier: revision);

  /// Returns `null` where no scope is installed — several existing tests
  /// mount a screen without one, and a missing scope must mean "no
  /// wholesale-refresh signal available", never a crash.
  static DataRevision? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DataRevisionScope>()?.notifier;

  /// Non-subscribing lookup, for a caller that only needs to *bump* the
  /// revision and must not itself rebuild on every bump.
  static DataRevision? readOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DataRevisionScope>()?.notifier;
}

/// Remounts [child] whenever the data was replaced, so a screen that caches
/// a `Future` in `didChangeDependencies()` re-issues it against the restored
/// data. Without a [DataRevisionScope] above it this is a plain pass-through.
class RefreshOnDataRevision extends StatelessWidget {
  const RefreshOnDataRevision({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final revision = DataRevisionScope.maybeOf(context)?.revision ?? 0;
    return KeyedSubtree(key: ValueKey('data-revision-$revision'), child: child);
  }
}
