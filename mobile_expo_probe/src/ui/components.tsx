import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getResultsSnapshot, note, subscribeResults } from '../probe/log';

export function useMountLog(name: string): void {
  useEffect(() => {
    note('mount', `${name} mounted`);
    return () => note('mount', `${name} unmounted`);
  }, [name]);
}

export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>;
}

export function H({ children }: { children: ReactNode }) {
  return <Text style={styles.h}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

export function Btn({ label, onPress, testID }: { label: string; onPress: () => void | Promise<void>; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function Results({ area }: { area?: string }) {
  const all = useSyncExternalStore(subscribeResults, getResultsSnapshot, getResultsSnapshot);
  const list = area ? all.filter((r) => r.area === area) : all;
  return (
    <View style={styles.results}>
      {list.slice(-40).map((r, i) => (
        <Text key={`${r.at}-${i}`} style={[styles.result, r.ok ? styles.ok : styles.fail]}>
          {r.ok ? '✓' : '✗'} {r.area}/{r.name} — {r.detail}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 10 },
  h: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600', marginTop: 12 },
  p: { fontSize: 15, lineHeight: 22 },
  btn: { backgroundColor: '#0a7d5a', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, minHeight: 44 },
  pressed: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  results: { gap: 4 },
  result: { fontSize: 12 },
  ok: { color: '#0a7d5a' },
  fail: { color: '#b3261e' },
});
