import 'package:flutter/material.dart';

import '../../core/types/result.dart';
import '../../domain/models/category_config.dart';
import '../services/app_services.dart';
import '../services/app_services_scope.dart';
import '../widgets/async_screen_body.dart';

/// Milestone 6 Categories screen — DISPLAY only of the current approved
/// category list (see the Web-reference spec gathered for this milestone).
/// Add/edit/delete category actions are explicitly out of scope here; this
/// screen only renders the existing categoryConfig + the user's custom tile
/// order, alongside a per-category count of active items.
///
/// "📋 כל התנועות" is rendered as a plain, inert row: in the Web app it is a
/// filter shortcut into a transactions list that does not exist yet in this
/// Flutter port, so it must not be wired to a fabricated destination here.
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  Future<_CategoriesData>? _future;

  // AppServicesScope.of(context) reads an InheritedWidget — that must happen
  // in didChangeDependencies()/build(), never in initState(), so the
  // dependency is correctly registered. The `??=` guard ensures the load
  // only starts once, even though didChangeDependencies() can run again
  // later (e.g. on a theme/locale change) without restarting it.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load(AppServicesScope.of(context));
  }

  /// categoryConfig.load()/categoryTileOrder.load() already have their OWN
  /// internal safe fallbacks for malformed DATA (never throw for that), but
  /// a genuine storage-layer failure (e.g. a closed/broken database) is not
  /// caught anywhere in this function on purpose — it must propagate so
  /// buildAsyncScreenBody can show the real error instead of a fabricated
  /// category list. Only items.loadAll() needs the explicit DataOk/DataErr
  /// unwrap below to surface its own failure the same way.
  static Future<_CategoriesData> _load(AppServices services) async {
    final categoryConfig = await services.categoryConfig.load();
    final tileOrder = await services.categoryTileOrder.load();

    final itemsOutcome = await services.items.loadAll();
    final items = switch (itemsOutcome) {
      DataOk(value: final v) => v.items,
      DataErr(error: final e) => throw e,
    };

    // Effective display order: respect the user's custom tile order first
    // (dropping any key that no longer exists in categoryConfig), then
    // append anything in categoryConfig not mentioned in tileOrder, in
    // categoryConfig's own map order — never silently drop a category just
    // because it's missing from tileOrder.
    final orderedKeys = <String>[
      for (final key in tileOrder)
        if (categoryConfig.containsKey(key)) key,
      for (final key in categoryConfig.keys)
        if (!tileOrder.contains(key)) key,
    ];

    final counts = <String, int>{};
    for (final item in items) {
      if (item.isArchived) continue;
      final key = item.displayCategory ?? item.type.name;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return _CategoriesData(
      categoryConfig: categoryConfig,
      orderedKeys: orderedKeys,
      counts: counts,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-categories'),
      appBar: AppBar(title: const Text('קטגוריות')),
      body: FutureBuilder<_CategoriesData>(
        future: _future,
        builder: (context, snapshot) => buildAsyncScreenBody<_CategoriesData>(
          snapshot,
          data: (d) => _CategoriesBody(data: d),
        ),
      ),
    );
  }
}

class _CategoriesData {
  final Map<String, CategoryConfig> categoryConfig;
  final List<String> orderedKeys;
  final Map<String, int> counts;

  const _CategoriesData({
    required this.categoryConfig,
    required this.orderedKeys,
    required this.counts,
  });
}

class _CategoriesBody extends StatelessWidget {
  const _CategoriesBody({required this.data});
  final _CategoriesData data;

  @override
  Widget build(BuildContext context) {
    return ListView(
      key: const ValueKey('categories-list'),
      padding: const EdgeInsets.all(16),
      children: [
        const Card(
          margin: EdgeInsets.symmetric(vertical: 4),
          child: ListTile(
            key: ValueKey('all-transactions-row'),
            title: Text('📋 כל התנועות'),
          ),
        ),
        const SizedBox(height: 8),
        if (data.orderedKeys.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              key: ValueKey('categories-empty-text'),
              child: Text('אין קטגוריות מוגדרות.'),
            ),
          )
        else
          for (final key in data.orderedKeys)
            _CategoryRow(
              key: ValueKey('category-row-$key'),
              config: data.categoryConfig[key]!,
              count: data.counts[key] ?? 0,
            ),
      ],
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({super.key, required this.config, required this.count});
  final CategoryConfig config;
  final int count;

  @override
  Widget build(BuildContext context) {
    final protected = isBuiltinProtectedCategoryKey(config.key);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: protected
            ? const Icon(Icons.lock_outline, key: ValueKey('protected-icon'))
            : null,
        title: Text(config.label),
        subtitle: Text(config.baseType.name),
        trailing: Text('$count תנועות'),
      ),
    );
  }
}
