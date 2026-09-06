import '../../core/types/legacy_string_field.dart';

/// Live, authoritative Opening Balance fields (Section 11 of CLAUDE.md).
/// [amount] may validly be 0 — unset (this whole config being absent) and
/// zero are distinct, exactly like getProjectedBalanceOpeningConfig()'s
/// contract. [includedWithdrawalIds] being `null` vs `[]` is also
/// meaningful and must never be conflated: `null` = "never captured"
/// (blanket-conservative fallback), `[]` = "captured; zero withdrawals
/// existed on the opening date at save time".
class OpeningBalanceConfig {
  final num amount;
  final String dateStr;
  final List<int>? includedWithdrawalIds;

  const OpeningBalanceConfig({
    required this.amount,
    required this.dateStr,
    required this.includedWithdrawalIds,
  });
}

class NotificationPrefs {
  final bool upcomingPayment;
  final bool upcomingIncome;
  final bool completedObligation;

  const NotificationPrefs({
    this.upcomingPayment = true,
    this.upcomingIncome = true,
    this.completedObligation = true,
  });
}

/// Retired Balance Anchor / legacy currentBalance fields — read-only, inert
/// placeholders preserved ONLY so an existing stored settings blob is never
/// dropped or rewritten. No live calculation may read these; see CLAUDE.md
/// Section 11's "Superseded" note.
class LegacySettingsFields {
  final num? currentBalance;
  final num? anchorBalance;
  final String? anchorDate;

  const LegacySettingsFields({
    this.currentBalance,
    this.anchorBalance,
    this.anchorDate,
  });

  static const empty = LegacySettingsFields();
}

/// theme/primaryColor/fontSize are [LegacyStringField], not [String]:
/// loadAppSettings() (app.js) copies these through with NO type check on
/// read, so a legacy/corrupted non-string value must round-trip through an
/// unrelated settings save unchanged, not get silently coerced to a
/// default string. Use `.asStringOr(fallback)` for display/business logic;
/// never write `.asStringOr(...)` back to storage — always the field
/// itself (`.raw` via SettingsRepository), so an untouched value is never
/// destroyed.
class AppSettings {
  final LegacyStringField theme;
  final LegacyStringField primaryColor;
  final LegacyStringField fontSize;
  final String? pinHash;
  final bool pinEnabled;
  final int? autoLockMinutes;
  final OpeningBalanceConfig? openingBalance;
  final NotificationPrefs notifications;
  final Map<String, Object?> experimentalFlags;
  final String? creditCardSettlementUpdatedAt;
  final LegacySettingsFields legacy;

  /// Unknown/future top-level settings keys this data layer does not model
  /// at all — preserved verbatim and re-emitted on every save (see
  /// SettingsRepository.save()), same mechanism as FinanceItem.extras.
  final Map<String, Object?> extras;

  const AppSettings({
    required this.theme,
    required this.primaryColor,
    required this.fontSize,
    this.pinHash,
    required this.pinEnabled,
    this.autoLockMinutes,
    this.openingBalance,
    required this.notifications,
    required this.experimentalFlags,
    this.creditCardSettlementUpdatedAt,
    required this.legacy,
    this.extras = const {},
  });

  static AppSettings defaults() => const AppSettings(
        theme: LegacyStringField('system'),
        primaryColor: LegacyStringField('green'),
        fontSize: LegacyStringField('medium'),
        pinEnabled: false,
        openingBalance: null,
        notifications: NotificationPrefs(),
        experimentalFlags: {},
        legacy: LegacySettingsFields.empty,
      );
}
