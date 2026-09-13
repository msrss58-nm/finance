import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, useMountLog } from '../src/ui/components';

export default function ProbeModal() {
  const router = useRouter();
  useMountLog('modal');
  return (
    <View style={styles.c}>
      <Text style={styles.p}>חלונית בדיקה. לחיצה על Back אמורה לסגור אותה לפני כל מעבר בין טאבים.</Text>
      <Btn label="סגור" testID="modal-close" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 24, gap: 12, backgroundColor: '#fff' },
  p: { fontSize: 16 },
});
