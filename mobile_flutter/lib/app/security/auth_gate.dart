import 'package:flutter/material.dart';

import '../../security/auth_state.dart';
import '../screens/lock_screen.dart';
import 'auth_scope.dart';

/// The gate that sits ABOVE the sensitive app shell (Milestone 7, sections
/// 4, 8, 11).
///
/// TWO DESIGN DECISIONS THAT CARRY THE SECURITY GUARANTEE:
///
/// 1. It is mounted through `MaterialApp.builder`, i.e. ABOVE the
///    Navigator, not inside `home:`. A widget inside `home:` sits on the
///    Navigator's first route, so any dialog or modal sheet — which is a
///    LATER route — would paint ON TOP of it. A lock screen that a stray
///    dialog can cover is not a lock screen. Mounted above the Navigator,
///    nothing the app can push is ever above this gate.
///
/// 2. When access is not allowed, [child] is NOT BUILT AT ALL — it is not
///    hidden, not offstage, not covered by an opaque overlay. That is a
///    stronger and much more easily provable guarantee than layering:
///      - no financial widget exists, so none can paint, leak through a
///        transition, or be found by a hit test;
///      - no route exists, so an open dialog/bottom sheet from before the
///        lock cannot survive it (section 11's "transients must not remain
///        accessible after locking" is satisfied structurally);
///      - Android Back cannot reveal the shell, because there is no shell
///        and no Navigator to pop back into. Back at the lock screen falls
///        through to the platform's normal root behaviour and backgrounds
///        the app, which is safe.
///
///    The accepted cost, stated rather than hidden: unlocking rebuilds the
///    navigation shell, so the user returns to Home rather than to the tab
///    they were on. That is a deterministic, safe resume state, and it is
///    the standard behaviour for a locked finance app.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final state = AuthScope.of(context).state;

    // Whitelist, evaluated on the state object itself — there is exactly one
    // definition of "may sensitive content be shown" in the codebase.
    if (state.allowsSensitiveContent) return child;

    // Everything the gate shows instead of [child] is built ABOVE the app's
    // Navigator, and the gate deliberately does not build that Navigator
    // while access is denied (see the class comment). A Navigator is
    // normally what supplies the Overlay that Material text editing
    // requires, so without one `EditableText` asserts "No Overlay widget
    // found" on every focus — which then leaves its batch-edit depth
    // unbalanced and makes disposal assert too. The lock screen has a PIN
    // TextField, so it needs an Overlay.
    //
    // `Overlay.wrap` supplies a minimal one (and owns the entry's
    // lifecycle). Crucially this is an Overlay, NOT a Navigator: it has no
    // ROUTES, so `showDialog`/`showModalBottomSheet`/`Navigator.push` have
    // nothing to push onto and the guarantee that no route can appear above
    // the lock screen is unchanged. (Being precise: an Overlay does accept
    // OverlayEntries — Flutter adds one itself for the text-selection
    // toolbar. That is a rendering detail of this screen's own field, not a
    // way for app code to surface financial UI.)
    return Overlay.wrap(child: _gateContent(context, state));
  }

  Widget _gateContent(BuildContext context, AuthState state) {
    return switch (state) {
      AuthInitializing() => const _SecurityStatusScreen(
          key: ValueKey('auth-initializing'),
          child: CircularProgressIndicator(),
        ),
      AuthUnavailable(error: final error) => _SecurityStatusScreen(
          key: const ValueKey('auth-unavailable'),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  'שגיאת אבטחה',
                  key: const ValueKey('auth-unavailable-title'),
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  // error.message is a fixed, secret-free literal by
                  // contract — see SecurityError's class comment.
                  error.message,
                  key: const ValueKey('auth-unavailable-text'),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      AuthLocked() || AuthUnlocking() => const LockScreen(),
      // Unreachable: both are covered by allowsSensitiveContent above. Kept
      // explicit so the switch stays exhaustive if a state is ever added.
      AuthNotConfigured() || AuthUnlocked() => child,
    };
  }
}

class _SecurityStatusScreen extends StatelessWidget {
  const _SecurityStatusScreen({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: child));
}
