import 'dart:convert';

import '../../domain/models/category_config.dart';
import '../../domain/normalization/category_config_normalizer.dart';
import '../persistence/key_value_store.dart';
import '../raw/raw_category_config.dart';

const String kCategoryConfigKey = 'family_finance_cat_config';

abstract interface class CategoryConfigRepository {
  Future<Map<String, CategoryConfig>> load();
  Future<void> saveAll(Map<String, CategoryConfig> config);
}

class CategoryConfigRepositoryImpl implements CategoryConfigRepository {
  final KeyValueStore _store;
  const CategoryConfigRepositoryImpl(this._store);

  @override
  Future<Map<String, CategoryConfig>> load() async {
    final raw = await _store.getString(kCategoryConfigKey);
    if (raw == null) return normalizeCategoryConfig(null);
    try {
      final decoded = jsonDecode(raw);
      return normalizeCategoryConfig(RawCategoryConfigJson.fromJson(decoded));
    } catch (_) {
      return normalizeCategoryConfig(null);
    }
  }

  @override
  Future<void> saveAll(Map<String, CategoryConfig> config) async {
    final map = {
      for (final c in config.values)
        c.key: {
          'label': c.label,
          'baseType': c.baseType.name,
          if (c.defaultDayOfMonth != null)
            'defaultDayOfMonth': c.defaultDayOfMonth,
        },
    };
    await _store.setString(kCategoryConfigKey, jsonEncode(map));
  }
}
