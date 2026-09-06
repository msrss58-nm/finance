import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/backup/backup_transfer_service.dart';
import '../../data/files/backup_file_gateway.dart';
import '../../data/files/file_picker_backup_file_gateway.dart';
import '../../data/repositories/goals_reminder_settings_repository.dart';
import '../../domain/models/app_settings.dart';
import '../../notifications/goals_reminder_scheduler.dart';
import '../../notifications/notification_gateway.dart';
import '../../security/auth_controller.dart';
import '../../security/pin_service.dart';
import '../../security/pin_verifier.dart';
import '../../security/security_errors.dart';
import '../security/auth_scope.dart';
import '../services/app_services_scope.dart';
import '../services/backup_transfer_coordinator.dart';
import '../services/data_revision.dart';
import '../services/notification_scope.dart';
import '../widgets/async_screen_body.dart';

/// Settings screen.
///
/// Milestone 6 shipped this as a read-only display of every setting the
/// migrated repository/domain layer supports. Milestone 7 added exactly ONE
/// write path — PIN setup / change / disable. Milestone 8 adds the second:
/// native backup export/import, which is pure I/O over the already-approved
/// backup contract (see [BackupTransferService]). General settings editing
/// still belongs to a later milestone.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    this.fileGateway = const FilePickerBackupFileGateway(),
  });

  /// Injectable so widget tests can drive the export/import flows without a
  /// platform channel. Production uses the real native picker.
  final BackupFileGateway fileGateway;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Future<AppSettings>? _future;

  /// The backup CONTRACT (validate/export/restore). Cheap to build and
  /// stateless with respect to an operation — the operation itself is owned
  /// by [_coordinator], not by this screen.
  BackupTransferService? _backupService;

  /// Milestone 10 blocker fix: the export/import operation and its result no
  /// longer live in this `State`.
  ///
  /// The SAF picker backgrounds the app, Milestone 7 locks on `paused`, and
  /// `AuthGate` then does not build its child — so this screen is UNMOUNTED
  /// while a picker is open. Anything owned here would be destroyed exactly
  /// when the picker returned, which is what silently discarded validated
  /// imports and lost export results. The state now lives in a coordinator
  /// owned by the composition root, and this screen only renders it and
  /// presents its confirmation dialog.
  BackupTransferCoordinator? _coordinator;

  /// Used only when no [BackupTransferCoordinatorScope] is installed above
  /// this screen (bare widget tests). It is owned — and disposed — here, and
  /// therefore offers no lock-survival guarantee; production always finds the
  /// scope, which `app_bootstrap_backup_scope_test` pins down.
  BackupTransferCoordinator? _fallbackCoordinator;

  /// True while THIS screen is showing the confirmation dialog, so that being
  /// torn down mid-dialog can hand the claim back to the coordinator.
  bool _presentingConfirmation = false;

  /// Settings re-read after a successful restore.
  ///
  /// Rendered INSTEAD of the initial [_future] once it is set. Re-issuing
  /// the future instead would put the FutureBuilder back into its loading
  /// state for a frame, which destroys the ListView element — losing the
  /// scroll position and hiding the result message the user is waiting to
  /// read. The initial load still uses the FutureBuilder, so this screen's
  /// existing loading/error contract is unchanged.
  AppSettings? _reloadedSettings;

  // See HomeScreen's identical didChangeDependencies() note: an
  // InheritedWidget lookup must not happen in initState().
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppServicesScope.of(context);
    _future ??= services.settings.load();
    _backupService ??= BackupTransferService(
      repository: services.backup,
      gateway: widget.fileGateway,
    );
    if (_coordinator == null) {
      final scoped = BackupTransferCoordinatorScope.readOf(context);
      // The fallback still has to bump the same "data was replaced" signal the
      // scoped coordinator does — the production one is already wired to it by
      // the composition root, so this only wires the bare-harness case.
      _fallbackCoordinator = scoped == null
          ? BackupTransferCoordinator(
              dataRevision: DataRevisionScope.readOf(context),
            )
          : null;
      _coordinator = scoped ?? _fallbackCoordinator;
      _coordinator!.addListener(_onBackupStateChanged);
      // This screen exists, so it will present the confirmation and render the
      // result itself — the shell's "bring the user back to Settings" flag has
      // nothing left to do. Taking it here is what keeps that flag meaning
      // exactly "an operation resolved while Settings did not exist", so it
      // can never fire at some unrelated later moment.
      _coordinator!.takeReturnToSettings();
      // A remount after an unlock lands here: if a confirmation was still
      // pending when the app locked, this is what puts it back on screen.
      _maybeShowPendingConfirmation();
    }
  }

  void _onBackupStateChanged() {
    if (!mounted) return;
    setState(() {});
    _maybeShowPendingConfirmation();
  }

  @override
  void dispose() {
    // Torn down without a user decision — in practice AuthGate removing the
    // tree on a lock, which destroys the open dialog too. Handing the claim
    // back is what lets the confirmation be presented again after unlocking,
    // instead of the picked file being silently dropped.
    if (_presentingConfirmation) _coordinator?.releasePendingConfirmation();
    _coordinator?.removeListener(_onBackupStateChanged);
    _fallbackCoordinator?.dispose();
    super.dispose();
  }

  /// Both controls now only START the operation. Everything that has to
  /// survive the SAF round trip — and therefore a lock — belongs to the
  /// coordinator, which is not torn down when this screen is.
  void _exportBackup() {
    final service = _backupService;
    final coordinator = _coordinator;
    if (service == null || coordinator == null) return;
    unawaited(coordinator.startExport(service));
  }

  void _importBackup() {
    final service = _backupService;
    final coordinator = _coordinator;
    if (service == null || coordinator == null) return;
    unawaited(coordinator.startImport(service));
  }

  /// Presents the restore confirmation for a validated import that is waiting
  /// — whether it became ready a moment ago, or while the app was locked and
  /// this screen did not exist.
  ///
  /// Deferred to the end of the frame because this is reached from
  /// `didChangeDependencies`/a notification callback, where pushing a route is
  /// not allowed. The claim makes it one-shot: repeated rebuilds cannot open a
  /// second dialog for the same pending import.
  void _maybeShowPendingConfirmation() {
    final coordinator = _coordinator;
    if (coordinator == null || !coordinator.hasPendingConfirmation) return;
    if (_presentingConfirmation) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final ready = coordinator.claimPendingConfirmation();
      if (ready == null) return;
      _presentingConfirmation = true;

      final confirmation = await showDialog<_RestoreConfirmation>(
        context: context,
        builder: (dialogContext) => _RestoreConfirmDialog(ready: ready),
      );

      if (!mounted) {
        // The dialog did not close on a user decision — the tree was removed
        // underneath it (AuthGate, on a lock). dispose() has already handed
        // the claim back, so the confirmation returns after the unlock. The
        // import stays pending and, crucially, unwritten.
        return;
      }
      _presentingConfirmation = false;

      if (confirmation == null) {
        // A real dismissal by the user (Cancel, or tapping the barrier).
        coordinator.cancelPendingImport();
        return;
      }

      await coordinator.commitPendingImport(
        deleteExistingGoals: confirmation.deleteExistingGoals,
      );
      if (!mounted) return;
      await _reloadSettingsAfterRestore();
    });
  }

  /// Re-reads the settings a restore just wrote, without flashing the loading
  /// chrome and without losing the user's scroll position.
  ///
  /// If this screen is gone by the time the restore finishes, nothing is lost:
  /// a remounted screen loads its settings from scratch anyway, and the
  /// coordinator has already bumped [DataRevision] for the other screens.
  Future<void> _reloadSettingsAfterRestore() async {
    final settingsRepository = AppServicesScope.of(context).settings;
    AppSettings? reloaded;
    Object? reloadError;
    try {
      reloaded = await settingsRepository.load();
    } catch (e) {
      reloadError = e;
    }
    if (!mounted) return;

    setState(() {
      if (reloaded != null) {
        _reloadedSettings = reloaded;
      } else {
        // The restore itself succeeded, but the storage layer then failed to
        // read back what it wrote. That is a real failure and must be shown
        // through the existing error chrome rather than by leaving values on
        // screen that are no longer known to be current.
        _reloadedSettings = null;
        final failed = Future<AppSettings>.error(reloadError!);
        // Mark it observed so it is never reported as an unhandled async
        // error before the FutureBuilder subscribes (same pattern as
        // AppBootstrap's services future).
        unawaited(failed.then((_) {}, onError: (Object _, StackTrace _) {}));
        _future = failed;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-settings'),
      appBar: AppBar(title: const Text('הגדרות')),
      // The FutureBuilder stays in the tree unconditionally even when the
      // override is in use: keeping the widget SHAPE identical is what lets
      // Flutter reuse the ListView element across a post-restore refresh,
      // preserving the scroll position instead of jumping back to the top.
      body: FutureBuilder<AppSettings>(
        future: _future,
        builder: (context, snapshot) {
          final reloaded = _reloadedSettings;
          if (reloaded != null) return _buildList(reloaded);
          return buildAsyncScreenBody<AppSettings>(snapshot, data: _buildList);
        },
      ),
    );
  }

  Widget _buildList(AppSettings settings) => _SettingsList(
        settings: settings,
        backupState: _coordinator?.state ?? BackupUiState.idle,
        backupMessage: _coordinator?.message ?? '',
        backupBusy: _coordinator?.busy ?? false,
        onExport: _exportBackup,
        onImport: _importBackup,
      );
}

class _SettingsList extends StatelessWidget {
  const _SettingsList({
    required this.settings,
    required this.backupState,
    required this.backupMessage,
    required this.backupBusy,
    required this.onExport,
    required this.onImport,
  });

  final AppSettings settings;
  final BackupUiState backupState;
  final String backupMessage;
  final bool backupBusy;
  final VoidCallback onExport;
  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    final opening = settings.openingBalance;
    return ListView(
      key: const ValueKey('settings-list'),
      padding: const EdgeInsets.all(16),
      children: [
        _SectionHeader('יתרת התחלה'),
        _InfoTile(
          key: const ValueKey('settings-opening-balance'),
          label: 'סכום',
          value: opening == null ? 'לא הוגדר' : '₪${opening.amount}',
        ),
        _InfoTile(
          label: 'תאריך',
          value: opening?.dateStr ?? 'לא הוגדר',
        ),
        const SizedBox(height: 16),
        _SectionHeader('מראה'),
        _InfoTile(
          label: 'ערכת נושא',
          value: settings.theme.asStringOr('system'),
        ),
        _InfoTile(
          label: 'צבע ראשי',
          value: settings.primaryColor.asStringOr('green'),
        ),
        _InfoTile(
          label: 'גודל גופן',
          value: settings.fontSize.asStringOr('medium'),
        ),
        const SizedBox(height: 16),
        _SectionHeader('התראות'),
        _BoolInfoTile(label: 'תשלום קרוב', value: settings.notifications.upcomingPayment),
        _BoolInfoTile(label: 'הכנסה קרובה', value: settings.notifications.upcomingIncome),
        _BoolInfoTile(
          label: 'התחייבות שהושלמה',
          value: settings.notifications.completedObligation,
        ),
        const SizedBox(height: 16),
        // Deliberately NOT `settings.pinEnabled`: that legacy Web field is an
        // inert placeholder (CLAUDE.md section 11's read-only-legacy rule).
        // It is still loaded and still persisted — it is simply no longer
        // presented as if it were the live lock state. The real state comes
        // from PinService, the single source of truth for PIN configuration.
        const _PinSecuritySection(),
        const SizedBox(height: 16),
        _BackupSection(
          state: backupState,
          message: backupMessage,
          busy: backupBusy,
          onExport: onExport,
          onImport: onImport,
        ),
        const SizedBox(height: 16),
        const _GoalsReminderSection(),
      ],
    );
  }
}

