import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/core/types/legacy_string_field.dart';
import 'package:familyfinance_pro/domain/cashflow/home_stats.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';

IncomeItem _income(int id, num amount, {bool archived = false}) => IncomeItem(
      id: IntItemId(id),
      isArchived: archived,
      title: 'income$id',
      amount: amount,
      day: const LegacyNumericField(1),
    );

VariableItem _variable(
  int id,
  num amount, {
  required String start,
  required int total,
  bool archived = false,
}) =>
    VariableItem(
      id: IntItemId(id),
      isArchived: archived,
      title: 'variable$id',
      originalAmount: LegacyNumericField(amount * total),
      amount: amount,
      day: const LegacyNumericField(1),
      total: LegacyNumericField(total),
      start: start,
      where: const LegacyStringField('bank'),
    );

FixedItem _fixed(
  int id,
  num amount, {
  required String where,
  bool archived = false,
}) =>
    FixedItem(
      id: IntItemId(id),
      isArchived: archived,
      title: 'fixed$id',
      amount: amount,
      day: const LegacyNumericField(1),
      where: LegacyStringField(where),
      period: FixedPeriod.monthly,
      bimonthly: false,
    );

void main() {
  group('getFixedBankVsCreditSplit', () {
    test('buckets active fixed items by effectiveWhere', () {
      final items = [
        _fixed(1, 1000, where: 'bank'),
        _fixed(2, 500, where: 'credit'),
        _fixed(3, 200, where: 'bank'),
      ];
      final split = getFixedBankVsCreditSplit(items, DateTime(2026, 9, 5));
      expect(split.bank, 1200);
      expect(split.credit, 500);
    });

    test('an unrecognized/missing where value defaults to bank (effectiveWhere semantics)', () {
      final items = [_fixed(1, 300, where: 'something_else')];
      final split = getFixedBankVsCreditSplit(items, DateTime(2026, 9, 5));
      expect(split.bank, 300);
      expect(split.credit, 0);
    });

    test('excludes archived items and non-fixed items', () {
      final items = [
        _fixed(1, 1000, where: 'bank', archived: true),
        _income(2, 5000),
      ];
      final split = getFixedBankVsCreditSplit(items, DateTime(2026, 9, 5));
      expect(split.bank, 0);
      expect(split.credit, 0);
    });

    test('empty list yields zeros', () {
      final split = getFixedBankVsCreditSplit(const [], DateTime(2026, 9, 5));
      expect(split.bank, 0);
      expect(split.credit, 0);
    });
  });

  group('getMonthlyIncomeTotal', () {
    test('sums only active income items', () {
      final items = [
        _income(1, 5000),
        _income(2, 3000),
        _income(3, 999, archived: true),
      ];
      expect(getMonthlyIncomeTotal(items), 8000);
    });

    test('ignores non-income items', () {
      final items = [
        _income(1, 1000),
        _variable(2, 200, start: '2026-01-01', total: 3),
      ];
      expect(getMonthlyIncomeTotal(items), 1000);
    });

    test('empty list yields 0', () {
      expect(getMonthlyIncomeTotal(const []), 0);
    });
  });

  group('getVariableMonthlyPaymentsTotal', () {
    test('includes a variable item that still has payments left', () {
      final items = [
        _variable(1, 300, start: '2026-08-01', total: 6),
      ];
      final total = getVariableMonthlyPaymentsTotal(
        items,
        categoryConfig: kDefaultCategoryConfig,
        today: DateTime(2026, 9, 5),
      );
      expect(total, 300);
    });

    test('excludes a variable item whose payments are exhausted', () {
      final items = [
        _variable(1, 300, start: '2020-01-01', total: 3),
      ];
      final total = getVariableMonthlyPaymentsTotal(
        items,
        categoryConfig: kDefaultCategoryConfig,
        today: DateTime(2026, 9, 5),
      );
      expect(total, 0);
    });

    test('excludes archived items and non-variable items', () {
      final items = [
        _variable(1, 300, start: '2026-08-01', total: 6, archived: true),
        _income(2, 5000),
      ];
      final total = getVariableMonthlyPaymentsTotal(
        items,
        categoryConfig: kDefaultCategoryConfig,
        today: DateTime(2026, 9, 5),
      );
      expect(total, 0);
    });
  });

  group('getDatedCategoryTotalForCurrentPeriod', () {
    test('sums a dated item falling inside the current 5th-to-4th period', () {
      final items = [
        DatedItem(
          id: const IntItemId(1),
          isArchived: false,
          title: 'חיוב',
          amount: 450,
          start: '2026-09-10',
        ),
      ];
      final total = getDatedCategoryTotalForCurrentPeriod(
        items,
        refDate: DateTime(2026, 9, 5),
        categoryConfig: kDefaultCategoryConfig,
      );
      expect(total, 450);
    });

    test('excludes a dated item outside the current period', () {
      final items = [
        DatedItem(
          id: const IntItemId(1),
          isArchived: false,
          title: 'חיוב',
          amount: 450,
          start: '2026-11-10',
        ),
      ];
      final total = getDatedCategoryTotalForCurrentPeriod(
        items,
        refDate: DateTime(2026, 9, 5),
        categoryConfig: kDefaultCategoryConfig,
      );
      expect(total, 0);
    });

    test('empty items yields 0', () {
      final total = getDatedCategoryTotalForCurrentPeriod(
        const [],
        refDate: DateTime(2026, 9, 5),
        categoryConfig: kDefaultCategoryConfig,
      );
      expect(total, 0);
    });
  });
}
