import 'dart:convert';

import '../persistence/key_value_store.dart';

const String kCategoryTileOrderKey = 'family_finance_category_tile_order';

abstract interface class CategoryTileOrderRepository {
  Future<List<String>> load();
  Future<void> save(List<String> order);
}

class CategoryTileOrderRepositoryImpl implements CategoryTileOrderRepository {
  final KeyValueStore _store;
  const CategoryTileOrderRepositoryImpl(this._store);

  @override
  Future<List<String>> load() async {
    final raw = await _store.getString(kCategoryTileOrderKey);
    if (raw == null) return [];
    try {
      final decoded = jsonDecode(raw);
      return decoded is List ? decoded.whereType<String>().toList() : [];
    } catch (_) {
      return [];
    }
  }

  @override
  Future<void> save(List<String> order) async {
    await _store.setString(kCategoryTileOrderKey, jsonEncode(order));
  }
}
