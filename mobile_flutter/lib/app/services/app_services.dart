import '../../data/backup/backup_service.dart';
import '../../data/persistence/drift/app_database.dart';
import '../../data/persistence/drift/drift_key_value_store.dart';
import '../../data/repositories/activity_log_repository.dart';
import '../../data/repositories/category_config_repository.dart';
import '../../data/repositories/category_tile_order_repository.dart';
import '../../data/repositories/goals_repository.dart';
import '../../data/repositories/items_repository.dart';
import '../../data/repositories/loan_balance_view_repository.dart';
import '../../data/repositories/settings_repository.dart';

/// Milestone 6's composition root: the single place production repository
/// instances are constructed, once, from one opened [AppDatabase]. Screens
/// never construct a repository or touch [AppDatabase]/Drift themselves —
/// they receive this bundle via `AppServicesScope.of(context)`
/// (app_services_scope.dart) and talk only to repository interfaces.
///
/// Deliberately a plain immutable value class, not a singleton: exactly one
/// instance is created by [AppBootstrap] per app run and handed down through
/// the widget tree. Tests construct their own instance (typically over
/// `InMemoryKeyValueStore`, already used throughout the Milestone 1-4 test
/// suite) via [AppServices.new] directly — no database, no Drift, no
/// platform channel required.
class AppServices {
  final ItemsRepository items;
  final CategoryConfigRepository categoryConfig;
  final SettingsRepository settings;
  final GoalsRepository goals;
  final ActivityLogRepository activityLog;
  final CategoryTileOrderRepository categoryTileOrder;
  final LoanBalanceViewRepository loanBalanceView;
  final BackupRepository backup;

  const AppServices({
    required this.items,
    required this.categoryConfig,
    required this.settings,
    required this.goals,
    required this.activityLog,
    required this.categoryTileOrder,
    required this.loanBalanceView,
    required this.backup,
  });

  /// Production wiring: every repository shares the ONE [DriftKeyValueStore]
  /// backed by the ONE opened [db] — matching the pre-existing
  /// Milestone 1-4 architecture where every repository is just a thin
  /// JSON-normalization layer over the same flat `KeyValueStore` contract.
  factory AppServices.fromDatabase(AppDatabase db) {
    final store = DriftKeyValueStore(db);
    return AppServices(
      items: ItemsRepositoryImpl(store),
      categoryConfig: CategoryConfigRepositoryImpl(store),
      settings: SettingsRepositoryImpl(store),
      goals: GoalsRepositoryImpl(store),
      activityLog: ActivityLogRepositoryImpl(store),
      categoryTileOrder: CategoryTileOrderRepositoryImpl(store),
      loanBalanceView: LoanBalanceViewRepositoryImpl(store),
      backup: BackupRepositoryImpl(store),
    );
  }
}
