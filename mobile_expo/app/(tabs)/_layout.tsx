// The navigation shell. It only exists while the security gate allows
// sensitive content, so deferred intents (notification taps, the return to
// Settings ▸ נתונים after a file operation) and the Goals reminder dialog can
// never act or show while locked.
//
// Visual fidelity (styles.css .bottom-nav / .nav-btn / .app-header): the
// approved 5-item bottom navigation — emoji icon above a 10.5px label; the
// active item's icon sits in a rounded primary-tint pill and its label turns
// primary + bold. The header is the Web's centred brand block on the page
// background (no toolbar bar, no shadow).

import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { TAB_HREFS, TAB_ROUTE_NAMES, TAB_SCREENS, TAB_TITLES, TABS_BACK_BEHAVIOR, type TabScreen } from '../../src/navigation/routes.ts';
import { allowsSensitiveContent } from '../../src/security/authMachine.ts';
import { GoalsReminderDialog } from '../../src/ui/GoalsReminderDialog.tsx';
import { NoticeHost } from '../../src/ui/NoticeHost.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useStore } from '../../src/ui/useStore.ts';

/** index.html .bottom-nav icons, in the approved order. */
export const TAB_ICONS: Record<TabScreen, string> = { home: '🏠', forecast: '📈', goals: '🎯', categories: '📁', settings: '⚙️' };

/** Where a finished import/export returns the user: the Data topic, which shows the result or the restore decision. */
export const FILE_OPERATION_RETURN_HREF = '/settings-topic/data';

/** The Web app header (index.html .app-header): brand name and subtitle, centred, on every main screen. */
function AppHeaderTitle() {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center' }} accessibilityRole="header">
      <Text style={{ fontSize: t.fs(19), fontWeight: '700', color: t.c.text }}>FamilyFinance</Text>
      <Text style={{ fontSize: t.fs(12), color: t.c.textMuted, marginTop: 3 }}>ניהול תקציב משפחתי</Text>
    </View>
  );
}

/** .nav-btn .nav-icon — the active icon sits in a rounded primary-tint pill. */
function NavIcon({ screen, focused }: { screen: TabScreen; focused: boolean }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: focused ? t.c.primaryBg : 'transparent' }}>
      <Text style={{ fontSize: 18, lineHeight: 24, textAlign: 'center' }}>{TAB_ICONS[screen]}</Text>
    </View>
  );
}

function NavLabel({ title, focused }: { title: string; focused: boolean }) {
  const t = useTheme();
  return <Text style={{ fontSize: 10.5, lineHeight: 15, marginTop: 3, color: focused ? t.c.primaryText : t.c.textMuted, fontWeight: focused ? '700' : '400' }}>{title}</Text>;
}

export default function TabsLayout() {
  const { navigation, auth, finance, reminder } = useServices();
  const router = useRouter();
  const pathname = usePathname();
  const pending = useStore(navigation.pending);
  const financeStatus = useStore(finance.state).status;
  const t = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (pending === null) return;
    const intent = navigation.take(allowsSensitiveContent(auth.state.get()));
    if (intent === null) return;
    const target = intent.source === 'fileOperation' ? FILE_OPERATION_RETURN_HREF : TAB_HREFS[intent.screen];
    if (pathname !== target) router.navigate(target);
  }, [pending, navigation, auth, router, pathname]);

  // The once-per-run automatic reminder check, after the data is loaded and the app is open.
  useEffect(() => {
    if (financeStatus === 'ready') reminder.checkAtStartup();
  }, [financeStatus, reminder]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Tabs
        backBehavior={TABS_BACK_BEHAVIOR}
        screenOptions={{
          headerTitleAlign: 'center',
          headerTitle: () => <AppHeaderTitle />,
          headerStyle: { backgroundColor: t.c.bg },
          headerShadowVisible: false,
          headerTintColor: t.c.text,
          // The library's icon box is 31×28; the Web pill (24px emoji line + 4px/10px padding) needs 56×32, or it is clipped.
          tabBarIconStyle: { width: 56, height: 32 },
          tabBarActiveTintColor: t.c.primaryText,
          tabBarInactiveTintColor: t.c.textMuted,
          // tabBarStyle is merged last and replaces the library's inset-aware height,
          // so the Android navigation-bar inset must be added here or the tabs sit under it.
          tabBarStyle: {
            backgroundColor: t.c.surface,
            borderTopColor: t.c.border,
            borderTopWidth: 1,
            elevation: 0,
            paddingTop: 8,
            paddingBottom: insets.bottom,
            // 8 top padding + 1 border + tab item (5 + 32 icon + 18 label + 5) = 69, rounded up.
            height: 72 + insets.bottom,
          },
          sceneStyle: { backgroundColor: t.c.bg },
        }}
      >
        {TAB_SCREENS.map((screen) => (
          <Tabs.Screen
            key={screen}
            name={TAB_ROUTE_NAMES[screen]}
            options={{
              title: TAB_TITLES[screen],
              tabBarButtonTestID: `tab-${screen}`,
              tabBarIcon: ({ focused }) => <NavIcon screen={screen} focused={focused} />,
              tabBarLabel: ({ focused }) => <NavLabel title={TAB_TITLES[screen]} focused={focused} />,
            }}
          />
        ))}
      </Tabs>
      <GoalsReminderDialog />
      <NoticeHost />
    </View>
  );
}
