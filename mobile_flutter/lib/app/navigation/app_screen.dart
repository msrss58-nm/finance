/// The five primary sections of the app shell (Milestone 5). Order here is
/// also bottom-navigation-bar order.
enum AppScreen {
  home('בית'),
  forecast('תחזית'),
  goals('יעדים'),
  categories('קטגוריות'),
  settings('הגדרות');

  const AppScreen(this.label);

  /// Hebrew display label — placeholder-screen identity only, not a full
  /// localization system (out of scope for this milestone).
  final String label;
}
