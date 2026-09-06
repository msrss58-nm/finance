import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart';

/// App-switcher / recents-snapshot protection (Milestone 7, section 7).
///
/// SCOPE DECISION, stated explicitly because section 7 asks for the
/// distinction between (A) blocking the recents preview and (B) globally
/// disabling screenshots:
///
/// Android exposes no public API that blocks ONLY the recents thumbnail.
/// `FLAG_SECURE` is the mechanism, and it necessarily does both. The
/// narrowest safe implementation available is therefore to scope it by
/// TIME rather than by capability: FLAG_SECURE is applied only while a PIN
/// is actually configured, and cleared the moment the PIN is disabled. A
/// user who has not opted into the privacy lock keeps ordinary screenshots.
///
/// The rejected alternative was toggling the flag around each lifecycle
/// transition (set on pause, clear on resume). That is racy — the system
/// can capture the snapshot before the flag takes effect — so it would
/// trade a real guarantee for a partial one.
///
/// iOS: NOT IMPLEMENTED in this milestone and NOT claimed. The equivalent
/// (covering the window on `applicationWillResignActive`) needs Swift in
/// AppDelegate that cannot be built or verified from Windows. The Dart side
/// is already platform-agnostic behind this interface, so adding it later
/// touches no shared logic — see section 16.
abstract interface class SecureWindowController {
  Future<void> setSecure(bool enabled);
}

@visibleForTesting
const MethodChannel kSecureWindowChannel =
    MethodChannel('familyfinance_pro/secure_window');

class PlatformSecureWindowController implements SecureWindowController {
  const PlatformSecureWindowController();

  @override
  Future<void> setSecure(bool enabled) async {
    if (!Platform.isAndroid) return;
    try {
      await kSecureWindowChannel.invokeMethod<void>(
        'setSecure',
        <String, Object?>{'enabled': enabled},
      );
    } on MissingPluginException {
      // Host build without the native handler (e.g. a test harness). Never
      // fatal: recents protection is defence-in-depth, and failing to apply
      // it must not prevent the lock itself from working.
    } on PlatformException {
      // Same reasoning — a window-flag failure must not break unlocking.
    }
  }
}

/// No-op implementation for tests and for platforms where the protection is
/// not implemented.
class NoopSecureWindowController implements SecureWindowController {
  const NoopSecureWindowController();

  @override
  Future<void> setSecure(bool enabled) async {}
}