/// Milestone 9's Settings control: the monthly Goals reminder switch.
///
/// Owns presentation and the opt-in gesture only. Every decision about
/// whether a reminder should exist, when it fires, and how the OS is told
/// belongs to [GoalsReminderScheduler]; nothing about Goals funding, dates
/// or notification scheduling is duplicated here.
class _GoalsReminderSection extends StatefulWidget {
  const _GoalsReminderSection();

  @override
  State<_GoalsReminderSection> createState() => _GoalsReminderSectionState();
}

class _GoalsReminderSectionState extends State<_GoalsReminderSection> {
  GoalsReminderScheduler? _scheduler;
  Future<_ReminderViewState>? _future;
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Assert-free probe: this screen is also mounted with no notification
    // wiring above it (navigation-shell tests, and before the database has
    // opened). Missing scope means "reminders unavailable" — an honest
    // disabled state, never a claim that a reminder is scheduled.
    final scheduler = NotificationScope.maybeOf(context);
    if (scheduler == null || identical(scheduler, _scheduler)) return;
    _scheduler = scheduler;
    _future = _read(scheduler);
  }

  static Future<_ReminderViewState> _read(
    GoalsReminderScheduler scheduler,
  ) async {
    final settings = await scheduler.currentSettings();
    final permission = await scheduler.currentPermission();
    return _ReminderViewState(settings: settings, permission: permission);
  }

  Future<void> _toggle(bool enable) async {
    final scheduler = _scheduler;
    if (_busy || scheduler == null) return;
    setState(() => _busy = true);
    // A failure here is reported through the refreshed view state, never as
    // a fabricated success and never as a crash.
    try {
      if (enable) {
        await scheduler.enable();
      } else {
        await scheduler.disable();
      }
    } catch (_) {
      // Deliberately swallowed: the scheduler already returns typed
      // outcomes, and an unmodelled platform throw must not take the
      // Settings screen down with it.
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _future = _read(scheduler);
    });
  }

  Future<void> _openSystemSettings() async {
    final scheduler = _scheduler;
    if (_busy || scheduler == null) return;
    setState(() => _busy = true);
    try {
      await scheduler.gateway.openSystemNotificationSettings();
    } catch (_) {
      // Not being able to open the OS screen is not an app error.
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _future = _read(scheduler);
    });
  }

  @override
  Widget build(BuildContext context) {
    final future = _future;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionHeader('תזכורות'),
        if (future == null)
          const _InfoTile(
            key: ValueKey('settings-goals-reminder-status'),
            label: 'תזכורת יעדים חודשית',
            value: 'לא זמין',
          )
        else
          FutureBuilder<_ReminderViewState>(
            future: future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const _InfoTile(
                  key: ValueKey('settings-goals-reminder-status'),
                  label: 'תזכורת יעדים חודשית',
                  value: 'טוען…',
                );
              }
              if (snapshot.hasError || !snapshot.hasData) {
                return const _InfoTile(
                  key: ValueKey('settings-goals-reminder-status'),
                  label: 'תזכורת יעדים חודשית',
                  value: 'לא זמין',
                );
              }
              return _buildLoaded(context, snapshot.data!);
            },
          ),
      ],
    );
  }

  Widget _buildLoaded(BuildContext context, _ReminderViewState view) {
    final denied =
        view.permission == NotificationPermissionStatus.denied;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          margin: const EdgeInsets.symmetric(vertical: 4),
          child: SwitchListTile(
            key: const ValueKey('settings-goals-reminder-switch'),
            title: const Text('תזכורת יעדים חודשית'),
            subtitle: const Text('תזכורת ב-2 בכל חודש להעברת הסכום לחיסכון'),
            value: view.settings.enabled,
            onChanged: _busy ? null : _toggle,
          ),
        ),
        if (view.settings.enabled && denied) ...[
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 4),
            child: Text(
              'ההתראות חסומות בהגדרות המכשיר, ולכן התזכורת לא תישלח.',
              key: const ValueKey('settings-goals-reminder-permission-denied'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
          OutlinedButton(
            key: const ValueKey('settings-goals-reminder-open-system'),
            onPressed: _busy ? null : _openSystemSettings,
            child: const Text('פתח הגדרות התראות'),
          ),
        ],
      ],
    );
  }
}

