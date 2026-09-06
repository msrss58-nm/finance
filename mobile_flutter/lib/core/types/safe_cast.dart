/// `value as String?` throws when [value] is present but of some OTHER
/// type (e.g. a stray number where a legacy record's field is normally a
/// string) — the exact opposite of the "never throws, permissive read"
/// contract every raw/normalization file in this data layer documents.
/// Use these instead of a direct `as` cast anywhere a value originates from
/// historical/legacy JSON.
String? asStringOrNull(Object? value) => value is String ? value : null;

bool? asBoolOrNull(Object? value) => value is bool ? value : null;
