import 'package:flutter/material.dart';

import '../../core/types/result.dart';
import '../../domain/cashflow/cashflow_engine.dart';
import '../../domain/cashflow/home_stats.dart';
import '../../domain/forecast/projected_balance.dart';
import '../../domain/loans/loan_calculations.dart';
import '../../domain/loans/variable_calculations.dart';
import '../../domain/models/enums.dart';
import '../../domain/models/finance_item.dart';
import '../format/currency_format.dart';
import '../services/app_services.dart';
import '../services/app_services_scope.dart';
import '../widgets/async_screen_body.dart';

/// Milestone 6 Home screen — ports the current approved Home information
/// hierarchy (see the Web-reference spec gathered for this milestone):
/// hero ("יתרה צפויה להיום"), monthly snapshot (income/expenses), category
/// tiles (fixed/variable/loan/dated with their bank/credit/payroll
/// breakdowns), the two remaining-balance stat tiles, "מה דורש תשומת לב"
/// (next event), and "פעילות אחרונה" (recent items).
///
/// Deliberately NOT ported in this milestone (scoped out, not forgotten):
/// the ATM-withdrawal draft-row editor, the in-place opening-balance edit
/// form triggered from the hero tap, and the in-app notification list —
/// these are editing/management flows, not information display, and this
/// milestone's scope is the UI port of approved information, using
/// already-approved domain functions, without opening new write paths.
/// A bare "income" category tile is also omitted since its value would
/// only duplicate the snapshot's income figure.
///
/// Every number on this screen comes from an already-tested domain
/// function (or a thin, separately-tested composition of them in
/// home_stats.dart) — no financial arithmetic happens in this file.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Future<_HomeData>? _future;

  // AppServicesScope.of(context) reads an InheritedWidget — that must
  // happen in didChangeDependencies()/build(), never in initState(), so the
  // dependency is correctly registered. The `??=` guard ensures the load
  // only starts once, even though didChangeDependencies() can run again
  // later (e.g. on a theme/locale change) without restarting it.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load(AppServicesScope.of(context));
  }

  static Future<_HomeData> _load(AppServices services) async {
    final itemsOutcome = await services.items.loadAll();
    final items = switch (itemsOutcome) {
      DataOk(value: final v) => v.items,
      DataErr(error: final e) => throw e,
    };
    final categoryConfig = await services.categoryConfig.load();
    final settings = await services.settings.load();
    final today = DateTime.now();

    final fixedSplit = getFixedBankVsCreditSplit(items, today);

    final rawLoanSplit = getLoanBankVsPayrollSplit(items, today: today);
    final loanSplit = roundLoanSplitForDisplay(rawLoanSplit.bank, rawLoanSplit.payroll);

    return _HomeData(
      heroResult: getProjectedBalanceToday(
        today: today,
        opening: settings.openingBalance,
        items: items,
        categoryConfig: categoryConfig,
      ),
      monthlyIncome: getMonthlyIncomeTotal(items),
      monthlyExpenses: getHomeTotalExpensesForCurrentPeriod(
        items,
        refDate: today,
        categoryConfig: categoryConfig,
      ),
      fixedBank: fixedSplit.bank,
      fixedCredit: fixedSplit.credit,
      loanSplit: loanSplit,
      variableMonthlyTotal: getVariableMonthlyPaymentsTotal(
        items,
        categoryConfig: categoryConfig,
        today: today,
      ),
      datedMonthlyTotal: getDatedCategoryTotalForCurrentPeriod(
        items,
        refDate: today,
        categoryConfig: categoryConfig,
      ),
      variableRemaining: getVariableRemainingBalance(
        items,
        categoryConfig: categoryConfig,
        today: today,
      ),
      loansRemaining: getLoansRemainingSummary(items, today: today).totalRemaining,
      nextEvent: getNextCashflowEvent(items, today: today, categoryConfig: categoryConfig),
      recentActivity: _recentActivity(items),
    );
  }

  /// The last 4 non-archived items in STORED array order, most-recent-first
  /// — matches app.js's `getRecentActivity(items, 4)`, which takes the tail
  /// of the items array (append order) rather than sorting by id (ids can
  /// be legacy strings that don't sort chronologically).
  static List<FinanceItem> _recentActivity(List<FinanceItem> items) {
    final active = items.where((i) => !i.isArchived).toList();
    final tail = active.length > 4 ? active.sublist(active.length - 4) : active;
    return tail.reversed.toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-home'),
      appBar: AppBar(title: const Text('בית')),
      body: FutureBuilder<_HomeData>(
        future: _future,
        builder: (context, snapshot) => buildAsyncScreenBody<_HomeData>(
          snapshot,
          data: (d) => _HomeBody(data: d),
        ),
      ),
    );
  }
}

class _HomeData {
  final ProjectedBalanceTodayResult heroResult;
  final num monthlyIncome;
  final num monthlyExpenses;
  final num fixedBank;
  final num fixedCredit;
  final LoanSplitDisplay loanSplit;
  final num variableMonthlyTotal;
  final num datedMonthlyTotal;
  final num variableRemaining;
  final double loansRemaining;
  final CashflowEvent? nextEvent;
  final List<FinanceItem> recentActivity;

  const _HomeData({
    required this.heroResult,
    required this.monthlyIncome,
    required this.monthlyExpenses,
    required this.fixedBank,
    required this.fixedCredit,
    required this.loanSplit,
    required this.variableMonthlyTotal,
    required this.datedMonthlyTotal,
    required this.variableRemaining,
    required this.loansRemaining,
    required this.nextEvent,
    required this.recentActivity,
  });
}

