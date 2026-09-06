import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/backup/backup_validator.dart';
import 'package:familyfinance_pro/data/raw/raw_backup_envelope.dart';

String _envelope(Map<String, Object?> body) => jsonEncode(body);

/// A minimally well-formed goal map matching normalizeGoal()'s "no
/// components" branch (targetAmount is asserted directly, must be > 0).
/// Callers override only the field(s) relevant to the test at hand.
Map<String, Object?> _validGoal({
  String id = 'goal-1',
  String title = 'יעד לדוגמה',
  String dueDate = '2026-09-05',
  num targetAmount = 1000,
  num savedAmount = 0,
  bool isArchived = false,
  String createdAt = '2026-01-01T00:00:00.000Z',
  String updatedAt = '2026-01-01T00:00:00.000Z',
  List<Object?> components = const [],
  List<Object?> confirmedTransfers = const [],
}) =>
    {
      'id': id,
      'title': title,
      'dueDate': dueDate,
      'targetAmount': targetAmount,
      'savedAmount': savedAmount,
      'isArchived': isArchived,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'components': components,
      'confirmedTransfers': confirmedTransfers,
    };

void main() {
  group('RawBackupEnvelope parsing', () {
    test('v2 (schemaVersion=2) envelope parses', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'exportedAt': '2026-09-05 10:00',
        'data': {'family_finance_data': '[]', 'family_finance_goals': '[]'},
      }));
      expect(env.isGoalsAwareVersion, isTrue);
    });

    test('v1 (schemaVersion absent) envelope parses as non-goals-aware', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'exportedAt': '2025-01-01 10:00',
        'data': {'family_finance_data': '[]'},
      }));
      expect(env.isGoalsAwareVersion, isFalse);
    });

    test('malformed top-level JSON throws, not silently null', () {
      expect(
        () => RawBackupEnvelope.fromJsonString('{not valid json'),
        throwsA(anything),
      );
    });

    test('missing data object throws', () {
      expect(
        () => RawBackupEnvelope.fromJsonString(_envelope({'schemaVersion': 2})),
        throwsA(anything),
      );
    });
  });

  group('validateBackupShape', () {
    test('a fully valid v2 backup passes', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_cat_config': jsonEncode({}),
          'family_finance_settings': jsonEncode({}),
          'family_finance_activity_log': jsonEncode([]),
          'family_finance_goals': jsonEncode([]),
        },
      }));
      expect(validateBackupShape(env).isValid, isTrue);
    });

    test('a v2 backup missing the mandatory goals key is invalid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {'family_finance_data': jsonEncode([])},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a v1 backup with NO goals key at all is still valid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'family_finance_data': jsonEncode([])},
      }));
      expect(validateBackupShape(env).isValid, isTrue);
    });

    test('a v1 backup carrying an unexpected goals key ignores its content for validity', () {
      // isValidBackupShape() does not validate goals at all for a non-goals-aware
      // backup — only confirmRestoreBackup() later strips the key on write.
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_goals': jsonEncode([
            {'not': 'a valid goal'}
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isTrue);
    });

    test('malformed JSON inside one key rejects the whole backup', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'family_finance_data': '{not valid json'},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('an unprefixed key rejects the whole backup', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'not_a_family_finance_key': jsonEncode([])},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('empty data object is invalid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({'data': {}}));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    group('loan_balance_view legacy raw-string compatibility', () {
      test('new JSON-encoded form ("total") is valid', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {'family_finance_loan_balance_view': jsonEncode('total')},
        }));
        expect(validateBackupShape(env).isValid, isTrue);
      });

      test('legacy raw (non-JSON) form "principal" is still valid', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {'family_finance_loan_balance_view': 'principal'},
        }));
        expect(validateBackupShape(env).isValid, isTrue);
      });

      test('any other value is invalid', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {'family_finance_loan_balance_view': 'garbage'},
        }));
        expect(validateBackupShape(env).isValid, isFalse);
      });
    });

    group('items array validation (cashWithdrawal-specific)', () {
      test('an ordinary fixed item with a bogus amount still passes (not deeply checked)', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {
            'family_finance_data': jsonEncode([
              {'id': 1, 'type': 'fixed', 'title': 'x', 'amount': 'not-a-number', 'isArchived': false},
            ]),
          },
        }));
        expect(validateBackupShape(env).isValid, isTrue);
      });

      test('a cashWithdrawal with a colliding numeric id is rejected', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {
            'family_finance_data': jsonEncode([
              {'id': 5, 'type': 'fixed', 'title': 'x', 'amount': 10, 'isArchived': false},
              {
                'id': 5, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
                'start': '2026-09-01', 'isArchived': false,
              },
            ]),
          },
        }));
        expect(validateBackupShape(env).isValid, isFalse);
      });

      test('a well-formed cashWithdrawal passes', () {
        final env = RawBackupEnvelope.fromJsonString(_envelope({
          'data': {
            'family_finance_data': jsonEncode([
              {
                'id': 6, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
                'start': '2026-09-01', 'isArchived': false,
              },
            ]),
          },
        }));
        expect(validateBackupShape(env).isValid, isTrue);
      });
    });
  });

  group('RawBackupEnvelope non-string data values', () {
    test('a numeric value for a data key throws', () {
      expect(
        () => RawBackupEnvelope.fromJsonString(_envelope({
          'schemaVersion': 2,
          'data': {'family_finance_data': 12345},
        })),
        throwsA(anything),
      );
    });

    test('a nested object value for a data key throws', () {
      expect(
        () => RawBackupEnvelope.fromJsonString(_envelope({
          'schemaVersion': 2,
          'data': {
            'family_finance_data': {'nested': true},
          },
        })),
        throwsA(anything),
      );
    });
  });

  group('validateBackupShape — goals array present but malformed', () {
    test('a v2 backup whose goals array holds an incomplete goal is invalid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_goals': jsonEncode([
            {'id': 'x'},
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a v2 backup whose goals array has two goals sharing the same id is invalid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_goals': jsonEncode([
            _validGoal(id: 'dup'),
            _validGoal(id: 'dup'),
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });

  group('validateBackupShape — hybrid confirmedTransfer rejects the whole backup', () {
    test('a goal with a partial (2-of-4) confirmedTransfer shape is invalid', () {
      final goal = _validGoal(confirmedTransfers: [
        {
          'date': '2026-09-05',
          'amount': 100,
          'id': 'ct-1',
          'confirmedAt': '2026-01-01T00:00:00.000Z',
          // reminderPeriod and source deliberately omitted: 2 of the 4
          // "full shape" fields present is neither legacy (0) nor full (4).
        },
      ]);
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_goals': jsonEncode([goal]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });

  group('validateBackupShape — cashWithdrawal field validation', () {
    test('a cashWithdrawal with a non-positive amount is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 101, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 0,
              'start': '2026-09-01', 'isArchived': false,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with an invalid (out-of-range) start date is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 102, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
              'start': '2026-13-40', 'isArchived': false,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with a non-string start date is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 103, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
              'start': 20260901, 'isArchived': false,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with a missing title is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 104, 'type': 'cashWithdrawal', 'amount': 100,
              'start': '2026-09-01', 'isArchived': false,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with an empty title is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 105, 'type': 'cashWithdrawal', 'title': '', 'amount': 100,
              'start': '2026-09-01', 'isArchived': false,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with a non-boolean isArchived is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 106, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
              'start': '2026-09-01', 'isArchived': 'false',
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('a cashWithdrawal with a non-string notes field is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': 107, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
              'start': '2026-09-01', 'isArchived': false, 'notes': 12345,
            },
          ]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });

  group('validateBackupShape — cashWithdrawal.id Number.isSafeInteger parity', () {
    // Each case builds a JSON backup containing exactly one cashWithdrawal
    // (no collision), varying only its `id`. Expected accept/reject derived
    // directly from Node: Number.isSafeInteger(5)===true,
    // Number.isSafeInteger(5.0)===true, Number.isSafeInteger(5.5)===false,
    // Number.isSafeInteger(0)===true (but id<=0 still rejects it),
    // Number.isSafeInteger(-3)===true (but id<=0 still rejects it),
    // Number.isSafeInteger(9007199254740991)===true,
    // Number.isSafeInteger(9007199254740992)===false.
    BackupValidationResult validateWithCashWithdrawalId(Object? id) {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {
              'id': id, 'type': 'cashWithdrawal', 'title': 'משיכה',
              'amount': 100, 'start': '2026-09-01', 'isArchived': false,
            },
          ]),
        },
      }));
      return validateBackupShape(env);
    }

    test('id = 5 (plain int) is accepted', () {
      expect(validateWithCashWithdrawalId(5).isValid, isTrue);
    });

    test('id = 5.0 (the JSON token 5.0, decodes to a Dart double) is ALSO accepted', () {
      expect(validateWithCashWithdrawalId(5.0).isValid, isTrue);
    });

    test('id = 5.5 (a genuinely fractional value) is rejected', () {
      expect(validateWithCashWithdrawalId(5.5).isValid, isFalse);
    });

    test('id = 0 is rejected (fails the positive-id requirement, not safe-integer-ness)', () {
      expect(validateWithCashWithdrawalId(0).isValid, isFalse);
    });

    test('a negative integer id is rejected (fails the positive-id requirement)', () {
      expect(validateWithCashWithdrawalId(-3).isValid, isFalse);
    });

    test('id = JS MAX_SAFE_INTEGER (9007199254740991) is accepted', () {
      expect(validateWithCashWithdrawalId(9007199254740991).isValid, isTrue);
    });

    test('id = one beyond JS MAX_SAFE_INTEGER (9007199254740992) is rejected', () {
      expect(validateWithCashWithdrawalId(9007199254740992).isValid, isFalse);
    });

    test('duplicate collision detected between a plain int id and the same value as an integral double', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {
          'family_finance_data': jsonEncode([
            {'id': 5, 'type': 'fixed', 'title': 'x', 'amount': 10, 'isArchived': false},
            {
              'id': 5.0, 'type': 'cashWithdrawal', 'title': 'משיכה', 'amount': 100,
              'start': '2026-09-01', 'isArchived': false,
            },
          ]),
        },
      }));
      // 5 and 5.0 must be treated as the SAME id for collision purposes,
      // exactly as JS does (object-key coercion makes both "5").
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });

  group('validateBackupShape — config/settings/activity_log shape', () {
    test('family_finance_cat_config as a JSON array is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'family_finance_cat_config': jsonEncode([])},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('family_finance_settings as a JSON array is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'family_finance_settings': jsonEncode([])},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });

    test('family_finance_activity_log as a JSON object is rejected', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'data': {'family_finance_activity_log': jsonEncode({})},
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });

  group('validateBackupShape — v2 missing goals key with everything else present', () {
    test('a v2 backup missing only the goals key, all other keys well-formed, is invalid', () {
      final env = RawBackupEnvelope.fromJsonString(_envelope({
        'schemaVersion': 2,
        'data': {
          'family_finance_data': jsonEncode([]),
          'family_finance_cat_config': jsonEncode({}),
          'family_finance_settings': jsonEncode({}),
          'family_finance_activity_log': jsonEncode([]),
        },
      }));
      expect(validateBackupShape(env).isValid, isFalse);
    });
  });
}
