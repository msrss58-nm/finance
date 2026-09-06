import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/categories_screen.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

Widget _harness(AppServices services) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServicesScope(services: services, child: const CategoriesScreen()),
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

  testWidgets('default categories render, in kDefaultCategoryConfig key order, when no tile order is saved',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-categories')), findsOneWidget);
    for (final config in kDefaultCategoryConfig.values) {
      expect(find.text(config.label), findsOneWidget);
    }

    final expectedOrder = kDefaultCategoryConfig.keys.toList();
    final positions = [
      for (final key in expectedOrder)
        tester.getTopLeft(find.byKey(ValueKey('category-row-$key'))).dy,
    ];
    final sortedAscending = [...positions]..sort();
    expect(positions, sortedAscending);

    await db.close();
  });

  testWidgets('a saved custom tile order reorders the rendered category list', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final customOrder = ['dated', 'loan', 'variable', 'fixed', 'income'];
    await services.categoryTileOrder.save(customOrder);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    final positions = [
      for (final key in customOrder)
        tester.getTopLeft(find.byKey(ValueKey('category-row-$key'))).dy,
    ];
    final sortedAscending = [...positions]..sort();
    expect(positions, sortedAscending);

    await db.close();
  });

  testWidgets('shows active item counts per category, excluding archived items', (tester) async {
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
      FixedItem(
        id: const IntItemId(3),
        isArchived: false,
        title: 'חשמל',
        amount: 400,
        day: const LegacyNumericField(10),
        where: const LegacyStringField('bank'),
        period: FixedPeriod.monthly,
        bimonthly: false,
      ),
      FixedItem(
        id: const IntItemId(4),
        isArchived: true,
        archiveReason: ArchiveReason.manual,
        title: 'ארנונה (מאורכב)',
        amount: 200,
        day: const LegacyNumericField(5),
        where: const LegacyStringField('bank'),
        period: FixedPeriod.monthly,
        bimonthly: false,
      ),
    ]);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(
      find.descendant(
        of: find.byKey(const ValueKey('category-row-income')),
        matching: find.text('1 תנועות'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('category-row-fixed')),
        matching: find.text('2 תנועות'),
      ),
      findsOneWidget,
    );

    await db.close();
  });

  testWidgets('repository failure is shown as a real error, not a fabricated default category list',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await db.customSelect('select 1').getSingle();
    await db.close(); // closed on purpose — any query against it now throws
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-error-text')), findsOneWidget);
    expect(find.text('💰 הכנסות'), findsNothing);
  });
}
