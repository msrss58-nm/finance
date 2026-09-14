// Root layout = composition root + security gate.
//
// Protected screens are routable only while allowsSensitiveContent() is true.
// When the guard flips to false, expo-router removes them — they unmount, as
// the Flutter oracle's AuthGate stops building its child — and only the lock
// route remains. This component itself is never unmounted by the gate, so the
// services it owns (pending file operation, pending navigation) survive a lock.

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { BootProvider } from '../src/composition/ServicesContext.tsx';
import { useBoot } from '../src/composition/useBoot.ts';
import { constantStore } from '../src/core/store.ts';
import { allowsSensitiveContent, INITIAL_AUTH_STATE } from '../src/security/authMachine.ts';
import { useStore } from '../src/ui/useStore.ts';

const BOOTING_AUTH = constantStore(INITIAL_AUTH_STATE);

export default function RootLayout() {
  const boot = useBoot();
  const services = boot.status === 'ready' ? boot.services : null;
  const auth = useStore(services ? services.auth.state : BOOTING_AUTH);

  useEffect(() => {
    if (services === null) return;
    const subscription = AppState.addEventListener('change', (status) => services.auth.handleAppState(status));
    return () => subscription.remove();
  }, [services]);

  const allowed = allowsSensitiveContent(auth);

  return (
    <BootProvider boot={boot}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={allowed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen
              name="diagnostics"
              options={{ presentation: 'modal', headerShown: true, title: 'בדיקות תשתית', headerTitleAlign: 'center' }}
            />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={!allowed}>
          <Stack.Screen name="lock" />
        </Stack.Protected>
      </Stack>
    </BootProvider>
  );
}
