import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/backup/backup_service.dart';
import 'package:familyfinance_pro/data/backup/backup_validator.dart';
import 'package:familyfinance_pro/data/persistence/key_value_store.dart';
import 'package:familyfinance_pro/data/raw/raw_backup_envelope.dart';

import '../fixtures/backup_fixtures.dart';

RawBackupEnvelope _parse(Map<String, Object?> fixture) =>
    RawBackupEnvelope.fromJsonString(jsonEncode(fixture));

void main() {
  group('valid fixtures pass validateBackupShape', () {
    final validFixtures = <String, Map<String, Object?> Function()>{
      'fullV2BackupJson': fullV2BackupJson,
      'richV1BackupWithoutGoalsKeyJson': richV1BackupWithoutGoalsKeyJson,
      'minimalAbsentSchemaVersionBackupJson':
          minimalAbsentSchemaVersionBackupJson,
      'emptyGoalsV2BackupJson': emptyGoalsV2BackupJson,
      'nonEmptyGoalsV2BackupJson': nonEmptyGoalsV2BackupJson,
      'legacyRawLoanBalanceViewBackupJson': legacyRawLoanBalanceViewBackupJson,
      'categoryTileOrderBackupJson': categoryTileOrderBackupJson,
      'settingsWithZeroOpeningBalanceBackupJson':
          settingsWithZeroOpeningBalanceBackupJson,
      'activityLogBackupJson': activityLogBackupJson,
      'unknownFutureKeyBackupJson': unknownFutureKeyBackupJson,
      'mixedItemTypesBackupJson': mixedItemTypesBackupJson,
      'legacyTypingVariationsBackupJson': legacyTypingVariationsBackupJson,
      'settingsOpeningBalanceWithdrawalIdsAbsentBackupJson':
          settingsOpeningBalanceWithdrawalIdsAbsentBackupJson,
      'settingsOpeningBalanceWithdrawalIdsEmptyArrayBackupJson':
          settingsOpeningBalanceWithdrawalIdsEmptyArrayBackupJson,
    };

    validFixtures.forEach((name, build) {
      test('$name parses and passes validateBackupShape', () {
        final envelope = _parse(build());
        final result = validateBackupShape(envelope);
        expect(result.isValid, isTrue, reason: result.reason);
      });
    });
  });

  group('invalid fixtures fail validateBackupShape', () {
    test('v2 backup missing the mandatory goals key is invalid', () {
      final envelope = _parse(invalidV2MissingMandatoryGoalsKeyJson());
      expect(validateBackupShape(envelope).isValid, isFalse);
    });

    test('goals array with a hybrid confirmedTransfer is invalid', () {
      final envelope = _parse(invalidGoalsHybridConfirmedTransferJson());
      expect(validateBackupShape(envelope).isValid, isFalse);
    });
  });

  group('round trip through BackupRepositoryImpl is lossless', () {
    test('full v2 backup: restore into a fresh store then re-export byte-for-byte', () async {
      final envelope = _parse(fullV2BackupJson());
      final store = InMemoryKeyValueStore();
      final restoreResult = await BackupRepositoryImpl(store).restore(envelope);
      expect(restoreResult.isOk, isTrue);

      final reExported = await BackupRepositoryImpl(store).exportBackup();

      for (final entry in envelope.data.entries) {
        expect(
          reExported.data[entry.key],
          entry.value,
          reason: 'key ${entry.key} must survive byte-for-byte',
        );
      }
    });

    test('unknown future key backup: restore then re-export preserves it verbatim', () async {
      final envelope = _parse(unknownFutureKeyBackupJson());
      final store = InMemoryKeyValueStore();
      final restoreResult = await BackupRepositoryImpl(store).restore(envelope);
      expect(restoreResult.isOk, isTrue);

      final reExported = await BackupRepositoryImpl(store).exportBackup();

      for (final entry in envelope.data.entries) {
        expect(
          reExported.data[entry.key],
          entry.value,
          reason: 'key ${entry.key} must survive byte-for-byte',
        );
      }
      // Explicitly re-assert the opaque forward-compatible key by name.
      expect(
        reExported.data['family_finance_widget_layout'],
        envelope.data['family_finance_widget_layout'],
      );
    });
  });

  group('fixture #13 — null vs [] includedWithdrawalIds (raw JSON shape)', () {
    test('the absent-key fixture does not contain the key at the raw JSON level', () {
      final envelope =
          _parse(settingsOpeningBalanceWithdrawalIdsAbsentBackupJson());
      final settingsJson =
          jsonDecode(envelope.data['family_finance_settings']!) as Map;
      expect(
        settingsJson.containsKey('projectedBalanceOpeningIncludedWithdrawalIds'),
        isFalse,
      );
    });

    test('the empty-array fixture contains an explicit empty array at the raw JSON level', () {
      final envelope =
          _parse(settingsOpeningBalanceWithdrawalIdsEmptyArrayBackupJson());
      final settingsJson =
          jsonDecode(envelope.data['family_finance_settings']!) as Map;
      expect(
        settingsJson.containsKey('projectedBalanceOpeningIncludedWithdrawalIds'),
        isTrue,
      );
      expect(
        settingsJson['projectedBalanceOpeningIncludedWithdrawalIds'],
        isEmpty,
      );
    });
  });
}
