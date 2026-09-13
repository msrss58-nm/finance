// Root layout = the security gate. Protected screens are only routable while
// allowsSensitiveContent() is true; when the guard flips false expo-router
// removes them (they unmount), mirroring Flutter's AuthGate "child not built".
import * as Notifications from 'expo-notifications';
import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { runBootProbes } from '../src/probe/boot';
import { allowsSensitiveContent } from '../src/probe/lockMachine';
import { note } from '../src/probe/log';
import '../src/probe/notifyProbe';
import { dispatchLock, lockStore, pendingRouteStore, useStore } from '../src/probe/stores';

let booted = false;

export default function RootLayout() {
  const lock = useStore(lockStore);
  const pathname = usePathname();

  useEffect(() => {
    note('nav', `path=${pathname}`);
  }, [pathname]);

  useEffect(() => {
    if (!booted) {
      booted = true;
      void runBootProbes();
    }
    const change = AppState.addEventListener('change', (state) => {
      note('lifecycle', `appState=${state}`);
      dispatchLock({ type: 'appState', state });
    });
    // Android-only window focus events: logged to show which system overlays
    // (permission dialog, shade) do or do not background the activity.
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => note('lifecycle', 'blur')) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => note('lifecycle', 'focus')) : null;
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      note('notify', `tap route=${String(route)} lock=${lockStore.get().kind}`);
      if (typeof route === 'string') pendingRouteStore.set(route);
    });
    return () => {
      change.remove();
      blur?.remove();
      focus?.remove();
      tap.remove();
    };
  }, []);

  const allowed = allowsSensitiveContent(lock);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={allowed}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true, title: 'חלונית בדיקה' }} />
      </Stack.Protected>
      <Stack.Protected guard={!allowed}>
        <Stack.Screen name="lock" />
      </Stack.Protected>
    </Stack>
  );
}
