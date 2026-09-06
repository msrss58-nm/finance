import 'package:flutter/widgets.dart';

import '../../security/auth_controller.dart';
import '../../security/pin_service.dart';

/// Security composition root exposure (Milestone 7, section 4).
///
/// Deliberately SEPARATE from [AppServicesScope]: the financial DI bundle
/// must not carry auth objects, and the auth bundle must not carry
/// repositories. Keeping them as two independent scopes is what makes
/// "security state is separate from financial persistence" (section 12)
/// visible in the widget tree rather than merely asserted.
///
/// An [InheritedNotifier] so that any widget depending on it rebuilds when
/// the controller's state changes — no third-party state-management package.
class AuthScope extends InheritedNotifier<AuthController> {
  const AuthScope({
    super.key,
    required AuthController controller,
    required this.pinService,
    required super.child,
  }) : super(notifier: controller);

  final PinService pinService;

  /// The controller, WITH a dependency registered — the caller rebuilds on
  /// every auth state change.
  static AuthController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope.of() called with no AuthScope above it');
    return scope!.notifier!;
  }

  /// The controller WITHOUT registering a dependency — for event handlers
  /// that only need to call a method, not rebuild.
  static AuthController readOf(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope.readOf() called with no AuthScope above it');
    return scope!.notifier!;
  }

  static PinService pinServiceOf(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope.pinServiceOf() called with no AuthScope above it');
    return scope!.pinService;
  }

  @override
  bool updateShouldNotify(AuthScope oldWidget) =>
      super.updateShouldNotify(oldWidget) || pinService != oldWidget.pinService;
}
