import 'package:flutter/widgets.dart';

import 'app_services.dart';

/// Makes the single production [AppServices] bundle explicitly available to
/// every screen below it, via [AppServicesScope.of] — the ONLY sanctioned
/// way a screen reaches a repository. No global variable, no service
/// locator: this is a plain [InheritedWidget], a core Flutter primitive, so
/// no third-party DI/state-management package was needed.
class AppServicesScope extends InheritedWidget {
  const AppServicesScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppServicesScope>();
    assert(scope != null, 'No AppServicesScope found above this context — '
        'every screen must be built beneath the one AppBootstrap installs.');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppServicesScope oldWidget) => !identical(services, oldWidget.services);
}
