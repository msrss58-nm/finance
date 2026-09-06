import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/raw/raw_backup_envelope.dart';
import 'package:familyfinance_pro/data/raw/raw_category_config.dart';
import 'package:familyfinance_pro/data/raw/raw_goal.dart';
import 'package:familyfinance_pro/data/raw/raw_item.dart';
import 'package:familyfinance_pro/data/raw/raw_settings.dart';

/// The raw layer's entire purpose is to be a lossless mirror of whatever is
/// actually in storage — every wrapper here must return exactly what it was
/// given, including fields this data layer doesn't otherwise model at all
/// (a genuinely unknown future field), so a save performed at the RAW level
/// (as BackupRepository does) can never lose data the way a save performed
/// through the domain layer might (see item_normalizer.dart's documented
/// itemToRawJson() limitation).
void main() {
  group('RawItemJson', () {
    test('round-trips including an unmodeled field', () {
      final original = {'id': 1, 'type': 'loan', 'customFields': {'x': 1}};
      expect(RawItemJson.fromJson(original).toJson(), original);
    });
  });

  group('RawSettingsJson', () {
    test('round-trips verbatim', () {
      final original = {'theme': 'dark', 'someFutureField': 42};
      expect(RawSettingsJson.fromJson(original).toJson(), original);
    });
  });

  group('RawCategoryConfigJson', () {
    test('round-trips verbatim', () {
      final original = {
        'income': {'label': 'x', 'baseType': 'income'},
      };
      expect(RawCategoryConfigJson.fromJson(original).toJson(), original);
    });
  });

  group('RawGoalJson family', () {
    test('a goal round-trips verbatim', () {
      final original = {'id': 'g1', 'title': 'x', 'components': []};
      expect(RawGoalJson.fromJson(original).toJson(), original);
    });

    test('a confirmedTransfer round-trips verbatim', () {
      final original = {'date': '2026-01-01', 'amount': 5};
      expect(RawConfirmedTransferJson.fromJson(original).toJson(), original);
    });
  });

  group('RawBackupEnvelope', () {
    test('data values round-trip as exact strings, never re-serialized', () {
      const exactString = '{"a":1,  "b":2}'; // deliberately non-canonical spacing
      final source = jsonEncode({
        'schemaVersion': 2,
        'data': {'family_finance_settings': exactString},
      });
      final env = RawBackupEnvelope.fromJsonString(source);
      expect(env.data['family_finance_settings'], exactString);
    });
  });
}
