import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/core/types/legacy_numeric_field.dart';
import 'package:familyfinance_pro/domain/models/category_config.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/normalization/legacy_resolvers.dart';

void main() {
  group('LegacyNumericField', () {
    test('day as number', () {
      expect(const LegacyNumericField(15).asInt(), 15);
    });
    test('day as numeric string', () {
      expect(const LegacyNumericField('15').asInt(), 15);
    });
    test('day absent (null)', () {
      expect(const LegacyNumericField(null).asInt(), isNull);
    });
    test('total as decimal string', () {
      expect(const LegacyNumericField('123.45').asNum(), 123.45);
    });
    test('interest as int', () {
      expect(const LegacyNumericField(4).asNum(), 4);
    });
    test('garbage string yields null, never throws', () {
      expect(const LegacyNumericField('abc').asInt(), isNull);
      expect(const LegacyNumericField('abc').asNum(), isNull);
    });
  });

  group('round2', () {
    // CORRECTION (Milestone 2): an earlier version of this group asserted
    // round2(1.005) == 1.0, derived from an ASSUMED implementation of
    // `Math.round(n * 100) / 100`. The real app.js:1907 is
    // `Math.round((n + Number.EPSILON) * 100) / 100`. Every value below was
    // re-derived by running that real formula under node.
    test('the EPSILON term lifts a just-below-boundary value onto it', () {
      // node: round2(1.005) === 1.01  (WITHOUT the epsilon term it is 1.0)
      expect(round2(1.005), 1.01);
    });
    test('rounds a clean half-cent up', () {
      expect(round2(1.115), 1.12); // node: 1.12
    });
    test('a non-tie value is unaffected by the epsilon', () {
      expect(round2(2.5), 2.5); // node: 2.5
      expect(round2(-1.5), -1.5); // node: -1.5
      expect(round2(1.0049999), 1.0); // node: 1
    });
    test('NEGATIVE ties break towards +Infinity (JS Math.round), not away from zero', () {
      // This is where Dart's own `.round()` disagrees with JS: Dart would
      // give -0.13 / -0.38 here. node: -0.12 and -0.37.
      expect(round2(-0.125), -0.12);
      expect(round2(-0.375), -0.37);
    });
    test('negative non-tie values match JS', () {
      expect(round2(-2.675), -2.67); // node: -2.67
      expect(round2(-1.005), -1.0); // node: -1
    });
  });

  group('jsIsSafeInteger (Number.isSafeInteger parity)', () {
    // Expected values derived directly from Node/V8:
    //   Number.isSafeInteger(5)                     -> true
    //   Number.isSafeInteger(5.0)                   -> true  (same double, no fraction)
    //   Number.isSafeInteger(5.5)                    -> false
    //   Number.isSafeInteger(0)                      -> true
    //   Number.isSafeInteger(-3)                     -> true
    //   Number.isSafeInteger(9007199254740991)       -> true   (MAX_SAFE_INTEGER)
    //   Number.isSafeInteger(9007199254740992)       -> false  (MAX_SAFE_INTEGER + 1)
    //   Number.isSafeInteger(-9007199254740991)      -> true
    //   Number.isSafeInteger(NaN)                    -> false
    //   Number.isSafeInteger(Infinity)               -> false
    //   Number.isSafeInteger(-Infinity)              -> false
    //   Number.isSafeInteger(1.0000000001)           -> false
    //   Number.isSafeInteger(2.5)                    -> false
    test('an int within range is safe', () {
      expect(jsIsSafeInteger(5), isTrue);
    });
    test('an integral double (the JSON token 5.0) is ALSO safe — JS makes no int/double distinction', () {
      expect(jsIsSafeInteger(5.0), isTrue);
    });
    test('a fractional double is not safe', () {
      expect(jsIsSafeInteger(5.5), isFalse);
      expect(jsIsSafeInteger(2.5), isFalse);
      expect(jsIsSafeInteger(1.0000000001), isFalse);
    });
    test('zero is safe', () {
      expect(jsIsSafeInteger(0), isTrue);
    });
    test('a negative integer is safe (the sign is a separate, later check)', () {
      expect(jsIsSafeInteger(-3), isTrue);
    });
    test('JS MAX_SAFE_INTEGER (2^53 - 1) is safe', () {
      expect(jsIsSafeInteger(9007199254740991), isTrue);
      expect(jsIsSafeInteger(-9007199254740991), isTrue);
    });
    test('one beyond MAX_SAFE_INTEGER is NOT safe', () {
      expect(jsIsSafeInteger(9007199254740992), isFalse);
      expect(jsIsSafeInteger(-9007199254740992), isFalse);
    });
    test('an integral double beyond MAX_SAFE_INTEGER is NOT safe', () {
      expect(jsIsSafeInteger(9007199254740992.0), isFalse);
    });
    test('NaN and Infinity are never safe', () {
      expect(jsIsSafeInteger(double.nan), isFalse);
      expect(jsIsSafeInteger(double.infinity), isFalse);
      expect(jsIsSafeInteger(double.negativeInfinity), isFalse);
    });
    test('a non-number is never safe', () {
      expect(jsIsSafeInteger('5'), isFalse);
      expect(jsIsSafeInteger(null), isFalse);
      expect(jsIsSafeInteger(true), isFalse);
    });
  });

  group('isValidDateStr', () {
    test('accepts a real calendar date', () {
      expect(isValidDateStr('2026-09-05'), isTrue);
    });
    test('rejects a clamped/invalid date (Feb 30)', () {
      expect(isValidDateStr('2027-02-30'), isFalse);
    });
    test('rejects wrong shape', () {
      expect(isValidDateStr('05/09/2026'), isFalse);
    });
    test('rejects null', () {
      expect(isValidDateStr(null), isFalse);
    });
  });

  group('isValidCanonicalIsoTimestamp', () {
    test('accepts a canonical toISOString()-shaped value', () {
      expect(isValidCanonicalIsoTimestamp('2026-09-05T10:00:00.000Z'), isTrue);
    });
    test('rejects a date-only string', () {
      expect(isValidCanonicalIsoTimestamp('2026-09-05'), isFalse);
    });
    test('rejects a numeric-offset timestamp', () {
      expect(
        isValidCanonicalIsoTimestamp('2026-09-05T10:00:00.000+02:00'),
        isFalse,
      );
    });
  });

  group('sanitizeFiniteAmount', () {
    test('accepts zero', () {
      expect(sanitizeFiniteAmount(0), 0);
    });
    test('accepts a negative amount (overdrawn balance)', () {
      expect(sanitizeFiniteAmount(-42.5), -42.5);
    });
    test('rejects an empty string', () {
      expect(sanitizeFiniteAmount(''), isNull);
    });
    test('rejects non-numeric input', () {
      expect(sanitizeFiniteAmount('abc'), isNull);
    });
  });

  group('resolveEffectiveWhere (fixed items)', () {
    test('exact "credit" resolves to credit', () {
      expect(resolveEffectiveWhere('credit'), PaymentWhere.credit);
    });
    test('missing/null defaults to bank', () {
      expect(resolveEffectiveWhere(null), PaymentWhere.bank);
    });
    test('unrecognized legacy value defaults to bank', () {
      expect(resolveEffectiveWhere('בנק הפועלים'), PaymentWhere.bank);
    });
  });

  group('resolveVariablePaymentMethod (variable items)', () {
    test('explicit bank', () {
      expect(resolveVariablePaymentMethod('bank'), VariablePaymentMethod.bank);
    });
    test('explicit credit', () {
      expect(resolveVariablePaymentMethod('credit'), VariablePaymentMethod.credit);
    });
    test('missing stays null — never defaults to bank', () {
      expect(resolveVariablePaymentMethod(null), isNull);
    });
    test('unrecognized legacy value stays null', () {
      expect(resolveVariablePaymentMethod('something else'), isNull);
    });
  });

  group('resolveLoanSource', () {
    test('exact payroll sentinel resolves to payroll', () {
      expect(resolveLoanSource(kLoanPayrollSentinel), LoanSource.payroll);
    });
    test('legacy free-text bank name resolves to bank', () {
      expect(resolveLoanSource('בנק לאומי'), LoanSource.bank);
    });
    test('missing resolves to bank', () {
      expect(resolveLoanSource(null), LoanSource.bank);
    });
  });

  group('resolveFixedPeriod', () {
    test('שנתי resolves to yearly', () {
      expect(resolveFixedPeriod('שנתי'), FixedPeriod.yearly);
    });
    test('חודשי resolves to monthly', () {
      expect(resolveFixedPeriod('חודשי'), FixedPeriod.monthly);
    });
    test('missing resolves to monthly', () {
      expect(resolveFixedPeriod(null), FixedPeriod.monthly);
    });
  });

  group('resolveFixedIsBimonthly', () {
    test('true + valid month is bimonthly', () {
      expect(resolveFixedIsBimonthly(true, 9), isTrue);
    });
    test('true + missing month is NOT bimonthly (malformed data)', () {
      expect(resolveFixedIsBimonthly(true, null), isFalse);
    });
    test('true + out-of-range month is NOT bimonthly', () {
      expect(resolveFixedIsBimonthly(true, 13), isFalse);
    });
    test('false is never bimonthly regardless of month', () {
      expect(resolveFixedIsBimonthly(false, 9), isFalse);
    });
  });

  group('resolveEffectiveDay', () {
    test('own valid day wins', () {
      final day = resolveEffectiveDay(
        day: const LegacyNumericField(10),
        categoryKeyOrType: 'fixed',
        categoryConfig: kDefaultCategoryConfig,
      );
      expect(day, 10);
    });
    test('falls back to category default when own day invalid', () {
      final config = {
        ...kDefaultCategoryConfig,
        'fixed': const CategoryConfig(
          key: 'fixed',
          label: 'x',
          baseType: CategoryBaseType.fixed,
          defaultDayOfMonth: 20,
        ),
      };
      final day = resolveEffectiveDay(
        day: const LegacyNumericField(null),
        categoryKeyOrType: 'fixed',
        categoryConfig: config,
      );
      expect(day, 20);
    });
    test('falls back to 1 when neither own day nor category default is valid', () {
      final day = resolveEffectiveDay(
        day: const LegacyNumericField('not a day'),
        categoryKeyOrType: 'unknown-category',
        categoryConfig: kDefaultCategoryConfig,
      );
      expect(day, 1);
    });
  });
}
