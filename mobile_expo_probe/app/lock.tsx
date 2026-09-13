import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { checkSyntheticCode } from '../src/probe/secureProbe';
import { dispatchLock, lockStore, useStore } from '../src/probe/stores';
import { Btn, useMountLog } from '../src/ui/components';

export default function LockScreen() {
  const lock = useStore(lockStore);
  const [code, setCode] = useState('');
  useMountLog('lock-screen');

  if (lock.kind === 'initializing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.p}>טוען מצב אבטחה…</Text>
      </View>
    );
  }
  if (lock.kind === 'unavailable') {
    return (
      <View style={styles.center}>
        <Text style={styles.h}>שגיאת אבטחה</Text>
        <Text style={styles.p}>{lock.reason}</Text>
      </View>
    );
  }
  return (
    <View style={styles.center}>
      <Text style={styles.h}>האפליקציה נעולה</Text>
      <Text style={styles.p}>קוד בדיקה סינתטי — אינו מנגנון PIN אמיתי</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
        testID="lock-code"
        accessibilityLabel="קוד"
      />
      {lock.kind === 'locked' && lock.failures > 0 ? <Text style={styles.err}>קוד שגוי ({lock.failures})</Text> : null}
      <Btn
        label="פתיחה"
        testID="lock-submit"
        onPress={() => {
          const ok = checkSyntheticCode(code);
          setCode('');
          dispatchLock({ type: ok ? 'unlockSucceeded' : 'unlockFailed' });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#fff' },
  h: { fontSize: 22, fontWeight: '700' },
  p: { fontSize: 15 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 10, fontSize: 20, textAlign: 'center' },
  err: { color: '#b3261e' },
});
