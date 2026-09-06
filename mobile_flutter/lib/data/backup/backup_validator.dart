import 'dart:convert';

import '../../domain/normalization/goal_normalizer.dart';
import '../../domain/normalization/legacy_resolvers.dart';
import '../raw/raw_backup_envelope.dart';
import '../repositories/activity_log_repository.dart';
import '../repositories/category_config_repository.dart';
import '../repositories/goals_repository.dart';
import '../repositories/items_repository.dart';
import '../repositories/loan_balance_view_repository.dart';
import '../repositories/settings_repository.dart';
import '../persistence/key_value_store.dart';

/// Port of isValidItemsArrayForRestore(): only cashWithdrawal items are
/// deeply validated (id collision protection was added specifically because
/// several UI paths identify a cash withdrawal strictly by id) — an
/// ordinary item of any other type merely needs to be a non-array object.
/// A collision between two ordinary (non-cashWithdrawal) items sharing a
/// numeric id is NOT rejected here, matching the Web app's own narrow scope
/// for this check.
bool isValidItemsArrayForRestore(Object? itemsArr) {
  if (itemsArr is! List) return false;

  final idCounts = <num, int>{};
  for (final raw in itemsArr) {
    if (raw is! Map) return false;
    final id = raw['id'];
    if (id is num && id.isFinite) {
      idCounts[id] = (idCounts[id] ?? 0) + 1;
    }
  }

  for (final raw in itemsArr) {
    final item = raw as Map;
    if (item['type'] != 'cashWithdrawal') continue;
    final id = item['id'];
    // VERIFIED app.js:7251 — `typeof id !== 'number' || !Number.isSafeInteger(id)
    // || id <= 0`. Validation-only: an accepted integral double (e.g. the raw
    // JSON token `5.0`) is judged valid here but is never rewritten — the
    // original raw value flows through to the write loop untouched.
    if (!jsIsSafeInteger(id) || (id as num) <= 0) return false;
    if ((idCounts[id] ?? 0) > 1) return false;
    final amount = item['amount'];
    if (amount is! num || !amount.isFinite || amount <= 0) return false;
    if (!isValidDateStr(item['start'])) return false;
    final title = item['title'];
    if (title is! String || title.isEmpty) return false;
    if (item.containsKey('notes') && item['notes'] is! String) return false;
    if (item['isArchived'] is! bool) return false;
  }
  return true;
}

/// Port of isValidBackupShape(): validates the envelope shape AND every
/// declared key's value BEFORE anything is trusted — a corrupt/malformed
/// backup must never reach the write loop. Returns a human-readable reason
/// on failure so callers can surface *why* validation failed (the Web app
/// itself only shows a generic message, but this data layer's ParseError/
/// InvalidBackupShape types can carry more).
class BackupValidationResult {
  final bool isValid;
  final String? reason;
  const BackupValidationResult._(this.isValid, this.reason);
  const BackupValidationResult.valid() : this._(true, null);
  const BackupValidationResult.invalid(String reason) : this._(false, reason);
}

BackupValidationResult validateBackupShape(RawBackupEnvelope envelope) {
  if (envelope.data.isEmpty) {
    return const BackupValidationResult.invalid('backup.data has no keys');
  }

  for (final entry in envelope.data.entries) {
    final key = entry.key;
    final value = entry.value;
    if (!key.startsWith(kFamilyFinanceKeyPrefix)) {
      return BackupValidationResult.invalid('unexpected key: $key');
    }
    if (key == kLoanBalanceViewKey) {
      Object? lbv;
      try {
        lbv = jsonDecode(value);
      } catch (_) {
        lbv = value;
      }
      if (lbv != 'total' && lbv != 'principal') {
        return BackupValidationResult.invalid(
          '$kLoanBalanceViewKey must be "total" or "principal"',
        );
      }
      continue;
    }
    try {
      jsonDecode(value);
    } catch (e) {
      return BackupValidationResult.invalid('$key is not valid JSON: $e');
    }
  }

  try {
    final dataValue = envelope.data[kDataKey];
    if (dataValue != null && !isValidItemsArrayForRestore(jsonDecode(dataValue))) {
      return const BackupValidationResult.invalid(
        '$kDataKey failed item-array validation',
      );
    }
    final cfgValue = envelope.data[kCategoryConfigKey];
    if (cfgValue != null) {
      final cfg = jsonDecode(cfgValue);
      if (cfg is! Map) {
        return BackupValidationResult.invalid('$kCategoryConfigKey is not an object');
      }
    }
    final settingsValue = envelope.data[kSettingsKey];
    if (settingsValue != null) {
      final st = jsonDecode(settingsValue);
      if (st is! Map) {
        return BackupValidationResult.invalid('$kSettingsKey is not an object');
      }
    }
    final logValue = envelope.data[kActivityLogKey];
    if (logValue != null && jsonDecode(logValue) is! List) {
      return BackupValidationResult.invalid('$kActivityLogKey is not an array');
    }

    if (envelope.isGoalsAwareVersion) {
      final goalsValue = envelope.data[kGoalsKey];
      if (goalsValue == null) {
        return const BackupValidationResult.invalid(
          'schemaVersion >= 2 but $kGoalsKey is missing',
        );
      }
      final goalsArr = jsonDecode(goalsValue);
      if (normalizeGoalsArrayStrict(goalsArr) == null) {
        return const BackupValidationResult.invalid(
          '$kGoalsKey failed strict goals validation',
        );
      }
    }
  } catch (e) {
    return BackupValidationResult.invalid('validation error: $e');
  }

  return const BackupValidationResult.valid();
}
