import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/forecast_screen.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/app/format/currency_format.dart';
import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/domain/cashflow/cashflow_engine.dart';
import 'package:familyfinance_pro/domain/dates/billing_dates.dart';
import 'package:familyfinance_pro/domain/forecast/projected_balance.dart';
import 'package:familyfinance_pro/domain/loans/loan_calculations.dart';
import 'package:familyfinance_pro/domain/models/app_settings.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

Widget _harness(AppServices services) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServicesScope(services: services, child: const ForecastScreen()),
      ),
    );

String _dateKey(DateTime d) {
  String pad(int n) => n < 10 ? '0$n' : '$n';
  return '${d.year}-${pad(d.month)}-${pad(d.day)}';
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

  testWidgets('unconfigured opening balance shows notice, no daily table', (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-forecast')), findsOneWidget);
    expect(find.byKey(const ValueKey('opening-balance-notice')), findsOneWidget);
    expect(find.byKey(const ValueKey('forecast-summary-card')), findsNothing);
    expect(find.byKey(const ValueKey('loans-remaining-card')), findsNothing);
    await db.close();
  });

  testWidgets('configured opening balance: next event and a daily row match domain output',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    final services = AppServices.fromDatabase(db);
    final store = DriftKeyValueStore(db);

    final now = DateTime.now();
    final bounds = getForecastPeriodBounds(now);
    final openingDateStr = _dateKey(bounds.periodStart);

    final items = <FinanceItem>[
      IncomeItem(
        id: const IntItemId(1),
        isArchived: false,
        title: 'משכורת',
        amount: 5000,
        day: LegacyNumericField(bounds.periodStart.day),
      ),
      FixedItem(
        id: const IntItemId(2),
        isArchived: false,
        title: 'שכירות',
        amount: 1000,
        day: LegacyNumericField(bounds.periodStart.day),
        where: const LegacyStringField('bank'),
        period: FixedPeriod.monthly,
        bimonthly: false,
      ),
      LoanItem(
        id: const IntItemId(3),
        isArchived: false,
        title: 'הלוואת רכב',
        originalAmount: const LegacyNumericField(12000),
        amount: 500,
        interest: const LegacyNumericField(0),
        day: const LegacyNumericField(10),
        total: const LegacyNumericField(24),
        start: '2026-01-10',
      ),
    ];

    await ItemsRepositoryImpl(store).saveAll(items);

    final openingBalance = OpeningBalanceConfig(
      amount: 1000,
      dateStr: openingDateStr,
      includedWithdrawalIds: const [],
    );
    await services.settings.save(
      AppSettings(
        theme: const LegacyStringField('system'),
        primaryColor: const LegacyStringField('green'),
        fontSize: const LegacyStringField('medium'),
        pinEnabled: false,
        openingBalance: openingBalance,
        notifications: const NotificationPrefs(),
        experimentalFlags: const {},
        legacy: LegacySettingsFields.empty,
      ),
    );

    // Compute the expected values directly via the same domain functions the
    // screen must call, with the exact same inputs — proving the screen
    // renders authoritative domain output, not a re-derived number.
    final categoryConfig = await services.categoryConfig.load();
    final expectedNextEvent =
        getNextCashflowEvent(items, today: now, categoryConfig: categoryConfig);
    final expectedMonthView = buildProjectedBalanceMonthView(
      refDate: now,
      opening: openingBalance,
      items: items,
      categoryConfig: categoryConfig,
    );
    final expectedLoansRemaining =
        getLoansRemainingSummary(items, today: now).totalRemaining;

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-loaded-forecast')), findsOneWidget);

    // Next event card.
    expect(expectedNextEvent, isNotNull);
    expect(
      find.text(formatSignedCurrency(expectedNextEvent!.amount)),
      findsOneWidget,
    );

    // The opening-day row (first day of the period) must match the domain
    // function's output for that same day exactly.
    expect(expectedMonthView.configured, isTrue);
    final openingDay = expectedMonthView.days.first;
    expect(openingDay.availability, DayAvailability.opening);
    expect(openingDay.income, 5000);
    expect(openingDay.expenses, 1000);
    expect(openingDay.projectedBalance, isNotNull);

    final dayRowFinder = find.byKey(ValueKey('forecast-day-${openingDay.dateKey}'));
    expect(dayRowFinder, findsOneWidget);

    final balanceFinder =
        find.byKey(ValueKey('forecast-day-balance-${openingDay.dateKey}'));
    expect(balanceFinder, findsOneWidget);
    final balanceWidget = tester.widget<Text>(balanceFinder);
    expect(balanceWidget.data, formatHomeCurrency(openingDay.projectedBalance!));

    // The loans-remaining card sits after ~30 daily rows, well past the
    // default test viewport — the ListView's sliver only builds near-viewport
    // children, so it must be scrolled into view before it can be found.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('loans-remaining-card')),
      500,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();

    // Loans-remaining insight card matches getLoansRemainingSummary() exactly.
    expect(
      find.text(formatHomeCurrency(expectedLoansRemaining)),
      findsOneWidget,
    );

    await db.close();
  });

  testWidgets('repository failure is shown as a real error, not a fake empty forecast',
      (tester) async {
    final db = AppDatabase(NativeDatabase.memory());
    await db.customSelect('select 1').getSingle();
    await db.close(); // closed on purpose — any query against it now throws
    final services = AppServices.fromDatabase(db);

    await tester.pumpWidget(_harness(services));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('screen-error-text')), findsOneWidget);
    expect(find.byKey(const ValueKey('next-event-card')), findsNothing);
  });
}
