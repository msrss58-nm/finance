import '../../core/types/legacy_string_field.dart';
import '../../data/raw/raw_settings.dart';
import '../models/app_settings.dart';
import 'legacy_resolvers.dart';

/// Port of loadAppSettings()'s merge-onto-defaults behavior, plus
/// getProjectedBalanceOpeningConfig()'s strict, all-or-nothing accessor
/// (baked in here rather than left as a raw pass-through, since it is the
/// ONLY place in the Web app allowed to interpret those 3 raw fields, and
/// this data layer keeps that same single-accessor discipline).
///
/// VERIFIED against app.js's loadAppSettings(): the generic per-key merge
/// loop copies theme/primaryColor/fontSize through with NO type check at
/// all — `if (parsed[k] !== undefined && parsed[k] !== null) merged[k] =
/// parsed[k];`. That means "absent or null" is the ONLY case that falls
/// back to the default; a present-but-wrong-typed value (e.g. a stray
/// number) is copied through as-is, exactly like every other value. This is
/// reproduced here via [LegacyStringField] — falls back to the default raw
/// value only when the stored value is null, never coerces or drops a
/// present-but-wrong-typed value.
AppSettings normalizeAppSettings(RawSettingsJson? raw) {
  final defaults = AppSettings.defaults();
  if (raw == null) return defaults;

  return AppSettings(
    theme: LegacyStringField(raw.theme ?? defaults.theme.raw),
    primaryColor: LegacyStringField(raw.primaryColor ?? defaults.primaryColor.raw),
    fontSize: LegacyStringField(raw.fontSize ?? defaults.fontSize.raw),
    pinHash: raw.pinHash,
    pinEnabled: raw.pinEnabled ?? defaults.pinEnabled,
    autoLockMinutes: _asIntOrNull(raw.autoLockMinutes),
    openingBalance: _normalizeOpeningBalance(raw),
    notifications: _normalizeNotifications(raw.notifications, defaults.notifications),
    experimentalFlags: raw.experimentalFlags ?? defaults.experimentalFlags,
    creditCardSettlementUpdatedAt: raw.creditCardSettlementUpdatedAt,
    legacy: LegacySettingsFields(
      currentBalance: raw.currentBalance is num ? raw.currentBalance as num : null,
      anchorBalance: raw.anchorBalance is num ? raw.anchorBalance as num : null,
      anchorDate: raw.anchorDate,
    ),
    extras: raw.extras,
  );
}

int? _asIntOrNull(Object? raw) {
  if (raw is int) return raw;
  if (raw is num) return raw.toInt();
  return null;
}

/// getProjectedBalanceOpeningConfig(): amount must already be a finite
/// number, date must be a genuinely valid calendar date string — anything
/// else means fully unconfigured (`null`), never partially applied.
OpeningBalanceConfig? _normalizeOpeningBalance(RawSettingsJson raw) {
  final amt = raw.projectedBalanceOpeningAmount;
  final dateStr = raw.projectedBalanceOpeningDate;
  if (amt is! num || !amt.isFinite) return null;
  if (!isValidDateStr(dateStr)) return null;

  final rawIncluded = raw.projectedBalanceOpeningIncludedWithdrawalIds;
  List<int>? includedWithdrawalIds;
  if (rawIncluded is List) {
    includedWithdrawalIds = rawIncluded
        .whereType<num>()
        .where((n) => n.isFinite)
        .map((n) => n.toInt())
        .toList();
  }
  return OpeningBalanceConfig(
    amount: round2(amt),
    dateStr: dateStr!,
    includedWithdrawalIds: includedWithdrawalIds,
  );
}

NotificationPrefs _normalizeNotifications(
  Map<String, Object?>? raw,
  NotificationPrefs defaults,
) {
  if (raw == null) return defaults;
  return NotificationPrefs(
    upcomingPayment: raw.containsKey('upcomingPayment')
        ? raw['upcomingPayment'] == true
        : defaults.upcomingPayment,
    upcomingIncome: raw.containsKey('upcomingIncome')
        ? raw['upcomingIncome'] == true
        : defaults.upcomingIncome,
    completedObligation: raw.containsKey('completedObligation')
        ? raw['completedObligation'] == true
        : defaults.completedObligation,
  );
}
