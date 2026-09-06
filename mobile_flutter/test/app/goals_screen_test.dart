import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/format/currency_format.dart';
import 'package:familyfinance_pro/app/screens/goals_screen.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/domain/models/goal.dart';

Widget _harness(AppServices services) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServicesScope(services: services, child: const GoalsScreen()),
      ),
    );

Goal _goal({
  required String id,
  required String title,
  required String dueDate,
  required num targetAmount,
  List<GoalComponent> components = const [],
}) {
  return Goal(
    id: id,
    title: title,
    dueDate: dueDate,
    targetAmount: targetAmount,
    savedAmount: 0,
    components: components,
    isArchived: false,
    createdAt: DateTime.utc(2026, 1, 1).toIso8601String(),
    updatedAt: DateTime.utc(2026, 1, 2).toIso8601String(),
    confirmedTransfers: const [],
  );
}

void main() {
  testWidgets('shows a loading indicator before data resolves', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));

    expect(find.byKey(const ValueKey('screen-loading')), findsOneWidget);
    await tester.pumpAndSettle();
    await db.close();
  });

  testWidgets('empty valid goals: shows empty state, no crash', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-goals')), findsOneWidget);
    expect(find.text('עדיין אין יעדי חיסכון פעילים.'), findsOneWidget);
    expect(find.byKey(const ValueKey('goals-invalid-card')), findsNothing);
    await db.close();
  });

  testWidgets('goal with components: expanding shows each component name/date/amount',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    // Due dates chosen well beyond "today" so the funding bucket for each
    // component is neither completed nor overdue — keeping this test
    // focused on the component-list rendering rather than funding-state
    // rendering (covered separately below).
    await services.goals.saveAll([
      _goal(
        id: 'g1',
        title: 'חופשה',
        dueDate: '2028-12-01',
        targetAmount: 5000,
        components: const [
          GoalComponent(id: 'c1', name: 'טיסות', amount: 3000, dueDate: '2028-06-01'),
          GoalComponent(id: 'c2', name: 'מלון', amount: 2000, dueDate: '2028-08-01'),
        ],
      ),
    ], wasValid: true);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.text('חופשה'), findsOneWidget);
    // Collapsed: components not yet visible.
    expect(find.text('טיסות'), findsNothing);

    await tester.tap(find.byType(ExpansionTile));
    await tester.pumpAndSettle();

    // Each component's name/amount legitimately appears twice: once in the
    // component list, once again as its funding bucket's label/amount (a
    // bucket is built per-component) — so assert presence, not exclusivity.
    // The component's own due date, however, is unique to the component row.
    expect(find.text('2028-06-01'), findsOneWidget);
    expect(find.text('2028-08-01'), findsOneWidget);
    expect(find.text('טיסות'), findsWidgets);
    expect(find.text(formatHomeCurrency(3000)), findsWidgets);
    expect(find.text('מלון'), findsWidgets);
    expect(find.text(formatHomeCurrency(2000)), findsWidgets);
    await db.close();
  });

  testWidgets('goal without components: expanding shows the no-components message',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await services.goals.saveAll([
      _goal(id: 'g2', title: 'חיסכון חירום', dueDate: '2027-01-01', targetAmount: 10000),
    ], wasValid: true);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(ExpansionTile));
    await tester.pumpAndSettle();

    expect(
      find.text('אין רכיבים — היעד משתמש בסכום שהוזן ישירות.'),
      findsOneWidget,
    );
    await db.close();
  });

  testWidgets('invalid stored goals data: shows the warning card with reason, not a crash',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final store = DriftKeyValueStore(db);
    // Bypass the repository's own guarded saveAll (which refuses to write
    // invalid data) by writing malformed raw JSON directly to the key, so
    // load() returns GoalsInvalid on read.
    await store.setString(kGoalsKey, 'not valid json {');

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('goals-invalid-card')), findsOneWidget);
    expect(find.text('⚠️ לא ניתן לטעון את נתוני היעדים'), findsOneWidget);
    final reasonWidget = tester.widget<Text>(
      find.byKey(const ValueKey('goals-invalid-reason')),
    );
    expect(reasonWidget.data, contains('malformed JSON'));
    expect(find.text('עדיין אין יעדי חיסכון פעילים.'), findsNothing);
    await db.close();
  });

  testWidgets('repository failure is shown as a real error, not a fake empty state',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await db.customSelect('select 1').getSingle();
    await db.close(); // closed on purpose — any query against it now throws
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-error-text')), findsOneWidget);
    expect(find.text('עדיין אין יעדי חיסכון פעילים.'), findsNothing);
  });
}
