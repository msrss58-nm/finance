import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../domain/models/app_settings.dart';
import '../../security/auth_controller.dart';
import '../../security/pin_service.dart';
import '../../security/pin_verifier.dart';
import '../../security/security_errors.dart';
import '../security/auth_scope.dart';
import '../services/app_services_scope.dart';
import '../widgets/async_screen_body.dart';

/// Settings screen.
///
/// Milestone 6 shipped this as a read-only display of every setting the
/// migrated repository/domain layer supports. Milestone 7 adds exactly ONE
/// write path — PIN setup / change / disable (section 10, "integrate
/// minimally into Settings") — and nothing else. File import/export UI and
/// general settings editing still belong to later milestones.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Future<AppSettings>? _future;

  // See HomeScreen's identical didChangeDependencies() note: an
  // InheritedWidget lookup must not happen in initState().
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= AppServicesScope.of(context).settings.load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const ValueKey('screen-loaded-settings'),
      appBar: AppBar(title: const Text('הגדרות')),
      body: FutureBuilder<AppSettings>(
        future: _future,
        builder: (context, snapshot) => buildAsyncScreenBody<AppSettings>(
          snapshot,
          data: (settings) => _SettingsList(settings: settings),
        ),
      ),
    );
  }
}

class _SettingsList extends StatelessWidget {
  const _SettingsList({required this.settings});

  final AppSettings settings;

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
      ],
    );
  }
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
