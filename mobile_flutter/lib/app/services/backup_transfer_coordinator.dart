import 'package:flutter/widgets.dart';

import '../../data/backup/backup_transfer_service.dart';
import 'data_revision.dart';

/// Presentable state of the single backup operation.
///
/// Moved out of `SettingsScreen` in the Milestone 10 blocker fix: the state
/// has to outlive that screen, so it can no longer be a private enum inside
/// it. The eight values and their meanings are unchanged — the three failure
/// kinds stay distinguishable because "not a valid backup", "the restore
/// failed" and "the native file layer failed" are three different situations
/// for the user.
enum BackupUiState {
  idle,
  working,
  awaitingConfirmation,
  cancelled,
  success,
  validationFailure,
  restoreFailure,
  fileIoFailure,
}

/// Owns ONE backup export/import operation for the lifetime of the app run.
///
/// ## Why this exists (the Milestone 10 blocker)
///
/// Opening the native SAF picker backgrounds the app. Milestone 7's lock
/// policy correctly locks on `AppLifecycleState.paused`, and `AuthGate` then
/// does not build its child at all — so the whole navigation shell, including
/// `SettingsScreen`, is UNMOUNTED while the picker is still open. When the
/// picker returned, the screen's `async` method resumed inside a disposed
/// `State` and hit `if (!mounted) return;`:
///   - a validated import was silently discarded before the confirmation
///     dialog could be shown, so `commitImport()` was never reached;
///   - a successful export's result message was silently lost.
/// Physically reproduced 2/2 on the QA device.
///
/// The fix is ownership, NOT weaker locking: the operation is driven from
/// here, one level above everything `AuthGate` tears down (this object is
/// created and disposed by `_AppBootstrapState`, exactly like [DataRevision]
/// and `PendingNotificationRoute`). The `await` that spans the picker now
/// lives in an object that is never disposed mid-flight, so the result always
/// lands. The lock still happens, immediately and unchanged.
///
/// ## What it is not
///
/// It is not a second restore engine. Every judgement about what a backup is,
/// whether it is valid, and how it is written still belongs to
/// [BackupTransferService] -> `BackupRepository`: this class calls
/// `exportToFile()`, `prepareImport()` and `commitImport()` and adds nothing
/// but ordering and presentable state. There is no parsing, no validation and
/// no write logic here.
///
/// ## Security
///
/// Nothing in this file imports the security layer, so the PIN, its
/// salt/verifier and `ff_pin_v1` are unreachable from it — the same
/// structural isolation [BackupTransferService] already has. The only
/// operation data held across a lock is the [BackupImportReady] the user
/// already picked, in memory only: never written to disk, the database or
/// secure storage, and cleared the moment the operation resolves. If the OS
/// kills the process while a confirmation is pending, the pending import
/// simply ceases to exist — nothing was written, so there is nothing to
/// recover and no partial restore is possible.
class BackupTransferCoordinator extends ChangeNotifier {
  BackupTransferCoordinator({this.dataRevision});

  /// Bumped HERE rather than from the screen, so a restore that completes
  /// while the app is locked still refreshes the other screens once it is
  /// unlocked. Nullable so a bare test harness can omit it.
  final DataRevision? dataRevision;

  BackupUiState _state = BackupUiState.idle;
  String _message = '';
  bool _busy = false;

  /// The validated import waiting for the user's explicit confirmation.
  ///
  /// Its presence is what makes the confirmation re-presentable after an
  /// unlock. It is cleared before the write starts, so it can never be
  /// replayed into a second restore.
  BackupImportReady? _pendingImport;

  /// Held only while an operation is in flight, so [commitPendingImport] can
  /// reach the same service the user started with. Cleared when the operation
  /// resolves.
  BackupTransferService? _service;

  /// True while a presenter is actually showing the confirmation dialog, so
  /// two rebuilds cannot open two dialogs for one pending import.
  bool _confirmationClaimed = false;

