/// Wraps a legacy field (`day` / `total` / `interest`) that the Web app has
/// always stored defensively-parsed at every read site, because historical
/// records may hold a string, a number, or may be entirely absent — never
/// throwing, never silently rewriting the original stored value.
///
/// [raw] preserves exactly what was read from storage; [asInt]/[asNum] give
/// the permissive, lazily-computed interpretation the Web app itself would
/// use (`parseInt`/`parseFloat` semantics), returning `null` rather than
/// `NaN` when unparseable.
class LegacyNumericField {
  final Object? raw;
  const LegacyNumericField(this.raw);

  static const LegacyNumericField absent = LegacyNumericField(null);

  int? asInt() {
    if (raw == null) return null;
    if (raw is int) return raw as int;
    if (raw is double) return (raw as double).truncate();
    if (raw is String) {
      final s = raw as String;
      final match = RegExp(r'^\s*[-+]?\d+').firstMatch(s);
      if (match == null) return null;
      return int.tryParse(match.group(0)!.trim());
    }
    return null;
  }

  num? asNum() {
    if (raw == null) return null;
    if (raw is num) return raw as num;
    if (raw is String) {
      final s = raw as String;
      final match = RegExp(r'^\s*[-+]?(\d+\.?\d*|\.\d+)').firstMatch(s);
      if (match == null) return null;
      return num.tryParse(match.group(0)!.trim());
    }
    return null;
  }

  Object? toJson() => raw;

  @override
  bool operator ==(Object other) =>
      other is LegacyNumericField && other.raw == raw;

  @override
  int get hashCode => raw.hashCode;

  @override
  String toString() => 'LegacyNumericField($raw)';
}
