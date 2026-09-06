/// Mirrors [LegacyNumericField]'s philosophy for a settings field the Web
/// app has NEVER type-checked on read: loadAppSettings()'s merge loop
/// copies theme/primaryColor/fontSize straight from parsed JSON with no
/// `typeof` check at all (VERIFIED against app.js) — a legacy/corrupted
/// non-string value would silently propagate through the live app exactly
/// as-is, forever, until a user explicitly changes that setting.
///
/// [raw] preserves exactly what was stored, of whatever type. [asStringOr]
/// gives the safe, resolved value for display/business logic (falling back
/// when [raw] isn't actually a string); saving must always write back
/// [raw] unless the field was deliberately replaced with a new
/// [LegacyStringField] holding an explicit string — never the resolved
/// display value — so an untouched malformed legacy value is never
/// silently destroyed by an unrelated settings save.
class LegacyStringField {
  final Object? raw;
  const LegacyStringField(this.raw);

  String asStringOr(String fallback) => raw is String ? raw as String : fallback;

  Object? toJson() => raw;

  @override
  bool operator ==(Object other) =>
      other is LegacyStringField && other.raw == raw;

  @override
  int get hashCode => raw.hashCode;

  @override
  String toString() => 'LegacyStringField($raw)';
}
