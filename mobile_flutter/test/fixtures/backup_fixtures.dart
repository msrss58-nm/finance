import 'dart:convert';

import 'package:familyfinance_pro/data/repositories/activity_log_repository.dart';
import 'package:familyfinance_pro/data/repositories/category_config_repository.dart';
import 'package:familyfinance_pro/data/repositories/category_tile_order_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/loan_balance_view_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';

/// Deterministic backup-envelope fixtures for Milestone 3 (Backup/Restore
/// Compatibility) tests.
///
/// Every function here returns a JSON-ENCODABLE top-level `Map<String,
/// Object?>` shaped exactly like `{schemaVersion?, exportedAt?, data: {...}}`
/// — i.e. exactly what `jsonEncode(...)` -> `RawBackupEnvelope.fromJsonString`
/// expects as input. Per the real backup contract, every value inside `data`
/// is itself an ALREADY-JSON-ENCODED STRING (never a raw object/array) except
/// for the legacy loan-balance-view fixture, which deliberately stores a raw
/// (non-JSON) string to exercise that dual-format compatibility rule.
///
/// Goal-related dates/timestamps below are hand-verified against
/// `isValidDateStr`/`isValidCanonicalIsoTimestamp` (real calendar dates,
/// canonical `toIso8601String()` shape) and `normalizeGoal`'s
/// targetAmount-equals-sum-of-components rule, because several tests assert
/// these fixtures ARE accepted by the real (non-mocked) validator/normalizer.

// ---------------------------------------------------------------------------
// Shared goal building blocks
// ---------------------------------------------------------------------------

/// Goal #1: non-archived, has components (2), one legacy-shape
/// confirmedTransfer and one full-shape confirmedTransfer.
/// targetAmount (5000) exactly equals round2(3000 + 2000), per
/// normalizeGoal's components-present rule.
Map<String, Object?> goalWithComponentsAndTransfers() => {
      'id': 'g1',
      'title': 'חופשה משפחתית',
      'dueDate': '2026-12-31',
      'targetAmount': 5000,
      'savedAmount': 1000,
      'isArchived': false,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-06-01T00:00:00.000Z',
      'components': [
        {'id': 'c1', 'name': 'טיסות', 'amount': 3000},
        {'id': 'c2', 'name': 'מלון', 'amount': 2000, 'dueDate': '2026-11-01'},
      ],
      'confirmedTransfers': [
        // Legacy shape: none of id/confirmedAt/reminderPeriod/source present.
        {'date': '2026-02-01', 'amount': 500},
        // Full shape: ALL FOUR of the extra fields present together.
        {
          'date': '2026-03-01',
          'amount': 500,
          'id': 't1',
          'confirmedAt': '2026-03-01T00:00:00.000Z',
          'reminderPeriod': '2026-03',
          'source': 'goals_reminder',
        },
      ],
    };

/// Goal #2: archived, no components (targetAmount set directly, per
/// normalizeGoal's empty-components branch), no confirmedTransfers.
Map<String, Object?> archivedGoalWithoutComponents() => {
      'id': 'g2',
      'title': 'קרן חירום',
      'dueDate': '2027-01-15',
      'targetAmount': 10000,
      'savedAmount': 10000,
      'isArchived': true,
      'createdAt': '2025-05-01T00:00:00.000Z',
      'updatedAt': '2025-05-01T00:00:00.000Z',
      'components': const [],
      'confirmedTransfers': const [],
    };

/// A goal whose confirmedTransfers contains one HYBRID (partial) transfer —
/// only 2 of the 4 "full shape" extra fields (id, confirmedAt) are present,
/// missing reminderPeriod/source. Per `_normalizeConfirmedTransfer`, a
/// newFieldCount that is neither 0 nor 4 is rejected outright (never
/// reinterpreted as legacy) — this must invalidate the whole goals array.
Map<String, Object?> goalWithHybridConfirmedTransfer() => {
      'id': 'g-hybrid',
      'title': 'יעד לא תקין',
      'dueDate': '2026-12-31',
      'targetAmount': 1000,
      'savedAmount': 0,
      'isArchived': false,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
      'components': const [],
      'confirmedTransfers': [
        {
          'date': '2026-01-10',
          'amount': 100,
          'id': 't-hybrid',
          'confirmedAt': '2026-01-10T00:00:00.000Z',
          // reminderPeriod and source deliberately omitted.
        },
      ],
    };

