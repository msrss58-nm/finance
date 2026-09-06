import '../../data/raw/raw_goal.dart';
import '../models/goal.dart';
import 'legacy_resolvers.dart';

/// Direct port of normalizeComponent()/normalizeGoal()/
/// isValidGoalsArrayStrict() — Milestone 6/7.1 in the Web app. Deliberately
/// STRICT (unlike item_normalizer.dart): Goals data has never shipped to
/// Production with lenient/legacy raw shapes to stay compatible with, so
/// every raw type is checked exactly (a numeric-string amount, for example,
/// is a validation failure here, never coerced). All-or-nothing: one
/// malformed goal/component/confirmedTransfer anywhere invalidates the
/// entire array.
GoalComponent? normalizeGoalComponent(Object? rawJson) {
  if (rawJson is! Map) return null;
  final raw = RawGoalComponentJson.fromJson(rawJson);
  final id = raw.id;
  if (id is! String || id.isEmpty) return null;
  final name = raw.name;
  if (name is! String) return null;
  final trimmedName = name.trim();
  if (trimmedName.isEmpty) return null;
  final amount = raw.amount;
  if (amount is! num || !amount.isFinite || amount <= 0) return null;

  String? dueDate;
  final rawDueDate = raw.dueDate;
  if (rawDueDate != null) {
    if (rawDueDate is! String || !isValidDateStr(rawDueDate)) return null;
    dueDate = rawDueDate;
  }

  return GoalComponent(
    id: id,
    name: trimmedName,
    amount: round2(amount),
    dueDate: dueDate,
  );
}

ConfirmedTransfer? _normalizeConfirmedTransfer(Object? rawJson) {
  if (rawJson is! Map) return null;
  final ct = RawConfirmedTransferJson.fromJson(rawJson);
  final amount = ct.amount;
  if (amount is! num || !amount.isFinite || amount <= 0) return null;
  final date = ct.date;
  if (date is! String || !isValidDateStr(date)) return null;

  final newFieldCount = (ct.hasId ? 1 : 0) +
      (ct.hasConfirmedAt ? 1 : 0) +
      (ct.hasReminderPeriod ? 1 : 0) +
      (ct.hasSource ? 1 : 0);

  if (newFieldCount == 0) {
    return LegacyConfirmedTransfer(date: date, amount: round2(amount));
  }
  if (newFieldCount != 4) {
    // Partial hybrid — never accepted, never reinterpreted as legacy.
    return null;
  }

  final id = ct.id;
  if (id is! String || id.isEmpty) return null;
  final confirmedAt = ct.confirmedAt;
  if (confirmedAt is! String || !isValidCanonicalIsoTimestamp(confirmedAt)) {
    return null;
  }
  final reminderPeriod = ct.reminderPeriod;
  if (reminderPeriod is! String ||
      !RegExp(r'^\d{4}-\d{2}$').hasMatch(reminderPeriod)) {
    return null;
  }
  if (reminderPeriod != date.substring(0, 7)) return null;
  final source = ct.source;
  if (source != 'goals_reminder') return null;

  return FullConfirmedTransfer(
    date: date,
    amount: round2(amount),
    id: id,
    confirmedAt: confirmedAt,
    reminderPeriod: reminderPeriod,
    source: source as String,
  );
}

Goal? normalizeGoal(Object? rawJson) {
  if (rawJson is! Map) return null;
  final raw = RawGoalJson.fromJson(rawJson);

  final id = raw.id;
  if (id is! String || id.isEmpty) return null;
  final title = raw.title;
  if (title is! String) return null;
  final trimmedTitle = title.trim();
  if (trimmedTitle.isEmpty) return null;
  final dueDate = raw.dueDate;
  if (dueDate is! String || !isValidDateStr(dueDate)) return null;
  final isArchived = raw.isArchived;
  if (isArchived is! bool) return null;
  final createdAt = raw.createdAt;
  if (createdAt is! String || !isValidCanonicalIsoTimestamp(createdAt)) {
    return null;
  }
  final updatedAt = raw.updatedAt;
  if (updatedAt is! String || !isValidCanonicalIsoTimestamp(updatedAt)) {
    return null;
  }
  if (DateTime.parse(updatedAt).isBefore(DateTime.parse(createdAt))) {
    return null;
  }
  final rawComponents = raw.components;
  if (rawComponents is! List) return null;
  final rawConfirmedTransfers = raw.confirmedTransfers;
  if (rawConfirmedTransfers is! List) return null;

  final components = <GoalComponent>[];
  final seenComponentIds = <String>{};
  for (final rc in rawComponents) {
    final comp = normalizeGoalComponent(rc);
    if (comp == null) return null;
    if (!seenComponentIds.add(comp.id)) return null;
    components.add(comp);
  }

  final num targetAmount;
  if (components.isNotEmpty) {
    var sum = 0.0;
    for (final c in components) {
      sum = round2(sum + c.amount);
    }
    final rawTarget = raw.targetAmount;
    if (rawTarget is! num || !rawTarget.isFinite) return null;
    if (round2(rawTarget) != sum) return null;
    targetAmount = sum;
  } else {
    final rawTarget = raw.targetAmount;
    if (rawTarget is! num || !rawTarget.isFinite || rawTarget <= 0) {
      return null;
    }
    targetAmount = round2(rawTarget);
  }

  final rawSaved = raw.savedAmount;
  if (rawSaved is! num || !rawSaved.isFinite || rawSaved < 0) return null;
  final savedAmount = round2(rawSaved);

  final confirmedTransfers = <ConfirmedTransfer>[];
  for (final rt in rawConfirmedTransfers) {
    final ct = _normalizeConfirmedTransfer(rt);
    if (ct == null) return null;
    confirmedTransfers.add(ct);
  }

  return Goal(
    id: id,
    title: trimmedTitle,
    dueDate: dueDate,
    targetAmount: targetAmount,
    savedAmount: savedAmount,
    components: components,
    isArchived: isArchived,
    createdAt: createdAt,
    updatedAt: updatedAt,
    confirmedTransfers: confirmedTransfers,
  );
}

/// isValidGoalsArrayStrict(): returns null (meaning: reject the whole array)
/// on the first invalid/duplicate-id goal; otherwise the fully normalized
/// list.
List<Goal>? normalizeGoalsArrayStrict(Object? rawJson) {
  if (rawJson is! List) return null;
  final result = <Goal>[];
  final seenIds = <String>{};
  for (final rg in rawJson) {
    final g = normalizeGoal(rg);
    if (g == null) return null;
    if (!seenIds.add(g.id)) return null;
    result.add(g);
  }
  return result;
}
