// Only mounted while the lock gate allows sensitive content, so everything
// consumed here (notification tap, backup return) can never act while locked.
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { note } from '../../src/probe/log';
import { fileFlowStore, pendingRouteStore, useStore } from '../../src/probe/stores';
import { useMountLog } from '../../src/ui/components';

export default function TabsLayout() {
  const router = useRouter();
  const pending = useStore(pendingRouteStore);
  const flow = useStore(fileFlowStore);
  useMountLog('tabs-shell');

  useEffect(() => {
    if (pending === null) return;
    pendingRouteStore.set(null); // taken, never peeked: one tap navigates once
    note('notify', `consume route=${pending}`);
    if (pending === 'goals') router.navigate('/goals');
  }, [pending, router]);

  useEffect(() => {
    if (!flow.returnToSettings) return;
    fileFlowStore.set({ ...flow, returnToSettings: false });
    note('file', 'return to settings after unlock');
    router.navigate('/settings');
  }, [flow, router]);

  return (
    <Tabs backBehavior="history" screenOptions={{ tabBarActiveTintColor: '#0a7d5a', headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: 'בית' }} />
      <Tabs.Screen name="forecast" options={{ title: 'תחזית' }} />
      <Tabs.Screen name="goals" options={{ title: 'יעדים' }} />
      <Tabs.Screen name="categories" options={{ title: 'קטגוריות' }} />
      <Tabs.Screen name="settings" options={{ title: 'הגדרות' }} />
    </Tabs>
  );
}