// ---------------------------------------------------------------------------
// Shared item building blocks
// ---------------------------------------------------------------------------

/// One of each of the 6 FinanceItem types, each minimally well-formed per
/// item_normalizer.dart (usable id + numeric amount at minimum;
/// cashWithdrawal additionally needs a valid 'start' date, non-empty title,
/// isArchived:false and amount > 0 per isValidItemsArrayForRestore).
List<Map<String, Object?>> mixedTypeItems() => [
      {
        'id': 1,
        'type': 'income',
        'title': 'משכורת',
        'amount': 12000,
        'isArchived': false,
        'day': 1,
      },
      {
        'id': 2,
        'type': 'fixed',
        'title': 'שכירות',
        'amount': 4000,
        'isArchived': false,
        'day': 1,
        'where': 'bank',
        'period': 'חודשי',
      },
      {
        'id': 3,
        'type': 'variable',
        'title': 'סופר',
        'amount': 1500,
        'isArchived': false,
        'day': 10,
        'where': 'credit',
      },
      {
        'id': 4,
        'type': 'loan',
        'title': 'הלוואת רכב',
        'amount': 2000,
        'isArchived': false,
        'day': 5,
        'where': 'בנק הפועלים',
        'interest': 3,
        'total': 24,
        'start': '2025-01-01',
      },
      {
        'id': 5,
        'type': 'dated',
        'title': 'ביטוח שנתי',
        'amount': 3000,
        'isArchived': false,
        'start': '2026-11-01',
        'where': 'bank',
      },
      {
        'id': 6,
        'type': 'cashWithdrawal',
        'title': 'משיכה',
        'amount': 500,
        'isArchived': false,
        'start': '2026-09-01',
      },
    ];

// ---------------------------------------------------------------------------
// 1. Full schemaVersion 2 backup — every known key present, goals-aware.
// ---------------------------------------------------------------------------

/// Fixture #1: full v2 backup with all 7 known keys, including a non-empty
/// goals array (one goal with components + both transfer shapes, one
/// archived goal without components). Must pass validateBackupShape.
Map<String, Object?> fullV2BackupJson() => {
      'schemaVersion': 2,
      'exportedAt': '2026-09-05T10:00:00.000Z',
      'data': {
        kDataKey: jsonEncode(mixedTypeItems()),
        kCategoryConfigKey: jsonEncode({'groceries': 'משתנה'}),
        kSettingsKey: jsonEncode({
          'theme': 'dark',
          'projectedBalanceOpeningAmount': 1000,
          'projectedBalanceOpeningDate': '2026-09-01',
          'projectedBalanceOpeningIncludedWithdrawalIds': <int>[],
        }),
        kActivityLogKey: jsonEncode([
          {'ts': '2026-09-01T08:00:00.000Z', 'action': 'add', 'detail': 'x'},
        ]),
        kGoalsKey: jsonEncode([
          goalWithComponentsAndTransfers(),
          archivedGoalWithoutComponents(),
        ]),
        kCategoryTileOrderKey: jsonEncode(['groceries', 'transport']),
        kLoanBalanceViewKey: jsonEncode('total'),
      },
    };

// ---------------------------------------------------------------------------
// 2 & 3. schemaVersion absent (v1 / legacy) backups.
// ---------------------------------------------------------------------------

/// Fixture #2: schemaVersion key absent entirely (v1/legacy), WITHOUT a
/// goals key at all — a richer v1-ish backup (data + cat_config + settings +
/// activity_log) to stay distinct from fixture #3's minimal shape. Must pass
/// validateBackupShape (a non-goals-aware backup never requires goals).
Map<String, Object?> richV1BackupWithoutGoalsKeyJson() => {
      'exportedAt': '2024-03-01T09:00:00.000Z',
      'data': {
        kDataKey: jsonEncode(mixedTypeItems()),
        kCategoryConfigKey: jsonEncode({'groceries': 'קבוע'}),
        kSettingsKey: jsonEncode({'theme': 'light'}),
        kActivityLogKey: jsonEncode([
          {'ts': '2024-03-01T09:00:00.000Z', 'action': 'add', 'detail': 'y'},
        ]),
      },
    };

