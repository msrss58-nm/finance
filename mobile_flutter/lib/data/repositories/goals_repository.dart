import 'dart:convert';

import '../../domain/models/goal.dart';
import '../../domain/normalization/goal_normalizer.dart';
import '../persistence/key_value_store.dart';

const String kGoalsKey = 'family_finance_goals';

/// Port of loadGoalsState()/saveGoals()'s guarded-write contract: absence of
/// the key is a valid empty list (a goals-aware device that never created a
/// goal), never corruption; ANY other problem makes the entire local
/// dataset invalid, and [GoalsRepository.saveAll] must refuse to write while
/// the last load was invalid — the caller is responsible for checking
/// [GoalsLoadResult] before calling saveAll.
abstract interface class GoalsRepository {
  Future<GoalsLoadResult> load();

  /// Returns `false` (matching saveGoals()'s guarded no-op) without writing
  /// anything when [wasValid] is false — callers must pass through whatever
  /// validity their most recent [load] returned.
  Future<bool> saveAll(List<Goal> goals, {required bool wasValid});
}

class GoalsRepositoryImpl implements GoalsRepository {
  final KeyValueStore _store;
  const GoalsRepositoryImpl(this._store);

  @override
  Future<GoalsLoadResult> load() async {
    final raw = await _store.getString(kGoalsKey);
    if (raw == null) return const GoalsValid([]);
    Object? parsed;
    try {
      parsed = jsonDecode(raw);
    } catch (e) {
      return GoalsInvalid(raw: raw, reason: 'malformed JSON: $e');
    }
    final validated = normalizeGoalsArrayStrict(parsed);
    if (validated == null) {
      return GoalsInvalid(raw: raw, reason: 'one or more goals failed strict validation');
    }
    return GoalsValid(validated);
  }

  @override
  Future<bool> saveAll(List<Goal> goals, {required bool wasValid}) async {
    if (!wasValid) return false;
    final list = goals.map(_goalToJson).toList();
    await _store.setString(kGoalsKey, jsonEncode(list));
    return true;
  }

  Map<String, Object?> _goalToJson(Goal g) => {
        'id': g.id,
        'title': g.title,
        'dueDate': g.dueDate,
        'targetAmount': g.targetAmount,
        'savedAmount': g.savedAmount,
        'isArchived': g.isArchived,
        'createdAt': g.createdAt,
        'updatedAt': g.updatedAt,
        'components': g.components
            .map((c) => {
                  'id': c.id,
                  'name': c.name,
                  'amount': c.amount,
                  if (c.dueDate != null) 'dueDate': c.dueDate,
                })
            .toList(),
        'confirmedTransfers': g.confirmedTransfers.map((ct) {
          return switch (ct) {
            LegacyConfirmedTransfer() => {'date': ct.date, 'amount': ct.amount},
            FullConfirmedTransfer() => {
                'date': ct.date,
                'amount': ct.amount,
                'id': ct.id,
                'confirmedAt': ct.confirmedAt,
                'reminderPeriod': ct.reminderPeriod,
                'source': ct.source,
              },
          };
        }).toList(),
      };
}
