import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/home_screen.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

Widget _harness(AppServices services) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServicesScope(services: services, child: const HomeScreen()),
      ),
    );

void main() {
  testWidgets('shows a loading indicator before data resolves', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));

    expect(find.byKey(const ValueKey('screen-loading')), findsOneWidget);
    await tester.pumpAndSettle();
    await db.close();
  });

  testWidgets('empty data: hero shows unconfigured state, no crash', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-home')), findsOneWidget);
    expect(find.text('לא הוגדרה'), findsOneWidget);
    expect(find.byKey(const ValueKey('attention-card')), findsNothing);
    await db.close();
  });

  testWidgets('populated data: snapshot income/expenses reflect real items', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final store = DriftKeyValueStore(db);
    await ItemsRepositoryImpl(store).saveAll([
      IncomeItem(
        id: const IntItemId(1),
        isArchived: false,
        title: 'משכורת',
        amount: 10000,
        day: const LegacyNumericField(1),
      ),
      FixedItem(
        id: const IntItemId(2),
        isArchived: false,
        title: 'שכירות',
        amount: 3000,
        day: const LegacyNumericField(1),
        where: const LegacyStringField('bank'),
        period: FixedPeriod.monthly,
        bimonthly: false,
      ),
    ]);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.text('₪10,000'), findsOneWidget);
    await db.close();
  });

  testWidgets('repository failure is shown as a real error, not a fake empty state', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await db.customSelect('select 1').getSingle();
    await db.close(); // closed on purpose — any query against it now throws
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-error-text')), findsOneWidget);
    expect(find.byKey(const ValueKey('hero-card')), findsNothing);
  });
}