class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.data});
  final _HomeData data;

  @override
  Widget build(BuildContext context) {
    return ListView(
      key: const ValueKey('home-list'),
      padding: const EdgeInsets.all(16),
      children: [
        _HeroCard(result: data.heroResult),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _SnapshotCard(
                key: const ValueKey('snapshot-income'),
                label: 'הכנסות',
                value: data.monthlyIncome,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SnapshotCard(
                key: const ValueKey('snapshot-expenses'),
                label: 'סך הכול הוצאות',
                value: data.monthlyExpenses,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _CategoryTile(
          key: const ValueKey('category-tile-fixed'),
          label: 'הוצאות קבועות',
          amount: data.fixedBank + data.fixedCredit,
          breakdown: 'מהבנק: ${formatHomeCurrency(data.fixedBank)}  ·  באשראי: ${formatHomeCurrency(data.fixedCredit)}',
        ),
        _CategoryTile(
          key: const ValueKey('category-tile-variable'),
          label: 'תשלומים החודש',
          amount: data.variableMonthlyTotal,
        ),
        _CategoryTile(
          key: const ValueKey('stat-tile-variable-remaining'),
          label: 'יתרת תשלומים שונים',
          amount: data.variableRemaining,
        ),
        _CategoryTile(
          key: const ValueKey('category-tile-loan'),
          label: 'תשלומי הלוואות החודש',
          amount: data.loanSplit.total,
          breakdown:
              'מהבנק: ${formatHomeCurrency(data.loanSplit.bank)}  ·  דרך תלוש השכר: ${formatHomeCurrency(data.loanSplit.payroll)}',
        ),
        _CategoryTile(
          key: const ValueKey('stat-tile-loans-remaining'),
          label: 'יתרת הלוואות',
          amount: data.loansRemaining,
        ),
        _CategoryTile(
          key: const ValueKey('category-tile-dated'),
          label: 'חיוב כרטיס אשראי',
          amount: data.datedMonthlyTotal,
        ),
        const SizedBox(height: 16),
        Text('מה דורש תשומת לב', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (data.nextEvent == null)
          const SizedBox.shrink()
        else
          Card(
            key: const ValueKey('attention-card'),
            child: ListTile(
              title: Text(data.nextEvent!.title),
              subtitle: Text(
                'צפוי ב-${_formatDate(data.nextEvent!.date)}',
              ),
              trailing: Text(
                formatSignedCurrency(data.nextEvent!.amount),
                style: TextStyle(
                  color: data.nextEvent!.amount < 0 ? Colors.red : Colors.green,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        const SizedBox(height: 16),
        Text('פעילות אחרונה', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (data.recentActivity.isEmpty)
          const SizedBox.shrink()
        else
          ...data.recentActivity.map(
            (item) => Card(
              key: ValueKey('recent-activity-${item.id.toJson()}'),
              child: ListTile(
                leading: Icon(_iconFor(item.type)),
                title: Text(item.title),
                trailing: Text(
                  formatSignedCurrency(
                    item.type == ItemType.income ? _amountOf(item) : -_amountOf(item),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  static num _amountOf(FinanceItem item) => switch (item) {
        IncomeItem(:final amount) => amount,
        FixedItem(:final amount) => amount,
        VariableItem(:final amount) => amount,
        LoanItem(:final amount) => amount,
        DatedItem(:final amount) => amount,
        CashWithdrawalItem(:final amount) => amount,
      };

  static IconData _iconFor(ItemType type) => switch (type) {
        ItemType.income => Icons.attach_money,
        ItemType.fixed => Icons.home_outlined,
        ItemType.variable => Icons.shopping_cart_outlined,
        ItemType.loan => Icons.account_balance_outlined,
        ItemType.dated => Icons.credit_card_outlined,
        ItemType.cashWithdrawal => Icons.local_atm_outlined,
      };

  static String _formatDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.result});
  final ProjectedBalanceTodayResult result;

  @override
  Widget build(BuildContext context) {
    final (String amountText, String statusText, Color color) = switch (result) {
      ProjectedBalanceUnconfigured() => (
          'לא הוגדרה',
          'כדי לחשב יתרה יומית יש להגדיר יתרת התחלה פעם אחת.',
          Colors.grey,
        ),
      ProjectedBalanceFuture(:final openingDateStr) => (
          '—',
          'החישוב יתחיל בתאריך $openingDateStr.',
          Colors.grey,
        ),
      ProjectedBalanceAvailable(:final projectedBalance, :final isNegative) => (
          formatHomeCurrency(projectedBalance),
          'מחושב לפי יתרת ההתחלה והתנועות המתוכננות עד היום — אינה יתרת בנק מאומתת.',
          isNegative ? Colors.red : Colors.green,
        ),
    };

    return Card(
      key: const ValueKey('hero-card'),
      color: color.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('יתרה צפויה להיום'),
            const SizedBox(height: 8),
            Text(
              amountText,
              key: const ValueKey('hero-amount'),
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(color: color, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(statusText, key: const ValueKey('hero-status')),
          ],
        ),
      ),
    );
  }
}

class _SnapshotCard extends StatelessWidget {
  const _SnapshotCard({super.key, required this.label, required this.value});
  final String label;
  final num value;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 4),
              Text(formatHomeCurrency(value), style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      );
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({super.key, required this.label, required this.amount, this.breakdown});
  final String label;
  final num amount;
  final String? breakdown;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(
          title: Text(label),
          subtitle: breakdown == null ? null : Text(breakdown!),
          trailing: Text(
            formatHomeCurrency(amount),
            style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
          ),
        ),
      );
}