class _ReminderViewState {
  const _ReminderViewState({required this.settings, required this.permission});

  final GoalsReminderSettings settings;

  /// `null` when the platform state could not be read at all — rendered as
  /// "unavailable", never as "granted".
  final NotificationPermissionStatus? permission;
}


/// Which inline PIN form (if any) is currently open.
enum _PinFormMode { none, setup, change, disable }

/// The one write path this screen owns: PIN setup / change / disable.
///
/// Deliberately absent (Milestone 7, section 8 hard bans): biometrics, a
/// "forgot PIN" / recovery-word flow, and security questions. The existing
/// Web app has a reset word; porting it would make the lock bypassable by
/// anyone holding the device, so it is intentionally NOT here.
///
/// Nothing in this widget ever renders or logs the PIN, the salt or the
/// verifier. Every message shown comes from a fixed literal or from
/// [SecurityError.message], which is secret-free by contract.
class _PinSecuritySection extends StatefulWidget {
  const _PinSecuritySection();

  @override
  State<_PinSecuritySection> createState() => _PinSecuritySectionState();
}

class _PinSecuritySectionState extends State<_PinSecuritySection> {
  PinService? _pinService;
  AuthController? _auth;

  /// `null` while dependencies have not been resolved, or when there is no
  /// [AuthScope] above this screen at all.
  Future<bool>? _configuredFuture;

