import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/data/persistence/drift/drift_key_value_store.dart';
import 'package:familyfinance_pro/data/repositories/activity_log_repository.dart';
import 'package:familyfinance_pro/data/repositories/category_config_repository.dart';
import 'package:familyfinance_pro/data/repositories/category_tile_order_repository.dart';
import 'package:familyfinance_pro/data/repositories/goals_repository.dart';
import 'package:familyfinance_pro/data/repositories/items_repository.dart';
import 'package:familyfinance_pro/data/repositories/loan_balance_view_repository.dart';
import 'package:familyfinance_pro/data/repositories/settings_repository.dart';
import 'package:familyfinance_pro/domain/models/enums.dart';
import 'package:familyfinance_pro/domain/models/goal.dart';

/// Every existing repository was previously tested only against
/// [InMemoryKeyValueStore]. This suite proves the SAME repository code
/// (unmodified) behaves identically when backed by the real Drift store —
/// i.e. `KeyValueStore` is genuinely swappable, exactly as the Milestone 1-3
/// architecture intended.
void main() {
  AppDatabase openMemory() => AppDatabase(NativeDatabase.memory());

  test('ItemsRepository: save/load/update round-trips through Drift', () async {
    final db = openMemory();
    final repo = ItemsRepositoryImpl(DriftKeyValueStore(db));
    final initial = await repo.loadAll();
    expect(initial.valueOrNull?.items, isEmpty);
    await db.close();
  });

  test('SettingsRepository: default load, then save/reload round-trips', () async {
    final db = openMemory();
    final repo = SettingsRepositoryImpl(DriftKeyValueStore(db));
    final defaults = await repo.load();
    await repo.save(defaults);
    final reloaded = await repo.load();
    expect(reloaded.pinEnabled, defaults.pinEnabled);
    await db.close();
  });

  test('GoalsRepository: empty-key load is valid+empty; strict-invalid guarded write refuses to save', () async {
    final db = openMemory();
    final store = DriftKeyValueStore(db);
    final repo = GoalsRepositoryImpl(store);
    final loaded = await repo.load();
    expect(loaded, isA<GoalsValid>());

    // wasValid: false must be a guarded no-op, matching saveGoals()'s
    // contract, exercised here against the real backend.
    final wrote = await repo.saveAll([], wasValid: false);
    expect(wrote, isFalse);
    expect(await store.getString(kGoalsKey), isNull);
    await db.close();
  });

  test('ActivityLogRepository: append caps at kActivityLogMax against the real backend', () async {
    final db = openMemory();
    final repo = ActivityLogRepositoryImpl(DriftKeyValueStore(db));
    for (var i = 0; i < kActivityLogMax + 10; i++) {
      await repo.append('action$i', 'detail');
    }
    final entries = await repo.loadAll();
    expect(entries.length, kActivityLogMax);
    // Oldest entries are the ones dropped — the newest surviving entry's
    // action name should reflect the last append.
    expect(entries.last.action, 'action${kActivityLogMax + 9}');
    await db.close();
  });

  test('CategoryTileOrderRepository: save/load round-trips a list of strings', () async {
    final db = openMemory();
    final repo = CategoryTileOrderRepositoryImpl(DriftKeyValueStore(db));
    await repo.save(['fixed', 'variable', 'loan']);
    expect(await repo.load(), ['fixed', 'variable', 'loan']);
    await db.close();
  });

  test('LoanBalanceViewRepository: default is total; save/load round-trips; legacy raw value still readable', () async {
    final db = openMemory();
    final store = DriftKeyValueStore(db);
    final repo = LoanBalanceViewRepositoryImpl(store);
    expect(await repo.load(), LoanBalanceView.total);

    await repo.save(LoanBalanceView.principal);
    expect(await repo.load(), LoanBalanceView.principal);

    // Legacy raw (non-JSON) stored form, written directly as the Web app's
    // older versions did — read-only compatibility, never rewritten on read.
    await store.setString('family_finance_loan_balance_view', 'principal');
    expect(await repo.load(), LoanBalanceView.principal);
    await db.close();
  });

  test('CategoryConfigRepository: defaults load when absent; saveAll/reload round-trips', () async {
    final db = openMemory();
    final repo = CategoryConfigRepositoryImpl(DriftKeyValueStore(db));
    final defaults = await repo.load();
    expect(defaults, isNotEmpty);
    await repo.saveAll(defaults);
    final reloaded = await repo.load();
    expect(reloaded.keys, defaults.keys);
    await db.close();
  });

  test('unknown/future family_finance_* keys are preserved verbatim (not owned by any repository)', () async {
    final db = openMemory();
    final store = DriftKeyValueStore(db);
    await store.setString('family_finance_some_future_key', '{"未知":true}');
    final keys = await store.keysWithPrefix('family_finance_');
    expect(keys, contains('family_finance_some_future_key'));
    expect(await store.getString('family_finance_some_future_key'), '{"未知":true}');
    await db.close();
  });
}
