import '../../core/types/safe_cast.dart';

/// Raw, loosely-typed view of one entry from `family_finance_data`.
///
/// The Web app never stores a discriminated union on disk — every item type
/// is the same flat JS object literal with optional fields, differentiated
/// only by `type` at read time. One [RawItemJson] class (rather than 6
/// separate raw shapes) is therefore the faithful representation of what is
/// actually in storage; [ItemNormalizer] (domain/normalization/
/// item_normalizer.dart) is what maps a given `type` value to the correct
/// typed [FinanceItem] subtype, reading only the fields that type actually
/// uses.
///
/// No field access here ever throws: every accessor is a permissive,
/// defensive read straight off the underlying `Map`, exactly mirroring the
/// Web app's own `item.foo` property access (which returns `undefined`,
/// never throws, for any absent/mistyped field).
class RawItemJson {
  final Map<String, Object?> raw;
  const RawItemJson(this.raw);

  factory RawItemJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('item entry is not a JSON object: $json');
    }
    return RawItemJson(Map<String, Object?>.from(json));
  }

  Object? operator [](String key) => raw[key];

  Object? get id => raw['id'];
  String? get type => asStringOrNull(raw['type']);
  bool get isArchived => raw['isArchived'] == true;
  String? get archiveReason => asStringOrNull(raw['archiveReason']);
  String? get archivedAt => asStringOrNull(raw['archivedAt']);
  String? get displayCategory => asStringOrNull(raw['displayCategory']);
  String? get title => asStringOrNull(raw['title']);

  Object? get amount => raw['amount'];
  Object? get originalAmount => raw['originalAmount'];
  Object? get day => raw['day'];
  Object? get total => raw['total'];
  Object? get interest => raw['interest'];
  Object? get start => raw['start'];
  String? get where => asStringOrNull(raw['where']);
  String? get cardLast4 => asStringOrNull(raw['cardLast4']);
  String? get notes => asStringOrNull(raw['notes']);
  String? get period => asStringOrNull(raw['period']);
  bool? get bimonthly =>
      raw.containsKey('bimonthly') ? raw['bimonthly'] == true : null;
  Object? get bimonthlyStartMonth => raw['bimonthlyStartMonth'];

  Map<String, Object?> toJson() => raw;
}
