/// Raw view of `family_finance_cat_config` — a plain object keyed by
/// category key, each value `{label, baseType, defaultDayOfMonth?}`.
class RawCategoryConfigJson {
  final Map<String, Object?> raw;
  const RawCategoryConfigJson(this.raw);

  factory RawCategoryConfigJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('category config is not a JSON object: $json');
    }
    return RawCategoryConfigJson(Map<String, Object?>.from(json));
  }

  Iterable<String> get keys => raw.keys;

  Map<String, Object?>? entryFor(String key) =>
      raw[key] is Map ? Map<String, Object?>.from(raw[key] as Map) : null;

  Map<String, Object?> toJson() => raw;
}
