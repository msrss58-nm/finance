import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/domain/models/goal.dart';
import 'package:familyfinance_pro/domain/normalization/goal_normalizer.dart';

Map<String, Object?> _validGoal({
  List<Object?> components = const [],
  List<Object?> confirmedTransfers = const [],
  num? targetAmount,
}) {
  return {
    'id': 'g1',
    'title': 'חופשה',
    'dueDate': '2026-12-01',
    'targetAmount': targetAmount ?? 5000,
    'savedAmount': 1000,
    'isArchived': false,
    'createdAt': '2026-01-01T00:00:00.000Z',
    'updatedAt': '2026-01-02T00:00:00.000Z',
    'components': components,
    'confirmedTransfers': confirmedTransfers,
  };
}

void main() {
  group('normalizeGoal — happy path', () {
    test('a well-formed goal with no components/transfers', () {
      final goal = normalizeGoal(_validGoal());
      expect(goal, isNotNull);
      expect(goal!.targetAmount, 5000);
    });

    test('components sum must exactly equal stored targetAmount', () {
      final goal = normalizeGoal(_validGoal(
        components: [
          {'id': 'c1', 'name': 'טיסות', 'amount': 3000},
          {'id': 'c2', 'name': 'מלון', 'amount': 2000},
        ],
        targetAmount: 5000,
      ));
      expect(goal, isNotNull);
      expect(goal!.components.length, 2);
    });

    test('a stale/contradictory stored targetAmount rejects the whole goal', () {
      final goal = normalizeGoal(_validGoal(
        components: [
          {'id': 'c1', 'name': 'טיסות', 'amount': 3000},
        ],
        targetAmount: 9999,
      ));
      expect(goal, isNull);
    });
  });

  group('normalizeGoal — strict typing', () {
    test('a numeric-string targetAmount is rejected, never coerced', () {
      final raw = _validGoal();
      raw['targetAmount'] = '5000';
      expect(normalizeGoal(raw), isNull);
    });

    test('updatedAt earlier than createdAt is rejected', () {
      final raw = _validGoal();
      raw['createdAt'] = '2026-02-01T00:00:00.000Z';
      raw['updatedAt'] = '2026-01-01T00:00:00.000Z';
      expect(normalizeGoal(raw), isNull);
    });

    test('a non-canonical timestamp shape is rejected', () {
      final raw = _validGoal();
      raw['createdAt'] = '2026-01-01';
      expect(normalizeGoal(raw), isNull);
    });
  });

  group('confirmedTransfers — legacy vs new shape', () {
    test('a true legacy record (date+amount only) is valid', () {
      final goal = normalizeGoal(_validGoal(confirmedTransfers: [
        {'date': '2026-02-02', 'amount': 500},
      ]));
      expect(goal, isNotNull);
      expect(goal!.confirmedTransfers.single, isA<LegacyConfirmedTransfer>());
    });

    test('a complete new-format record (all 4 extra fields) is valid', () {
      final goal = normalizeGoal(_validGoal(confirmedTransfers: [
        {
          'date': '2026-02-02',
          'amount': 500,
          'id': 't1',
          'confirmedAt': '2026-02-02T08:00:00.000Z',
          'reminderPeriod': '2026-02',
          'source': 'goals_reminder',
        },
      ]));
      expect(goal, isNotNull);
      expect(goal!.confirmedTransfers.single, isA<FullConfirmedTransfer>());
    });

    test('a partial hybrid (2 of 4 extra fields) invalidates the WHOLE goal', () {
      final goal = normalizeGoal(_validGoal(confirmedTransfers: [
        {
          'date': '2026-02-02',
          'amount': 500,
          'id': 't1',
          'confirmedAt': '2026-02-02T08:00:00.000Z',
          // reminderPeriod/source deliberately missing
        },
      ]));
      expect(goal, isNull);
    });

    test('reminderPeriod must match the transfer date\'s own YYYY-MM', () {
      final goal = normalizeGoal(_validGoal(confirmedTransfers: [
        {
          'date': '2026-02-02',
          'amount': 500,
          'id': 't1',
          'confirmedAt': '2026-02-02T08:00:00.000Z',
          'reminderPeriod': '2026-03', // mismatched month
          'source': 'goals_reminder',
        },
      ]));
      expect(goal, isNull);
    });

    test('an unrecognized source value is rejected', () {
      final goal = normalizeGoal(_validGoal(confirmedTransfers: [
        {
          'date': '2026-02-02',
          'amount': 500,
          'id': 't1',
          'confirmedAt': '2026-02-02T08:00:00.000Z',
          'reminderPeriod': '2026-02',
          'source': 'manual_entry',
        },
      ]));
      expect(goal, isNull);
    });
  });

  group('isValidGoalsArrayStrict — all-or-nothing', () {
    test('every goal valid -> the full normalized list', () {
      final result = normalizeGoalsArrayStrict([
        _validGoal(),
        {..._validGoal(), 'id': 'g2'},
      ]);
      expect(result, isNotNull);
      expect(result!.length, 2);
    });

    test('one malformed goal invalidates the ENTIRE array', () {
      final malformed = _validGoal();
      malformed['title'] = '';
      final result = normalizeGoalsArrayStrict([_validGoal(), malformed]);
      expect(result, isNull);
    });

    test('a duplicate goal id invalidates the entire array', () {
      final result = normalizeGoalsArrayStrict([_validGoal(), _validGoal()]);
      expect(result, isNull);
    });

    test('a non-array value is invalid', () {
      expect(normalizeGoalsArrayStrict({'not': 'an array'}), isNull);
    });

    test('an empty array is validly empty', () {
      expect(normalizeGoalsArrayStrict([]), isEmpty);
    });
  });
}
