import 'package:flutter/material.dart';

import '../../core/types/result.dart';
import '../../domain/cashflow/cashflow_engine.dart';
import '../../domain/forecast/projected_balance.dart';
import '../../domain/loans/loan_calculations.dart';
import '../format/currency_format.dart';
import '../services/app_services.dart';
import '../services/app_services_scope.dart';
import '../widgets/async_screen_body.dart';

/// Milestone 6 Forecast screen — the authoritative forward-looking cash-flow
/// view (CLAUDE.md Section 12), built on the Opening Balance model
/// (Section 11) and the unified cash-flow event engine. Every number here
/// comes straight from an already-tested domain function
/// (getNextCashflowEvent / buildProjectedBalanceMonthView /
/// getLoansRemainingSummary) — no financial arithmetic happens in this file.
///
/// SCOPE DECISION (approved, not an oversight): there is no ported
/// `getFixedCreditCardTotals` equivalent yet, so the Web app's "סך חיובי
/// כרטיס אשראי החודש" insight card is skipped entirely here rather than
/// guessing its formula.
///
/// SCOPE DECISION (approved): the Web app's SVG daily-balance chart is
/// replaced with a simple textual min/max summary — a custom-painted chart
/// is explicitly not required for this milestone.
class ForecastScreen extends StatefulWidget {
  const ForecastScreen({super.key});

  @override
  State<ForecastScreen> createState() => _ForecastScreenState();
}

class _ForecastScreenState extends State<ForecastScreen> {
  Future<_ForecastData>? _future;

  // AppServicesScope.of(context) reads an InheritedWidget — that must happen
  // in didChangeDependencies()/build(), never in initState(). The `??=`
  // guard ensures the load only starts once.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load(AppServicesScope.of(context));
  }

  static Future<_ForecastData> _load(AppServices services) async {
    final itemsOutcome = await services.items.loadAll();
    final items = switch (itemsOutcome) {
      DataOk(value: final v) => v.items,
      DataErr(error: final e) => throw e,
    };
    final categoryConfig = await services.categoryConfig.load();
    final settings = await services.settings.load();
    final today = DateTime.now();

    return _ForecastData(
      nextEvent: getNextCashflowEvent(items, today: today, categoryConfig: categoryConfig),
      monthView: buildProjectedBalanceMonthView(
        refDate: today,
        opening: settings.openingBalance,
        items: items,
        categoryConfig: categoryConfig,
      ),
      loansRemaining: getLoansRemainingSummary(items, today: today).totalRemaining,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-forecast'),
      appBar: AppBar(title: const Text('תחזית')),
      body: FutureBuilder<_ForecastData>(
        future: _future,
        builder: (context, snapshot) => buildAsyncScreenBody<_ForecastData>(
          snapshot,
          data: (d) => _ForecastBody(data: d),
        ),
      ),
    );
  }
}

class _ForecastData {
  final CashflowEvent? nextEvent;
  final ProjectedBalanceMonthView monthView;
  final double loansRemaining;

  const _ForecastData({
    required this.nextEvent,
    required this.monthView,
    required this.loansRemaining,
  });
}

class _ForecastBody extends StatelessWidget {
  const _ForecastBody({required this.data});
  final _ForecastData data;

