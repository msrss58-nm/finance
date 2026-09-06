import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../security/auth_state.dart';
import '../security/auth_scope.dart';

/// The PIN lock screen (Milestone 7, section 8).
///
/// Contains NO financial data of any kind — no balance, no item, no
/// category, not even a count. It reads nothing from [AppServicesScope];
/// there is no import of the data layer in this file at all, which is the
/// point: it is structurally incapable of rendering financial content.
///
/// Deliberately excluded, per section 8: biometrics, account recovery,
/// cloud reset, security questions.
///
/// ALSO DELIBERATELY EXCLUDED — a divergence from the Web app that is a
/// security decision, not an oversight: the Web app has a "שכחתי PIN" flow
/// that removes the PIN when the user types the word "איפוס"
/// (app.js `submitForgotPin`). Porting it would make this lock screen
/// bypassable by anyone holding the device, which would defeat the entire
/// milestone, and section 8 forbids adding account recovery. It is reported
/// as an open product question rather than silently reproduced.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  final TextEditingController _pinController = TextEditingController();
  Timer? _backoffTicker;

  @override
  void dispose() {
    _backoffTicker?.cancel();
    _pinController.dispose();
    super.dispose();
  }

  /// Keeps the "try again in N seconds" countdown live while backoff is
  /// active, and stops the timer as soon as it is not.
  void _syncBackoffTicker(Duration? remaining) {
    if (remaining == null || remaining <= Duration.zero) {
      _backoffTicker?.cancel();
      _backoffTicker = null;
      return;
    }
    _backoffTicker ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _submit() async {
    final pin = _pinController.text;
    if (pin.isEmpty) return;
    final controller = AuthScope.readOf(context);

    // Clear the field BEFORE awaiting, never after.
    //
    // Verification is slow (key derivation is deliberately expensive —
    // ~1.1 s measured on the target device). AuthController publishes the
    // rejected state, and this widget re-renders the error, while
    // `submitPin` is still unwinding; only afterwards would a post-await
    // clear run. Anything the user typed in that window — a whole retry PIN,
    // if they are quick — would be silently wiped, and the next submit would
    // read an empty field and do nothing at all, leaving the app stuck on
    // the lock screen with no feedback.
    //
    // Caught on the physical device, where the derivation is slow enough for
    // the window to be wide open; on the host, with the reduced test work
    // factor, it was invisible.
    _pinController.clear();

    await controller.submitPin(pin);
    // No local success/failure bookkeeping: the controller has already
    // published the new state and this widget rebuilds from it, so there is
    // nothing here that could drift out of sync with it.
  }

  @override
  Widget build(BuildContext context) {
    final state = AuthScope.of(context).state;
    final locked = state is AuthLocked ? state : null;
    final busy = state is AuthUnlocking;

    final retryAt = locked?.retryAllowedAt;
    final remaining = retryAt?.difference(DateTime.now());
    final inBackoff = remaining != null && remaining > Duration.zero;
    _syncBackoffTicker(remaining);

    final String? errorText;
    if (inBackoff) {
      errorText = 'יותר מדי ניסיונות. נסה/י שוב בעוד ${remaining.inSeconds + 1} שניות';
    } else if (locked?.lastAttemptFailed ?? false) {
      // Same wording as the live Web app's lock overlay.
      errorText = 'קוד שגוי, נסה/י שוב';
    } else {
      errorText = null;
    }

    final canSubmit = !busy && !inBackoff;

    return Scaffold(
      key: const ValueKey('lock-screen'),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.lock_outline, size: 56),
                  const SizedBox(height: 16),
                  Text(
                    'נעילת פרטיות',
                    style: Theme.of(context).textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'הזן/י את קוד ה-PIN כדי להמשיך',
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    key: const ValueKey('lock-pin-field'),
                    controller: _pinController,
                    autofocus: true,
                    // Deliberately NOT disabled while verifying.
                    //
                    // Tying `enabled` to `canSubmit` meant the field was
                    // disabled for the whole ~1.1 s derivation and then
                    // re-enabled. Disabling a TextField drops its focus and
                    // its platform input connection, and after a rejected
                    // attempt the field could no longer reliably receive
                    // input — a user who typed one wrong PIN was then stuck
                    // on the lock screen. Only backoff disables it now, and
                    // the submit BUTTON alone reflects the busy state.
                    enabled: !inBackoff,
                    obscureText: true,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    maxLength: 6,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: 'קוד PIN',
                      counterText: '',
                      border: const OutlineInputBorder(),
                      errorText: errorText,
                    ),
                    onSubmitted: (_) {
                      if (canSubmit) _submit();
                    },
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      key: const ValueKey('lock-submit'),
                      onPressed: canSubmit ? _submit : null,
                      child: busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('פתיחה'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'נעילת פרטיות למסך בלבד — הנתונים המקומיים אינם מוצפנים.',
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