  /// One-shot "the user should be looking at Settings" signal, consumed by
  /// the navigation shell after an unlock rebuilds it.
  bool _returnToSettings = false;

  BackupUiState get state => _state;
  String get message => _message;

  /// Disables both backup buttons. Deliberately separate from [state] so the
  /// spinner can stop while the modal confirmation is up without re-enabling
  /// the controls underneath it.
  bool get busy => _busy;

  /// A fully validated import is waiting for the user's decision. Nothing has
  /// been written while this is true.
  bool get hasPendingConfirmation => _pendingImport != null;

  static BackupUiState stateForFailure(BackupTransferFailureKind kind) =>
      switch (kind) {
        BackupTransferFailureKind.validation => BackupUiState.validationFailure,
        BackupTransferFailureKind.fileIo => BackupUiState.fileIoFailure,
        BackupTransferFailureKind.restore => BackupUiState.restoreFailure,
        BackupTransferFailureKind.storage => BackupUiState.fileIoFailure,
      };

  void _set(BackupUiState state, String message, {required bool busy}) {
    _state = state;
    _message = message;
    _busy = busy;
    notifyListeners();
  }

  /// Terminal transition: the operation is over, controls are re-enabled, no
  /// operation data is retained, and the user is owed a look at Settings.
  void _finish(BackupUiState state, String message) {
    _pendingImport = null;
    _confirmationClaimed = false;
    _service = null;
    _returnToSettings = true;
    _set(state, message, busy: false);
  }

  /// Collect -> validate -> encode -> native "save as" -> write.
  ///
  /// The `await` below spans the SAF dialog, i.e. spans a lock. The file is
  /// written by the platform before this returns, so the result is reported
  /// once and the write is never repeated.
  Future<void> startExport(BackupTransferService service) async {
    if (_busy) return;
    _service = service;
    _set(BackupUiState.working, 'מייצא גיבוי…', busy: true);

    final BackupExportOutcome outcome;
    try {
      outcome = await service.exportToFile();
    } catch (_) {
      // Never surface an untyped error's text (not ours, not guaranteed
      // secret-free) and never report success.
      _finish(BackupUiState.fileIoFailure, 'ייצוא הגיבוי נכשל');
      return;
    }

    switch (outcome) {
      case BackupExportSaved(fileName: final name):
        _finish(BackupUiState.success, 'הגיבוי נשמר: $name');
      case BackupExportCancelled():
        _finish(BackupUiState.cancelled, 'הייצוא בוטל — לא נשמר קובץ');
      case BackupExportFailed(kind: final kind, message: final message):
        _finish(stateForFailure(kind), message);
    }
  }

  /// Phase 1: pick + read + decode + FULL validation. Writes nothing — there
  /// is no write path reachable from [BackupTransferService.prepareImport].
  ///
  /// On success the validated result is PARKED here instead of being handed
  /// straight to a dialog, because the app may well be locked at this moment.
  Future<void> startImport(BackupTransferService service) async {
    if (_busy) return;
    _service = service;
    _set(BackupUiState.working, 'קורא את קובץ הגיבוי…', busy: true);

    final BackupImportPreparation prepared;
    try {
      prepared = await service.prepareImport();
    } catch (_) {
      _finish(BackupUiState.fileIoFailure, 'קריאת קובץ הגיבוי נכשלה');
      return;
    }

    switch (prepared) {
      case BackupImportReady():
        _pendingImport = prepared;
        _returnToSettings = true;
        // Controls stay disabled: the operation is not over, it is waiting
        // for a decision that may only be taken after an unlock.
        _set(BackupUiState.awaitingConfirmation, 'ממתין לאישור…', busy: true);
      case BackupImportCancelled():
        _finish(BackupUiState.cancelled, 'הייבוא בוטל — לא בוצע שינוי בנתונים');
      case BackupImportRejected(kind: final kind, message: final message):
        _finish(stateForFailure(kind), message);
    }
  }

