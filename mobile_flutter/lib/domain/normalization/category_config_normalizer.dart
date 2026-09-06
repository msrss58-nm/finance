import '../../data/raw/raw_category_config.dart';
import '../models/category_config.dart';
import '../models/enums.dart';

/// Port of loadPreviewCategoryConfig(): a missing/corrupt/wrong-type stored
/// value falls back entirely to the 5 built-in defaults; otherwise, any
/// built-in default key entirely ABSENT from the stored config is backfilled
/// in-memory only (never overwrites an existing key of the same name, never
/// writes anything back here — the caller's next save persists the merge,
/// exactly as savePreviewCategoryConfig() does today).
Map<String, CategoryConfig> normalizeCategoryConfig(
  RawCategoryConfigJson? raw,
) {
  if (raw == null) {
    return Map<String, CategoryConfig>.from(kDefaultCategoryConfig);
  }

  final result = <String, CategoryConfig>{};
  for (final key in raw.keys) {
    final entry = raw.entryFor(key);
    if (entry == null) continue;
    final cfg = _normalizeOneCategory(key, entry);
    if (cfg != null) result[key] = cfg;
  }

  for (final entry in kDefaultCategoryConfig.entries) {
    result.putIfAbsent(entry.key, () => entry.value);
  }
  return result;
}

CategoryConfig? _normalizeOneCategory(String key, Map<String, Object?> entry) {
  final label = entry['label'];
  if (label is! String) return null;
  final baseType = _parseBaseType(entry['baseType']);
  if (baseType == null) return null;
  final rawDay = entry['defaultDayOfMonth'];
  int? defaultDayOfMonth;
  if (rawDay is num && rawDay.isFinite) {
    final d = rawDay.toInt();
    if (d >= 1 && d <= 31) defaultDayOfMonth = d;
  }
  return CategoryConfig(
    key: key,
    label: label,
    baseType: baseType,
    defaultDayOfMonth: defaultDayOfMonth,
  );
}

CategoryBaseType? _parseBaseType(Object? raw) {
  if (raw is! String) return null;
  for (final v in CategoryBaseType.values) {
    if (v.name == raw) return v;
  }
  return null;
}
