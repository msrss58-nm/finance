// The five primary screens. Order = tab order (first = start side, i.e. the
// right edge in RTL).

export const TAB_SCREENS = ['home', 'forecast', 'goals', 'categories', 'settings'] as const;
export type TabScreen = (typeof TAB_SCREENS)[number];

/** expo-router file names under app/(tabs)/. */
export const TAB_ROUTE_NAMES: Record<TabScreen, string> = {
  home: 'index',
  forecast: 'forecast',
  goals: 'goals',
  categories: 'categories',
  settings: 'settings',
};

export const TAB_HREFS = {
  home: '/',
  forecast: '/forecast',
  goals: '/goals',
  categories: '/categories',
  settings: '/settings',
} as const satisfies Record<TabScreen, string>;

export const TAB_TITLES: Record<TabScreen, string> = {
  home: 'בית',
  forecast: 'תחזית',
  goals: 'יעדים',
  categories: 'קטגוריות',
  settings: 'הגדרות',
};

/**
 * React Navigation tab back behavior. 'history' = the oracle's
 * NavigationHistoryController: a deduplicated most-recently-visited list
 * (re-visiting a tab moves it to the end; tapping the active tab adds
 * nothing), Back pops it, and Back on the single root entry is NOT handled so
 * Android's default root Back proceeds. Verified in test/navigation.test.ts
 * against the router implementation expo-router ships.
 */
export const TABS_BACK_BEHAVIOR = 'history' as const;

export function isTabScreen(value: unknown): value is TabScreen {
  return typeof value === 'string' && (TAB_SCREENS as readonly string[]).includes(value);
}
