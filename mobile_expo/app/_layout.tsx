// Root layout = composition root + security gate + theme.
//
// Protected screens are routable only while allowsSensitiveContent() is true.
// When the guard flips to false, expo-router removes them — they unmount, as
// the Flutter oracle's AuthGate stops building its child — and only the lock
// route remains. This component itself is never unmounted by the gate, so the
// services it owns (finance data, pending file operation, pending navigation,
// the reminder session) survive a lock.

import { Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BootProvider } from '../src/composition/ServicesContext.tsx';
import { useBoot } from '../src/composition/useBoot.ts';
import { constantStore } from '../src/core/store.ts';
import { resolveAppearance } from '../src/domain/appearance.ts';
import { getDefaultAppSettings } from '../src/domain/settings.ts';
import { allowsSensitiveContent, INITIAL_AUTH_STATE } from '../src/security/authMachine.ts';
import type { FinanceState } from '../src/state/financeController.ts';
import { buildTheme, ThemeContext } from '../src/ui/theme.ts';
import { useStore } from '../src/ui/useStore.ts';

const BOOTING_AUTH = constantStore(INITIAL_AUTH_STATE);
const LOADING_FINANCE = constantStore<FinanceState>({ status: 'loading' });
const DEFAULT_SETTINGS = getDefaultAppSettings();

export default function RootLayout() {
  const boot = useBoot();
  const services = boot.status === 'ready' ? boot.services : null;
  const auth = useStore(services ? services.auth.state : BOOTING_AUTH);
  const finance = useStore(services ? services.finance.state : LOADING_FINANCE);
  const scheme = useColorScheme();

  useEffect(() => {
    if (services === null) return;
    const subscription = AppState.addEventListener('change', (status) => {
      services.auth.handleAppState(status);
      if (status === 'active') {
        services.finance.tick();
        void services.reminderScheduler.reconcile();
      }
    });
    return () => subscription.remove();
  }, [services]);

  const settings = finance.status === 'ready' ? finance.data.settings : DEFAULT_SETTINGS;
  const theme = useMemo(() => buildTheme(resolveAppearance(settings), scheme === 'dark'), [settings, scheme]);
  const allowed = allowsSensitiveContent(auth);
  const insets = useSafeAreaInsets();
  // Secondary (non-tab) routes: Android draws edge-to-edge, so keep their
  // content — form buttons, the category FAB — above the system navigation bar.
  // The tab screens get this inset from the tab bar.
  const header = {
    headerShown: true,
    headerTitleAlign: 'center' as const,
    headerStyle: { backgroundColor: theme.c.surface },
    headerTintColor: theme.c.text,
    contentStyle: { backgroundColor: theme.c.bg, paddingBottom: insets.bottom },
  };

  return (
    <BootProvider boot={boot}>
      <ThemeContext.Provider value={theme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.c.bg } }}>
          <Stack.Protected guard={allowed}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="category/[key]" options={{ ...header, title: 'קטגוריה' }} />
            <Stack.Screen name="item-form" options={{ ...header, title: 'תנועה' }} />
            <Stack.Screen name="category-form" options={{ ...header, title: 'קטגוריה' }} />
            <Stack.Screen name="goal-form" options={{ ...header, title: 'יעד' }} />
            <Stack.Screen name="component-form" options={{ ...header, title: 'רכיב' }} />
            <Stack.Screen name="opening-balance" options={{ ...header, title: 'יתרת התחלה' }} />
            <Stack.Screen name="settings-topic/[topic]" options={{ ...header, title: 'הגדרות' }} />
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen
                name="diagnostics"
                options={{
                  presentation: 'modal',
                  headerShown: true,
                  title: 'בדיקות תשתית',
                  headerTitleAlign: 'center',
                  contentStyle: { paddingBottom: insets.bottom },
                }}
              />
            </Stack.Protected>
          </Stack.Protected>
          <Stack.Protected guard={!allowed}>
            <Stack.Screen name="lock" />
          </Stack.Protected>
        </Stack>
      </ThemeContext.Provider>
    </BootProvider>
  );
}
