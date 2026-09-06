/// A confirmedTransfers entry is EITHER a true legacy record (date+amount
/// only) OR a complete Milestone-5 record (all 4 of
/// id/confirmedAt/reminderPeriod/source present) — normalizeGoal()'s
/// "partial hybrid" shape (some but not all 4 extra fields) has no
/// representation here at all: it is a validation failure, not a third
/// variant.
sealed class ConfirmedTransfer {
  final String date;
  final num amount;
  const ConfirmedTransfer({required this.date, required this.amount});
}

final class LegacyConfirmedTransfer extends ConfirmedTransfer {
  const LegacyConfirmedTransfer({required super.date, required super.amount});
}

final class FullConfirmedTransfer extends ConfirmedTransfer {
  final String id;
  final String confirmedAt;
  final String reminderPeriod;
  final String source;

  const FullConfirmedTransfer({
    required super.date,
    required super.amount,
    required this.id,
    required this.confirmedAt,
    required this.reminderPeriod,
    required this.source,
  });
}

class GoalComponent {
  final String id;
  final String name;
  final num amount;
  final String? dueDate;

  const GoalComponent({
    required this.id,
    required this.name,
    required this.amount,
    this.dueDate,
  });
}

class Goal {
  final String id;
  final String title;
  final String dueDate;
  /// For a goal WITH components, this always equals round2(sum of component
  /// amounts) — normalizeGoal() rejects a goal whose stored targetAmount
  /// disagrees with that sum, rather than silently recomputing it.
  final num targetAmount;
  final num savedAmount;
  final List<GoalComponent> components;
  final bool isArchived;
  final String createdAt;
  final String updatedAt;
  final List<ConfirmedTransfer> confirmedTransfers;

  const Goal({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.targetAmount,
    required this.savedAmount,
    required this.components,
    required this.isArchived,
    required this.createdAt,
    required this.updatedAt,
    required this.confirmedTransfers,
  });
}

/// loadGoalsState()'s all-or-nothing contract: either every stored goal is
/// valid, or the entire dataset is invalid — there is no partial/filtered
/// result. [GoalsInvalid.raw] preserves the original stored string
/// byte-for-byte for recovery/reset paths, exactly as goalsState.raw does
/// today.
sealed class GoalsLoadResult {
  const GoalsLoadResult();
}

final class GoalsValid extends GoalsLoadResult {
  final List<Goal> goals;
  const GoalsValid(this.goals);
}

final class GoalsInvalid extends GoalsLoadResult {
  final String? raw;
  final String reason;
  const GoalsInvalid({required this.raw, required this.reason});
}