/// Fixture #3: minimal shape, schemaVersion absent — just the `data` key,
/// nothing else. Distinct from fixture #2 (which is deliberately richer).
/// Must pass validateBackupShape.
Map<String, Object?> minimalAbsentSchemaVersionBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
      },
    };

// ---------------------------------------------------------------------------
// 4 & 5. Goals-aware (v2) — empty vs non-empty goals array.
// ---------------------------------------------------------------------------

/// Fixture #4: schemaVersion 2 with an EMPTY goals array — still valid
/// (goals-aware only requires the key to be present, not non-empty).
Map<String, Object?> emptyGoalsV2BackupJson() => {
      'schemaVersion': 2,
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kGoalsKey: jsonEncode(<Object?>[]),
      },
    };

/// Fixture #5: schemaVersion 2 with a non-empty goals array — at least 2
/// goals, one archived and one not.
Map<String, Object?> nonEmptyGoalsV2BackupJson() => {
      'schemaVersion': 2,
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kGoalsKey: jsonEncode([
          goalWithComponentsAndTransfers(),
          archivedGoalWithoutComponents(),
        ]),
      },
    };

// ---------------------------------------------------------------------------
// 6. Legacy raw (non-JSON) loan_balance_view value.
// ---------------------------------------------------------------------------

/// Fixture #6: `family_finance_loan_balance_view` stored as the LEGACY raw
/// (non-JSON-encoded) literal string `principal`, not `"principal"`. Both
/// forms must be accepted by validateBackupShape.
Map<String, Object?> legacyRawLoanBalanceViewBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kLoanBalanceViewKey: 'principal',
      },
    };

// ---------------------------------------------------------------------------
// 7. category_tile_order present with a plausible array value.
// ---------------------------------------------------------------------------

/// Fixture #7: `family_finance_category_tile_order` present with a plausible
/// JSON array of category-key strings. The backup layer does not deeply
/// validate its structure — only that the whole backup shape is otherwise
/// valid.
Map<String, Object?> categoryTileOrderBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kCategoryTileOrderKey:
            jsonEncode(['groceries', 'transport', 'bank_general']),
      },
    };

// ---------------------------------------------------------------------------
// 8. Settings with an Opening Balance (amount 0 to prove zero != unset).
// ---------------------------------------------------------------------------

/// Fixture #8: `family_finance_settings` JSON-encodes an object carrying an
/// Opening Balance with amount 0 (proving zero is a valid, distinct-from-
/// unset value per CLAUDE.md section 11) plus an explicit EMPTY
/// includedWithdrawalIds list (also covers half of fixture #13's null-vs-[]
/// distinction; see the dedicated #13 functions below for the full pair).
Map<String, Object?> settingsWithZeroOpeningBalanceBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 0,
          'projectedBalanceOpeningDate': '2026-09-01',
          'projectedBalanceOpeningIncludedWithdrawalIds': <int>[],
        }),
      },
    };

// ---------------------------------------------------------------------------
// 9. Activity log with a few entries.
// ---------------------------------------------------------------------------

/// Fixture #9: `family_finance_activity_log` is a JSON array of
/// `{ts, action, detail}` entries.
Map<String, Object?> activityLogBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kActivityLogKey: jsonEncode([
          {'ts': '2026-09-01T08:00:00.000Z', 'action': 'add', 'detail': 'הכנסה חדשה'},
          {'ts': '2026-09-02T09:30:00.000Z', 'action': 'edit', 'detail': 'עדכון סכום'},
          {'ts': '2026-09-03T11:15:00.000Z', 'action': 'delete', 'detail': 'מחיקת פריט'},
        ]),
      },
    };

// ---------------------------------------------------------------------------
// 10. Unknown/future family_finance_* key preserved as an opaque string.
// ---------------------------------------------------------------------------

