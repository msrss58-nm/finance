// The navigation shell. It only exists while the security gate allows
// sensitive content, so deferred intents (notification taps, the return to
// Settings ▸ נתונים after a file operation) and the Goals reminder dialog can
// never act or show while locked.

import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { TAB_HREFS, TAB_ROUTE_NAMES, TAB_SCREENS, TAB_TITLES, TABS_BACK_BEHAVIOR, type TabScreen } from '../../src/navigation/routes.ts';
import { allowsSensitiveContent } from '../../src/security/authMachine.ts';
import { GoalsReminderDialog } from '../../src/ui/GoalsReminderDialog.tsx';
import { NoticeHost } from '../../src/ui/NoticeHost.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useStore } from '../../src/ui/useStore.ts';

const TAB_ICONS: Record<TabScreen, string> = { home: '🏠', forecast: '📈', goals: '🎯', categories: '📁', settings: '⚙️' };

/** Where a finished import/export returns the user: the Data topic, which shows the result or the restore decision. */
export const FILE_OPERATION_RETURN_HREF = '/settings-topic/data';

/** The Web app header (index.html .app-header): brand name and subtitle, centred, on every main screen. */
function AppHeaderTitle() {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center' }} accessibilityRole="header">
      <Text style={{ fontSize: t.fs(19), fontWeight: '700', color: t.c.text }}>FamilyFinance</Text>
      <Text style={{ fontSize: t.fs(12), color: t.c.textMuted, marginTop: 2 }}>ניהול תקציב משפחתי</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { navigation, auth, finance, reminder } = useServices();
  const router = useRouter();
  const pathname = usePathname();
  const pending = useStore(navigation.pending);
  const financeStatus = useStore(finance.state).status;
  const t = useTheme();

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
          headerStyle: { backgroundColor: t.c.surface },
          headerTintColor: t.c.text,
          tabBarActiveTintColor: t.c.primaryText,
          tabBarInactiveTintColor: t.c.textMuted,
          tabBarStyle: { backgroundColor: t.c.surface, borderTopColor: t.c.border },
          tabBarLabelStyle: { fontSize: 12 },
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
              tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{TAB_ICONS[screen]}</Text>,
            }}
          />
        ))}
      </Tabs>
      <GoalsReminderDialog />
      <NoticeHost />
    </View>
  );
}
