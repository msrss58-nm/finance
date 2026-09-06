import 'dart:convert';

import '../../domain/models/app_settings.dart';
import '../../domain/normalization/settings_normalizer.dart';
import '../persistence/key_value_store.dart';
import '../raw/raw_settings.dart';

const String kSettingsKey = 'family_finance_settings';

abstract interface class SettingsRepository {
  Future<AppSettings> load();
  Future<void> save(AppSettings settings);
}

class SettingsRepositoryImpl implements SettingsRepository {
  final KeyValueStore _store;
  const SettingsRepositoryImpl(this._store);

  @override
  Future<AppSettings> load() async {
    final raw = await _store.getString(kSettingsKey);
    if (raw == null) return normalizeAppSettings(null);
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return normalizeAppSettings(null);
      return normalizeAppSettings(RawSettingsJson.fromJson(decoded));
    } catch (_) {
      return normalizeAppSettings(null);
    }
  }

  /// Starts from [AppSettings.extras] (unknown top-level keys) and
  /// theme/primaryColor/fontSize's preserved `.raw` value — NEVER the
  /// resolved `.asStringOr(...)` display value — then overlays every other
  /// known field. This is why an unrelated save (e.g. toggling pinEnabled)
  /// cannot destroy an unknown key or a legacy non-string theme/
  /// primaryColor/fontSize value: nothing about this method's structure can
  /// silently omit them, they're the base the known fields are layered on.
  @override
  Future<void> save(AppSettings settings) async {
    final map = <String, Object?>{
      ...settings.extras,
      'theme': settings.theme.raw,
      'primaryColor': settings.primaryColor.raw,
      'fontSize': settings.fontSize.raw,
      'pinHash': settings.pinHash,
      'pinEnabled': settings.pinEnabled,
      'autoLockMinutes': settings.autoLockMinutes,
      // Legacy/retired fields — carried through unchanged, never
      // recomputed, per CLAUDE.md Section 11.
      'currentBalance': settings.legacy.currentBalance,
      'anchorBalance': settings.legacy.anchorBalance,
      'anchorDate': settings.legacy.anchorDate,
      'projectedBalanceOpeningAmount': settings.openingBalance?.amount,
      'projectedBalanceOpeningDate': settings.openingBalance?.dateStr,
      'projectedBalanceOpeningIncludedWithdrawalIds':
          settings.openingBalance?.includedWithdrawalIds,
      'notifications': {
        'upcomingPayment': settings.notifications.upcomingPayment,
        'upcomingIncome': settings.notifications.upcomingIncome,
        'completedObligation': settings.notifications.completedObligation,
      },
      'experimentalFlags': settings.experimentalFlags,
      'creditCardSettlementUpdatedAt': settings.creditCardSettlementUpdatedAt,
    };
    await _store.setString(kSettingsKey, jsonEncode(map));
  }
}