/// Fixture #10: an unknown/future key (`family_finance_widget_layout`) sits
/// alongside a normal `family_finance_data` key, proving forward-compatible
/// keys are preserved as opaque strings rather than rejected.
Map<String, Object?> unknownFutureKeyBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        'family_finance_widget_layout': jsonEncode({'columns': 2, 'order': ['a', 'b']}),
      },
    };

// ---------------------------------------------------------------------------
// 11. Mixed item types in family_finance_data.
// ---------------------------------------------------------------------------

/// Fixture #11: one of each of the 6 item types in `family_finance_data`.
Map<String, Object?> mixedItemTypesBackupJson() => {
      'data': {
        kDataKey: jsonEncode(mixedTypeItems()),
      },
    };

// ---------------------------------------------------------------------------
// 12. Legacy typing variations (numeric-string day, free-form `where`).
// ---------------------------------------------------------------------------

/// Fixture #12: a fixed item with `day` stored as a numeric STRING ('5'
/// instead of 5) and a legacy free-form `where` value ('בנק הפועלים') that
/// must survive raw preservation. This only needs to be a VALID BACKUP
/// SHAPE — isValidItemsArrayForRestore does not deeply validate non-
/// cashWithdrawal items, so these legacy typings do not affect shape
/// validity (domain-level resolution is Milestone 2's concern).
Map<String, Object?> legacyTypingVariationsBackupJson() => {
      'data': {
        kDataKey: jsonEncode([
          {
            'id': 7,
            'type': 'fixed',
            'title': 'ארנונה',
            'amount': 800,
            'isArchived': false,
            'day': '5', // numeric string, not a number
            'where': 'בנק הפועלים', // free-form legacy value
          },
        ]),
      },
    };

// ---------------------------------------------------------------------------
// 13. null vs [] includedWithdrawalIds — two standalone settings-only pairs.
// ---------------------------------------------------------------------------

/// Fixture #13a: `projectedBalanceOpeningIncludedWithdrawalIds` key is
/// ABSENT entirely from the settings object (resolves to null at the
/// SettingsRepository layer — not asserted here, see repositories_test.dart;
/// this fixture only proves the raw JSON shape is valid at the backup
/// layer).
Map<String, Object?> settingsOpeningBalanceWithdrawalIdsAbsentBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 500,
          'projectedBalanceOpeningDate': '2026-09-01',
        }),
      },
    };

/// Fixture #13b: `projectedBalanceOpeningIncludedWithdrawalIds` is an
/// EXPLICIT empty array — must be preserved as `[]`, not coerced to null,
/// at the SettingsRepository layer (not asserted here; see #13a doc comment).
Map<String, Object?> settingsOpeningBalanceWithdrawalIdsEmptyArrayBackupJson() => {
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kSettingsKey: jsonEncode({
          'projectedBalanceOpeningAmount': 500,
          'projectedBalanceOpeningDate': '2026-09-01',
          'projectedBalanceOpeningIncludedWithdrawalIds': <int>[],
        }),
      },
    };

// ---------------------------------------------------------------------------
// Invalid fixtures (negative testing; prove fixtures aren't trivially valid)
// ---------------------------------------------------------------------------

/// INVALID: schemaVersion 2 (goals-aware) but the mandatory `family_finance_
/// goals` key is missing entirely. Must fail validateBackupShape.
Map<String, Object?> invalidV2MissingMandatoryGoalsKeyJson() => {
      'schemaVersion': 2,
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
      },
    };

/// INVALID: schemaVersion 2 with a goals array containing one goal whose
/// confirmedTransfers has a hybrid (partially-shaped) transfer. Must fail
/// validateBackupShape (normalizeGoalsArrayStrict rejects the whole array on
/// the first invalid goal).
Map<String, Object?> invalidGoalsHybridConfirmedTransferJson() => {
      'schemaVersion': 2,
      'data': {
        kDataKey: jsonEncode(<Object?>[]),
        kGoalsKey: jsonEncode([goalWithHybridConfirmedTransfer()]),
      },
    };
