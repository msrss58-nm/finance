/// Raw view of one entry in `family_finance_goals`. Unlike [RawItemJson],
/// Goals validation (normalizeGoal()/isValidGoalsArrayStrict()) is
/// deliberately STRICT about raw types — a numeric-string amount, for
/// example, is a validation failure, not something to coerce — so this
/// wrapper exposes the untouched raw value for each field rather than a
/// permissively-parsed one; GoalNormalizer performs the exact-type checks.
class RawGoalJson {
  final Map<String, Object?> raw;
  const RawGoalJson(this.raw);

  factory RawGoalJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('goal entry is not a JSON object: $json');
    }
    return RawGoalJson(Map<String, Object?>.from(json));
  }

  Object? get id => raw['id'];
  Object? get title => raw['title'];
  Object? get dueDate => raw['dueDate'];
  Object? get targetAmount => raw['targetAmount'];
  Object? get savedAmount => raw['savedAmount'];
  Object? get isArchived => raw['isArchived'];
  Object? get createdAt => raw['createdAt'];
  Object? get updatedAt => raw['updatedAt'];
  Object? get components => raw['components'];
  Object? get confirmedTransfers => raw['confirmedTransfers'];

  Map<String, Object?> toJson() => raw;
}

class RawGoalComponentJson {
  final Map<String, Object?> raw;
  const RawGoalComponentJson(this.raw);

  factory RawGoalComponentJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('goal component is not a JSON object: $json');
    }
    return RawGoalComponentJson(Map<String, Object?>.from(json));
  }

  Object? get id => raw['id'];
  Object? get name => raw['name'];
  Object? get amount => raw['amount'];
  Object? get dueDate => raw['dueDate'];

  Map<String, Object?> toJson() => raw;
}

class RawConfirmedTransferJson {
  final Map<String, Object?> raw;
  const RawConfirmedTransferJson(this.raw);

  factory RawConfirmedTransferJson.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('confirmedTransfer entry is not a JSON object: $json');
    }
    return RawConfirmedTransferJson(Map<String, Object?>.from(json));
  }

  Object? get date => raw['date'];
  Object? get amount => raw['amount'];
  bool get hasId => raw.containsKey('id');
  bool get hasConfirmedAt => raw.containsKey('confirmedAt');
  bool get hasReminderPeriod => raw.containsKey('reminderPeriod');
  bool get hasSource => raw.containsKey('source');
  Object? get id => raw['id'];
  Object? get confirmedAt => raw['confirmedAt'];
  Object? get reminderPeriod => raw['reminderPeriod'];
  Object? get source => raw['source'];

  Map<String, Object?> toJson() => raw;
}