  final TextEditingController _currentPin = TextEditingController();
  final TextEditingController _newPin = TextEditingController();
  final TextEditingController _confirmPin = TextEditingController();

  _PinFormMode _mode = _PinFormMode.none;
  String? _error;
  bool _busy = false;

  // InheritedWidget lookups belong here, never in initState() — Flutter
  // throws "dependOnInheritedWidgetOfExactType() ... called before initState()
  // completed" otherwise.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pinService != null) return;
    // Assert-free probe: this screen is also mounted in contexts that have no
    // security scope above it (e.g. navigation-shell tests). Missing scope
    // means "PIN management unavailable" — an honest disabled state, never a
    // silent claim that no PIN is configured.
    final scope = context.getInheritedWidgetOfExactType<AuthScope>();
    if (scope == null) return;
    _pinService = AuthScope.pinServiceOf(context);
    _auth = AuthScope.readOf(context);
    _configuredFuture = _pinService!.isPinConfigured();
  }

  @override
  void dispose() {
    _currentPin.dispose();
    _newPin.dispose();
    _confirmPin.dispose();
    super.dispose();
  }

  void _clearFields() {
    _currentPin.clear();
    _newPin.clear();
    _confirmPin.clear();
  }

  void _openForm(_PinFormMode mode) {
    setState(() {
      _mode = mode;
      _error = null;
      _clearFields();
    });
  }

  void _cancelForm() {
    setState(() {
      _mode = _PinFormMode.none;
      _error = null;
      _clearFields();
    });
  }

  Future<void> _submit() async {
    final service = _pinService;
    if (_busy || service == null) return;

    final mode = _mode;
    final currentPin = _currentPin.text;
    final newPin = _newPin.text;
    final confirmPin = _confirmPin.text;

    // Local validation first, in the required order, so an obviously invalid
    // input never costs a KDF derivation.
    if (mode == _PinFormMode.setup || mode == _PinFormMode.change) {
      if (!isValidPinFormat(newPin)) {
        setState(() => _error = const InvalidPinFormat().message);
        return;
      }
      if (newPin != confirmPin) {
        setState(() => _error = 'הקודים אינם תואמים');
        return;
      }
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      switch (mode) {
        case _PinFormMode.setup:
          await service.setPin(newPin);
        case _PinFormMode.change:
          await service.changePin(currentPin: currentPin, newPin: newPin);
        case _PinFormMode.disable:
          await service.disablePin(currentPin: currentPin);
        case _PinFormMode.none:
          break;
      }
    } on SecurityError catch (e) {
      if (!mounted) return;
      // e.message is a fixed, secret-free Hebrew literal by contract.
      setState(() {
        _busy = false;
        _error = e.message;
      });
      return;
    } catch (_) {
      if (!mounted) return;
      // Never surface an untyped error's text: it is not under our control
      // and cannot be guaranteed secret-free. Never report success either.
      setState(() {
        _busy = false;
        _error = 'הפעולה נכשלה';
      });
      return;
    }

    // Lock state and the Android FLAG_SECURE window flag must follow the new
    // configuration immediately.
    await _auth?.refreshAfterConfigurationChange();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _mode = _PinFormMode.none;
      _error = null;
      _clearFields();
      _configuredFuture = service.isPinConfigured();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionHeader('אבטחה'),
        if (_configuredFuture == null)
          const _InfoTile(
            key: ValueKey('settings-pin-status'),
            label: 'נעילת PIN',
            value: 'לא זמין',
          )
        else
          FutureBuilder<bool>(
            future: _configuredFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const _InfoTile(
                  key: ValueKey('settings-pin-status'),
                  label: 'נעילת PIN',
                  value: 'טוען…',
                );
              }
              if (snapshot.hasError) {
                final error = snapshot.error;
                return _InfoTile(
                  key: const ValueKey('settings-pin-status'),
                  label: 'נעילת PIN',
                  value: error is SecurityError ? error.message : 'שגיאת אבטחה',
                );
              }
              return _buildConfigured(configured: snapshot.data ?? false);
            },
          ),
      ],
    );
  }

  Widget _buildConfigured({required bool configured}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InfoTile(
          key: const ValueKey('settings-pin-status'),
          label: 'נעילת PIN',
          value: configured ? 'PIN מוגדר' : 'PIN לא מוגדר',
        ),
        if (_mode == _PinFormMode.none)
          _buildActions(configured: configured)
        else
          _buildForm(),
      ],
    );
  }

  Widget _buildActions({required bool configured}) {
    if (!configured) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: FilledButton(
          key: const ValueKey('settings-pin-setup-button'),
          onPressed: () => _openForm(_PinFormMode.setup),
          child: const Text('הגדר PIN'),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: FilledButton(
              key: const ValueKey('settings-pin-change-button'),
              onPressed: () => _openForm(_PinFormMode.change),
              child: const Text('שנה קוד'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(
              key: const ValueKey('settings-pin-disable-button'),
              onPressed: () => _openForm(_PinFormMode.disable),
              child: const Text('בטל PIN'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    final needsCurrent = _mode == _PinFormMode.change || _mode == _PinFormMode.disable;
    final needsNew = _mode == _PinFormMode.setup || _mode == _PinFormMode.change;
    final error = _error;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (needsCurrent)
              _PinField(
                fieldKey: const ValueKey('pin-form-current'),
                label: 'קוד נוכחי',
                controller: _currentPin,
              ),
            if (needsNew) ...[
              _PinField(
                fieldKey: const ValueKey('pin-form-new'),
                label: 'קוד חדש',
                controller: _newPin,
              ),
              _PinField(
                fieldKey: const ValueKey('pin-form-confirm'),
                label: 'אימות קוד חדש',
                controller: _confirmPin,
              ),
            ],
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 4),
                child: Text(
                  error,
                  key: const ValueKey('pin-form-error'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    key: const ValueKey('pin-form-submit'),
                    onPressed: _busy ? null : _submit,
                    child: const Text('אישור'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    key: const ValueKey('pin-form-cancel'),
                    onPressed: _busy ? null : _cancelForm,
                    child: const Text('ביטול'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PinField extends StatelessWidget {
  const _PinField({
    required this.fieldKey,
    required this.label,
    required this.controller,
  });

  final Key fieldKey;
  final String label;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: TextField(
          key: fieldKey,
          controller: controller,
          obscureText: true,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          maxLength: 6,
          decoration: InputDecoration(
            labelText: label,
            counterText: '',
            border: const OutlineInputBorder(),
          ),
        ),
      );
}

/// Milestone 8's Settings controls: native backup export and import.
///
/// Pure presentation. Every decision about what a backup is, whether it is
/// valid and how it is written belongs to [BackupTransferService] ->
/// `BackupRepository`; none of that logic is duplicated here, and this
/// widget never touches a repository, the database or the PIN. Its state is
/// owned by [_SettingsScreenState] so that a post-restore reload of the
/// settings cannot destroy it.
class _BackupSection extends StatelessWidget {
  const _BackupSection({
    required this.state,
    required this.message,
    required this.busy,
    required this.onExport,
    required this.onImport,
  });

  final BackupUiState state;
  final String message;
  final bool busy;
  final VoidCallback onExport;
  final VoidCallback onImport;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionHeader('גיבוי ושחזור'),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Expanded(
                child: FilledButton(
                  key: const ValueKey('settings-backup-export-button'),
                  onPressed: busy ? null : onExport,
                  child: const Text('ייצוא גיבוי'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  key: const ValueKey('settings-backup-import-button'),
                  onPressed: busy ? null : onImport,
                  child: const Text('ייבוא גיבוי'),
                ),
              ),
            ],
          ),
        ),
        if (state != BackupUiState.idle)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 4),
            child: Row(
              children: [
                // The spinner runs only during genuine work — never while the
                // modal confirmation is waiting on the user.
                if (state == BackupUiState.working) ...[
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    message,
                    key: const ValueKey('settings-backup-status'),
                    style: TextStyle(color: _messageColor(context)),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Color? _messageColor(BuildContext context) => switch (state) {
        BackupUiState.validationFailure ||
        BackupUiState.restoreFailure ||
        BackupUiState.fileIoFailure =>
          Theme.of(context).colorScheme.error,
        _ => null,
      };
}


/// What the user confirmed. A `null` result (dialog dismissed/cancelled)
/// means "do nothing", which is why this is a value rather than a bool.
class _RestoreConfirmation {
  const _RestoreConfirmation({required this.deleteExistingGoals});
  final bool deleteExistingGoals;
}

class _RestoreConfirmDialog extends StatefulWidget {
  const _RestoreConfirmDialog({required this.ready});
  final BackupImportReady ready;

  @override
  State<_RestoreConfirmDialog> createState() => _RestoreConfirmDialogState();
}

class _RestoreConfirmDialogState extends State<_RestoreConfirmDialog> {
  /// Deliberately unchecked by default, exactly as the Web app's own
  /// legacy-restore checkbox is: restoring a pre-Goals backup must not
  /// silently delete goals the user created since.
  bool _deleteExistingGoals = false;

  @override
  Widget build(BuildContext context) {
    final ready = widget.ready;
    return AlertDialog(
      key: const ValueKey('backup-import-confirm-dialog'),
      title: const Text('שחזור מגיבוי'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('קובץ: ${ready.fileName}'),
          const SizedBox(height: 8),
          Text(
            'השחזור יחליף את הנתונים הפיננסיים הקיימים באפליקציה '
            'בנתונים מתוך קובץ הגיבוי (${ready.keyCount} מפתחות). '
            'לא ניתן לבטל את הפעולה לאחר אישור.',
          ),
          if (!ready.isGoalsAware) ...[
            const SizedBox(height: 8),
            const Text('הגיבוי נוצר לפני שהיו יעדים, ולכן היעדים הקיימים יישמרו.'),
            CheckboxListTile(
              key: const ValueKey('backup-import-delete-goals-checkbox'),
              contentPadding: EdgeInsets.zero,
              value: _deleteExistingGoals,
              onChanged: (v) => setState(() => _deleteExistingGoals = v ?? false),
              title: const Text('מחק את היעדים הקיימים'),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          key: const ValueKey('backup-import-confirm-cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('ביטול'),
        ),
        FilledButton(
          key: const ValueKey('backup-import-confirm-approve'),
          onPressed: () => Navigator.of(context).pop(
            _RestoreConfirmation(deleteExistingGoals: _deleteExistingGoals),
          ),
          child: const Text('שחזר'),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 8),
        child: Text(title, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(title: Text(label), trailing: Text(value)),
      );
}

class _BoolInfoTile extends StatelessWidget {
  const _BoolInfoTile({required this.label, required this.value});
  final String label;
  final bool value;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(
          title: Text(label),
          trailing: Icon(value ? Icons.check_circle : Icons.cancel_outlined),
        ),
      );
}
