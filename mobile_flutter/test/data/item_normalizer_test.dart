import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/item_id.dart';
import 'package:familyfinance_pro/data/raw/raw_item.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/finance_item.dart';
import 'package:familyfinance_pro/domain/normalization/item_normalizer.dart';

void main() {
  group('income', () {
    test('parses a well-formed record', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 1, 'type': 'income', 'isArchived': false, 'title': 'משכורת',
        'amount': 12000, 'day': 1,
      }));
      final item = result.item as IncomeItem;
      expect(item.amount, 12000);
      expect(item.day.asInt(), 1);
    });
  });

  group('fixed', () {
    test('day/total as string still parses', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 2, 'type': 'fixed', 'isArchived': false, 'title': 'שכירות',
        'amount': 3000, 'day': '5', 'where': 'bank', 'period': 'monthly',
      }));
      final item = result.item as FixedItem;
      expect(item.day.asInt(), 5);
      expect(item.effectiveWhere, PaymentWhere.bank);
      expect(item.period, FixedPeriod.monthly);
    });

    test('day absent falls back safely (LegacyNumericField.asInt() null)', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 3, 'type': 'fixed', 'isArchived': false, 'title': 'ביטוח',
        'amount': 640, 'where': 'credit', 'period': 'monthly',
      }));
      final item = result.item as FixedItem;
      expect(item.day.asInt(), isNull);
      expect(item.effectiveWhere, PaymentWhere.credit);
    });

    test('bimonthly with valid start month', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 4, 'type': 'fixed', 'isArchived': false, 'title': 'ארנונה',
        'amount': 500, 'bimonthly': true, 'bimonthlyStartMonth': 9,
      }));
      final item = result.item as FixedItem;
      expect(item.bimonthly, isTrue);
      expect(item.bimonthlyStartMonth, 9);
    });

    test('unrecognized where produces a diagnostic but still resolves to bank', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 5, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'where': 'ביט',
      }));
      final item = result.item as FixedItem;
      expect(item.effectiveWhere, PaymentWhere.bank);
      expect(result.diagnostics, isNotEmpty);
    });
  });

  group('variable — where semantics', () {
    test('where=bank generates a real payment method', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 6, 'type': 'variable', 'isArchived': false, 'title': 'תשלום',
        'amount': 200, 'originalAmount': 1200, 'day': 10, 'total': 6,
        'where': 'bank',
      }));
      final item = result.item as VariableItem;
      expect(item.paymentMethod, VariablePaymentMethod.bank);
    });

    test('where=credit resolves to credit', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 7, 'type': 'variable', 'isArchived': false, 'title': 'תשלום',
        'amount': 200, 'day': 10, 'total': 6, 'where': 'credit',
      }));
      final item = result.item as VariableItem;
      expect(item.paymentMethod, VariablePaymentMethod.credit);
    });

    test('missing where stays null — must NEVER default to bank', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 8, 'type': 'variable', 'isArchived': false, 'title': 'תשלום ישן',
        'amount': 200, 'day': 10, 'total': '6',
      }));
      final item = result.item as VariableItem;
      expect(item.paymentMethod, isNull);
      expect(item.total.asInt(), 6);
    });
  });

  group('loan — source legacy values', () {
    test('exact payroll sentinel', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 9, 'type': 'loan', 'isArchived': false, 'title': 'הלוואה',
        'amount': 500, 'originalAmount': 50000, 'where': 'דרך תלוש השכר',
        'interest': '3.5', 'day': 1, 'total': 100,
      }));
      final item = result.item as LoanItem;
      expect(item.source, LoanSource.payroll);
      expect(item.interest.asNum(), 3.5);
    });

    test('legacy free-text bank name resolves to bank', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 10, 'type': 'loan', 'isArchived': false, 'title': 'הלוואה',
        'amount': 500, 'where': 'בנק הפועלים',
      }));
      final item = result.item as LoanItem;
      expect(item.source, LoanSource.bank);
    });
  });

  group('dated', () {
    test('parses a settlement item', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 11, 'type': 'dated', 'isArchived': false, 'title': 'חיוב אשראי',
        'amount': 1500, 'start': '2026-09-10',
      }));
      final item = result.item as DatedItem;
      expect(item.amount, 1500);
      expect(item.start, '2026-09-10');
    });
  });

  group('cashWithdrawal', () {
    test('has no displayCategory even if one leaks into raw json', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 1725500000000, 'type': 'cashWithdrawal', 'isArchived': false,
        'title': 'משיכה', 'amount': 300, 'start': '2026-09-01',
        'displayCategory': 'should-be-ignored',
      }));
      final item = result.item as CashWithdrawalItem;
      expect(item.displayCategory, isNull);
      expect(item.id, const IntItemId(1725500000000));
    });
  });

  group('unparseable items', () {
    test('missing id yields no item and a reported error', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'type': 'income', 'title': 'x', 'amount': 100,
      }));
      expect(result.item, isNull);
      expect(result.error, isNotNull);
    });

    test('non-numeric amount yields no item and a reported error', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 12, 'type': 'income', 'title': 'x', 'amount': 'abc',
      }));
      expect(result.item, isNull);
      expect(result.error, isNotNull);
    });

    test('unrecognized type yields no item', () {
      final result = normalizeItem(RawItemJson.fromJson({
        'id': 13, 'type': 'somethingNew', 'title': 'x', 'amount': 5,
      }));
      expect(result.item, isNull);
    });
  });

  group('RawItemJson round-trip', () {
    test('toJson() returns the exact original map, lossless', () {
      final original = {
        'id': 14, 'type': 'fixed', 'isArchived': false, 'title': 'x',
        'amount': 100, 'day': '5', 'unknownFutureField': 'kept-verbatim',
      };
      final raw = RawItemJson.fromJson(original);
      expect(raw.toJson(), original);
    });
  });

  group('itemToRawJson (domain -> raw)', () {
    test('a fixed item survives normalize -> serialize -> normalize', () {
      final original = RawItemJson.fromJson({
        'id': 15, 'type': 'fixed', 'isArchived': true, 'archiveReason': 'manual',
        'title': 'x', 'amount': 250, 'day': 12, 'where': 'credit',
        'period': 'שנתי', 'cardLast4': '1234',
      });
      final first = normalizeItem(original).item as FixedItem;
      final reRaw = RawItemJson.fromJson(itemToRawJson(first));
      final second = normalizeItem(reRaw).item as FixedItem;
      expect(second.amount, first.amount);
      expect(second.effectiveWhere, first.effectiveWhere);
      expect(second.where.raw, first.where.raw);
      expect(second.period, first.period);
      expect(second.cardLast4, first.cardLast4);
      expect(second.isArchived, isTrue);
      expect(second.archiveReason, first.archiveReason);
    });
  });
}
