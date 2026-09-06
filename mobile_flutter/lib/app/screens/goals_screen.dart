import 'package:flutter/material.dart';

import '../../domain/goals/goal_calculations.dart';
import '../../domain/goals/goal_funding.dart';
import '../../domain/models/goal.dart';
import '../format/currency_format.dart';
import '../services/app_services_scope.dart';
import '../widgets/async_screen_body.dart';

/// Milestone 6 Goals screen — DISPLAY-only port of the currently approved
/// Goals ("יעדים") information: the goal list (active/non-archived goals
/// only), each goal's components and deadline, and the funding state per
/// component (see goal_funding.dart).
///
/// Deliberately NOT ported in this milestone (scoped out, not forgotten):
/// goal creation/editing/deletion, archive/unarchive management, the
/// monthly-reminder overlay (goal_funding.dart's reminder-specific
/// scheduler), and native notifications. This screen only reads through
/// already-approved, already-tested domain functions — no financial
/// arithmetic happens in this file.
class GoalsScreen extends StatefulWidget {
  const GoalsScreen({super.key});

  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  Future<GoalsLoadResult>? _future;

  // AppServicesScope.of(context) reads an InheritedWidget — that must
  // happen in didChangeDependencies()/build(), never in initState(), so the
  // dependency is correctly registered. The `??=` guard ensures the load
  // only starts once, even though didChangeDependencies() can run again
  // later (e.g. on a theme/locale change) without restarting it.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= AppServicesScope.of(context).goals.load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-goals'),
      appBar: AppBar(title: const Text('יעדים')),
      body: FutureBuilder<GoalsLoadResult>(
        future: _future,
        builder: (context, snapshot) => buildAsyncScreenBody<GoalsLoadResult>(
          snapshot,
          data: (result) => _GoalsBody(result: result),
        ),
      ),
    );
  }
}

class _GoalsBody extends StatelessWidget {
  const _GoalsBody({required this.result});
  final GoalsLoadResult result;

  @override
  Widget build(BuildContext context) {
    return switch (result) {
      GoalsInvalid(reason: final reason) => _InvalidGoalsCard(reason: reason),
      GoalsValid(goals: final goals) => _buildValidBody(goals),
    };
  }

  Widget _buildValidBody(List<Goal> goals) {
    final activeGoals = goals.where((g) => !g.isArchived).toList();
    if (activeGoals.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'עדיין אין יעדי חיסכון פעילים.',
            key: ValueKey('goals-empty-text'),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.builder(
      key: const ValueKey('goals-list'),
      padding: const EdgeInsets.all(16),
      itemCount: activeGoals.length,
      itemBuilder: (context, index) => _GoalCard(goal: activeGoals[index]),
    );
  }
}

class _InvalidGoalsCard extends StatelessWidget {
  const _InvalidGoalsCard({required this.reason});
  final String reason;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Card(
          key: const ValueKey('goals-invalid-card'),
          color: Colors.red.withValues(alpha: 0.08),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '⚠️ לא ניתן לטעון את נתוני היעדים',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(reason, key: const ValueKey('goals-invalid-reason')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.goal});
  final Goal goal;

  @override
  Widget build(BuildContext context) {
    final fundingInfo = buildGoalScheduleInfo(goal, today: DateTime.now());
    final remaining = goalRemainingAmount(goal);
    final isCompleted = remaining <= 0;
    final isOverdue = !isCompleted && fundingInfo.isOverdue;
    final progress = goalProgressPercent(goal) / 100;

    return Card(
      key: ValueKey('goal-card-${goal.id}'),
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        title: Row(
          children: [
            Expanded(
              child: Text(goal.title, style: Theme.of(context).textTheme.titleMedium),
            ),
            if (isCompleted)
              const _GoalBadge(text: 'הושלם', color: Colors.green)
            else if (isOverdue)
              const _GoalBadge(text: 'באיחור', color: Colors.red),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('יעד: ${formatHomeCurrency(goalTargetAmount(goal))}'),
              Text('נותר: ${formatHomeCurrency(remaining)}'),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: progress),
              ),
            ],
          ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (goal.components.isEmpty)
                  const Text(
                    'אין רכיבים — היעד משתמש בסכום שהוזן ישירות.',
                    key: ValueKey('goal-no-components-text'),
                  )
                else
                  for (final component in goal.components)
                    _GoalComponentRow(component: component, goal: goal),
                const SizedBox(height: 12),
                const Divider(),
                for (final bucket in fundingInfo.buckets) _GoalBucketRow(bucket: bucket),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GoalBadge extends StatelessWidget {
  const _GoalBadge({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        text,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _GoalComponentRow extends StatelessWidget {
  const _GoalComponentRow({required this.component, required this.goal});
  final GoalComponent component;
  final Goal goal;

  @override
  Widget build(BuildContext context) {
    final dueDate = resolveComponentEffectiveDueDate(component, goal);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(component.name)),
          Text(dueDate),
          const SizedBox(width: 12),
          Text(formatHomeCurrency(component.amount)),
        ],
      ),
    );
  }
}

class _GoalBucketRow extends StatelessWidget {
  const _GoalBucketRow({required this.bucket});
  final GoalFundingBucket bucket;

  @override
  Widget build(BuildContext context) {
    final String status;
    if (bucket.isCompleted) {
      status = '✅ מומן';
    } else if (bucket.isOverdue) {
      status = '⚠️ באיחור';
    } else if (bucket.suggestedMonthly != null) {
      status = '💡 מוצע: ${formatHomeCurrency(bucket.suggestedMonthly!)}';
    } else {
      status = '';
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(bucket.label)),
          Text(formatHomeCurrency(bucket.remaining)),
          if (status.isNotEmpty) ...[
            const SizedBox(width: 12),
            Text(status),
          ],
        ],
      ),
    );
  }
}