  @override
  Widget build(BuildContext context) {
    final monthView = data.monthView;
    return ListView(
      key: const ValueKey('forecast-list'),
      padding: const EdgeInsets.all(16),
      children: [
        _NextEventCard(event: data.nextEvent),
        if (!monthView.configured) ...[
          const SizedBox(height: 16),
          const Card(
            key: ValueKey('opening-balance-notice'),
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'לא ניתן לחשב יתרה יומית לפני הגדרת יתרת התחלה.',
                key: ValueKey('opening-balance-notice-text'),
              ),
            ),
          ),
        ] else ...[
          const SizedBox(height: 16),
          Text(
            '📈 יתרה יומית צפויה — ${_formatPeriodLabel(monthView.periodStart, monthView.periodEnd)}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          _ForecastSummaryCard(days: monthView.days),
          const SizedBox(height: 16),
          Text('📋 פירוט יומי', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...monthView.days.map((day) => _DailyRow(day: day)),
          const SizedBox(height: 16),
          Card(
            key: const ValueKey('loans-remaining-card'),
            child: ListTile(
              title: const Text('יתרת הלוואות שנותרו'),
              trailing: Text(
                formatHomeCurrency(data.loansRemaining),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ],
    );
  }

  static String _formatPeriodLabel(DateTime start, DateTime end) =>
      '${_formatDateShort(start)} – ${_formatDateShort(end)}';

  static String _formatDateShort(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';
}

class _NextEventCard extends StatelessWidget {
  const _NextEventCard({required this.event});
  final CashflowEvent? event;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const ValueKey('next-event-card'),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('📊 האירוע הכספי הבא'),
            const SizedBox(height: 8),
            if (event == null)
              const Text('אין אירועים עתידיים', key: ValueKey('next-event-empty'))
            else ...[
              Text(
                formatSignedCurrency(event!.amount),
                key: const ValueKey('next-event-value'),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: event!.amount < 0 ? Colors.red : Colors.green,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                '${event!.title} · ${_formatDateFull(event!.date)}',
                key: const ValueKey('next-event-note'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _formatDateFull(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

class _ForecastSummaryCard extends StatelessWidget {
  const _ForecastSummaryCard({required this.days});
  final List<ProjectedBalanceMonthDay> days;

  @override
  Widget build(BuildContext context) {
    final balances = [
      for (final d in days)
        if (d.projectedBalance != null) d.projectedBalance!,
    ];

    final String summaryText;
    if (balances.isEmpty) {
      summaryText = 'אין נתונים זמינים לתקופה זו.';
    } else {
      final min = balances.reduce((a, b) => a < b ? a : b);
      final max = balances.reduce((a, b) => a > b ? a : b);
      summaryText =
          'יתרה מינימלית: ${formatHomeCurrency(min)} · יתרה מקסימלית: ${formatHomeCurrency(max)}';
    }

    return Card(
      key: const ValueKey('forecast-summary-card'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(summaryText, key: const ValueKey('forecast-summary')),
      ),
    );
  }
}

class _DailyRow extends StatelessWidget {
  const _DailyRow({required this.day});
  final ProjectedBalanceMonthDay day;

  @override
  Widget build(BuildContext context) {
    final balance = day.projectedBalance;
    final isNegative = balance != null && balance < 0;
    final balanceText = balance == null
        ? '—'
        : (isNegative ? '⚠ ${formatHomeCurrency(balance)}' : formatHomeCurrency(balance));

    return Card(
      key: ValueKey('forecast-day-${day.dateKey}'),
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ExpansionTile(
        title: Text(_formatDateFull(day.date)),
        subtitle: Text(
          'הכנסות: ${_fmtOrDash(day.income)}  ·  '
          'הוצאות: ${_fmtOrDash(day.expenses)}  ·  '
          'שינוי: ${_fmtSignedOrDash(day.net)}',
        ),
        trailing: Text(
          balanceText,
          key: ValueKey('forecast-day-balance-${day.dateKey}'),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isNegative ? Colors.red : null,
          ),
        ),
        children: day.events.isEmpty
            ? const [
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text('אין תנועות ביום זה'),
                  ),
                ),
              ]
            : day.events
                .map(
                  (annotated) => ListTile(
                    dense: true,
                    title: Text(annotated.event.title),
                    trailing: Text(
                      formatSignedCurrency(annotated.event.amount),
                      style: TextStyle(
                        color: annotated.event.amount < 0 ? Colors.red : Colors.green,
                      ),
                    ),
                  ),
                )
                .toList(),
      ),
    );
  }

  static String _fmtOrDash(num? n) => n == null ? '—' : formatHomeCurrency(n);
  static String _fmtSignedOrDash(num? n) => n == null ? '—' : formatSignedCurrency(n);

  static String _formatDateFull(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}
