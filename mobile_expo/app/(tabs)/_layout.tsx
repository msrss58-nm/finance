// The navigation shell. It only exists while the security gate allows
// sensitive content, so deferred intents (notification taps, "return to
// Settings" after a file operation) can never be acted on while locked.

import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { TAB_HREFS, TAB_ROUTE_NAMES, TAB_SCREENS, TAB_TITLES, TABS_BACK_BEHAVIOR } from '../../src/navigation/routes.ts';
import { allowsSensitiveContent } from '../../src/security/authMachine.ts';
import { colors } from '../../src/ui/theme.ts';
import { useStore } from '../../src/ui/useStore.ts';

export default function TabsLayout() {
  const { navigation, auth } = useServices();
  const router = useRouter();
  const pending = useStore(navigation.pending);

  useEffect(() => {
    if (pending === null) return;
    const intent = navigation.take(allowsSensitiveContent(auth.state.get()));
    if (intent !== null) router.navigate(TAB_HREFS[intent.screen]);
  }, [pending, navigation, auth, router]);

  return (
    <Tabs
      backBehavior={TABS_BACK_BEHAVIOR}
      screenOptions={{ headerTitleAlign: 'center', tabBarActiveTintColor: colors.accent }}
    >
      {TAB_SCREENS.map((screen) => (
        <Tabs.Screen
          key={screen}
          name={TAB_ROUTE_NAMES[screen]}
          options={{ title: TAB_TITLES[screen], tabBarButtonTestID: `tab-${screen}` }}
        />
      ))}
    </Tabs>
  );
}