  /// Claims the right to present the confirmation, or returns `null` if there
  /// is nothing pending or someone is already presenting it.
  ///
  /// The claim is what makes the dialog one-shot across rebuilds; the
  /// presenter must [releasePendingConfirmation] if it goes away without a
  /// user decision (which is exactly what a lock does to it).
  BackupImportReady? claimPendingConfirmation() {
    final pending = _pendingImport;
    if (pending == null || _confirmationClaimed) return null;
    _confirmationClaimed = true;
    return pending;
  }

  /// The presenter was destroyed WITHOUT a user decision — in practice
  /// `AuthGate` tearing the tree down on a lock, which also destroys the open
  /// dialog (Milestone 7's "transients must not remain accessible after
  /// locking"). The import stays pending so the confirmation is presented
  /// again after the unlock, instead of being silently dropped.
  void releasePendingConfirmation() {
    if (_pendingImport == null || !_confirmationClaimed) return;
    _confirmationClaimed = false;
  }

  /// Phase 2: the ONLY write path, reached only with a [BackupImportReady]
  /// that only successful validation can produce, and only after the user
  /// explicitly confirmed.
  ///
  /// The pending import is cleared BEFORE the write starts, so no rebuild,
  /// re-entry or second confirmation can replay it into a second restore.
  Future<void> commitPendingImport({required bool deleteExistingGoals}) async {
    final ready = _pendingImport;
    final service = _service;
    if (ready == null || service == null) return;
    _pendingImport = null;
    _confirmationClaimed = false;
    _set(BackupUiState.working, 'משחזר נתונים…', busy: true);

    final BackupRestoreResult result;
    try {
      result = await service.commitImport(
        ready,
        deleteExistingGoalsForLegacyBackup: deleteExistingGoals,
      );
    } catch (_) {
      _finish(BackupUiState.restoreFailure, 'השחזור נכשל');
      return;
    }

    switch (result) {
      case BackupRestoreSucceeded(writtenKeys: final keys):
        // Only now — after the restore actually reported success — is the
        // rest of the app told the data was replaced.
        dataRevision?.markDataReplaced();
        _finish(BackupUiState.success, 'השחזור הושלם (${keys.length} מפתחות)');
      case BackupRestoreFailed(kind: final kind, message: final message):
        _finish(stateForFailure(kind), message);
    }
  }

  /// The user declined the restore (or dismissed the dialog). Discards the
  /// pending import; zero writes have happened by construction.
  void cancelPendingImport() {
    if (_pendingImport == null) return;
    _finish(BackupUiState.cancelled, 'הייבוא בוטל — לא בוצע שינוי בנתונים');
  }

  /// Consumed exactly once by the navigation shell, so an operation that
  /// resolved while the app was locked brings the user back to Settings —
  /// where its confirmation or its result is — instead of the default Home
  /// that rebuilding the shell would otherwise produce.
  bool takeReturnToSettings() {
    final value = _returnToSettings;
    _returnToSettings = false;
    return value;
  }
}

/// Publishes the one [BackupTransferCoordinator] to the screens below it.
///
/// Same InheritedWidget pattern as [DataRevisionScope] and
/// `PendingNotificationRouteScope`: one instance, created and owned by the
/// composition root, no singleton and no service locator.
class BackupTransferCoordinatorScope
    extends InheritedNotifier<BackupTransferCoordinator> {
  const BackupTransferCoordinatorScope({
    super.key,
    required BackupTransferCoordinator coordinator,
    required super.child,
  }) : super(notifier: coordinator);

  /// Non-subscribing lookup. `SettingsScreen` attaches its own listener
  /// instead, so it behaves identically whether it found a scope or fell back
  /// to a screen-owned coordinator.
  ///
  /// Returns `null` where no scope is installed — several existing widget
  /// tests mount `SettingsScreen` bare, and a missing scope must degrade to
  /// "no lock-survival guarantee", never a crash.
  static BackupTransferCoordinator? readOf(BuildContext context) => context
      .getInheritedWidgetOfExactType<BackupTransferCoordinatorScope>()
      ?.notifier;
}
