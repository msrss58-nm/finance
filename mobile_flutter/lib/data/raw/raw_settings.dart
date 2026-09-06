import '../../core/types/safe_cast.dart';

/// Raw view of `family_finance_settings`. Every accessor is a defensive,
/// never-throwing read — a missing/wrong-typed field simply returns null,
/// mirroring loadAppSettings()'s "merge onto defaults, never trust a bad
/// field" behavior (the merge itself happens in SettingsNormalizer).
///
/// theme/primaryColor/fontSize are deliberately exposed as raw [Object?],
/// NOT pre-cast to String: loadAppSettings()'s own merge loop copies these
/// through with NO type check at all (VERIFIED against app.js), so a
/// legacy/corrupted non-string value is something SettingsNormalizer must
/// be able to preserve losslessly via LegacyStringField, not something this
/// raw layer should coerce away before the normalizer ever sees it.
class RawSettingsJson {
  final Map<String, Object?> raw;
  const RawSettingsJson(this.raw);

  factory RawSettingsJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('settings is not a JSON object: $json');
    }
    return RawSettingsJson(Map<String, Object?>.from(json));
  }

  Object? get theme => raw['theme'];
  Object? get primaryColor => raw['primaryColor'];
  Object? get fontSize => raw['fontSize'];
  String? get pinHash => asStringOrNull(raw['pinHash']);
  bool? get pinEnabled =>
      raw.containsKey('pinEnabled') ? raw['pinEnabled'] == true : null;
  Object? get autoLockMinutes => raw['autoLockMinutes'];

  // Legacy, retired — read-only pass-through, never used in calculation.
  Object? get currentBalance => raw['currentBalance'];
  Object? get anchorBalance => raw['anchorBalance'];
  String? get anchorDate => asStringOrNull(raw['anchorDate']);

  // Live Opening Balance contract (CLAUDE.md Section 11).
  Object? get projectedBalanceOpeningAmount =>
      raw['projectedBalanceOpeningAmount'];
  String? get projectedBalanceOpeningDate =>
      asStringOrNull(raw['projectedBalanceOpeningDate']);
  Object? get projectedBalanceOpeningIncludedWithdrawalIds =>
      raw['projectedBalanceOpeningIncludedWithdrawalIds'];

  Map<String, Object?>? get notifications => raw['notifications'] is Map
      ? Map<String, Object?>.from(raw['notifications'] as Map)
      : null;
  Map<String, Object?>? get experimentalFlags => raw['experimentalFlags'] is Map
      ? Map<String, Object?>.from(raw['experimentalFlags'] as Map)
      : null;
  String? get creditCardSettlementUpdatedAt =>
      asStringOrNull(raw['creditCardSettlementUpdatedAt']);

  /// The keys this class knows how to interpret. Anything else in [raw] is
  /// an unknown/future top-level settings field that must survive a save
  /// untouched — see SettingsNormalizer's `extras` handling.
  static const Set<String> recognizedKeys = {
    'theme', 'primaryColor', 'fontSize', 'pinHash', 'pinEnabled',
    'autoLockMinutes', 'currentBalance', 'anchorBalance', 'anchorDate',
    'projectedBalanceOpeningAmount', 'projectedBalanceOpeningDate',
    'projectedBalanceOpeningIncludedWithdrawalIds', 'notifications',
    'experimentalFlags', 'creditCardSettlementUpdatedAt',
  };

  Map<String, Object?> get extras => {
        for (final entry in raw.entries)
          if (!recognizedKeys.contains(entry.key)) entry.key: entry.value,
      };

  Map<String, Object?> toJson() => raw;
}
