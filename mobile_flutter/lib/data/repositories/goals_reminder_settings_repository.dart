import 'dart:convert';

import '../persistence/key_value_store.dart';

/// Storage key for the Goals-reminder preference.
///
/// **Deliberately OUTSIDE the `family_finance_` namespace.** Everything under
/// that prefix is swept into a backup export and written back by a restore
/// (`BackupRepositoryImpl`), and Milestone 9's contract is that notification
/// scheduling state must NOT become part of the financial backup schema. It
/// is not one either: whether this device may post OS notifications is
/// device-local, tied to a permission the OS grants per install, and would be
/// actively wrong to carry to another device inside a financial backup.
///
/// The same reasoning already applies to `ff_pin_v1`. Neither key is
/// exported, neither is restored, and the backup schema and its
/// `schemaVersion` are untouched by this milestone.
const String kGoalsReminderSettingsKey = 'ff_goals_reminder_v1';

/// The user's Goals-reminder preference.
class GoalsReminderSettings {
  const GoalsReminderSettings({
    this.enabled = false,
    this.permissionRequested = false,
  });

  /// Opt-in, not opt-out. The app never asks for notification permission on
  /// first launch; the reminder starts off and the user turns it on from
  /// Settings, which is the moment permission is requested.
  final bool enabled;

  /// Whether the OS permission prompt has already been shown once.
  ///
  /// Android shows the system dialog only once per install; asking again just
  /// returns the previous answer without any UI. This flag lets the UI stop
  /// pretending a second prompt will happen and offer the system settings
  /// screen instead.
  final bool permissionRequested;

  static const GoalsReminderSettings defaults = GoalsReminderSettings();

  GoalsReminderSettings copyWith({bool? enabled, bool? permissionRequested}) =>
      GoalsReminderSettings(
        enabled: enabled ?? this.enabled,
        permissionRequested: permissionRequested ?? this.permissionRequested,
      );
}

abstract interface class GoalsReminderSettingsRepository {
  Future<GoalsReminderSettings> load();
  Future<void> save(GoalsReminderSettings settings);
}

class GoalsReminderSettingsRepositoryImpl
    implements GoalsReminderSettingsRepository {
  const GoalsReminderSettingsRepositoryImpl(this._store);

  final KeyValueStore _store;

  @override
  Future<GoalsReminderSettings> load() async {
    final raw = await _store.getString(kGoalsReminderSettingsKey);
    if (raw == null) return GoalsReminderSettings.defaults;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return GoalsReminderSettings.defaults;
      return GoalsReminderSettings(
        enabled: decoded['enabled'] == true,
        permissionRequested: decoded['permissionRequested'] == true,
      );
    } catch (_) {
      // A corrupt preference blob must fall back to "off" — never to a state
      // that silently starts posting notifications.
      return GoalsReminderSettings.defaults;
    }
  }

  @override
  Future<void> save(GoalsReminderSettings settings) => _store.setString(
        kGoalsReminderSettingsKey,
        jsonEncode({
          'enabled': settings.enabled,
          'permissionRequested': settings.permissionRequested,
        }),
      );
}
