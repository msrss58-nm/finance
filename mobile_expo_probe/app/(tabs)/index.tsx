import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { note } from '../../src/probe/log';
import { Btn, H, P, Screen, useMountLog } from '../../src/ui/components';

export default function HomeProbe() {
  const router = useRouter();
  const [draftOpen, setDraftOpen] = useState(false);
  useMountLog('home');

  // In-screen transient (like the Web inline forms): Back cancels it first.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!draftOpen) return false;
        note('nav', 'back closed in-screen transient');
        setDraftOpen(false);
        return true;
      });
      return () => sub.remove();
    }, [draftOpen]),
  );

  const amount = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(1234.5);

  return (
    <Screen>
      <H>בית</H>
      <View style={styles.row}>
        <Text style={styles.label}>יתרה צפויה להיום (נתון סינתטי)</Text>
        <Text style={styles.amount}>{amount}</Text>
      </View>
      <P>בדיקת RTL: התווית בצד ההתחלה (ימין) והסכום בצד הסוף (שמאל). טקסט מעורב: קובץ backup.json נשמר ב-02/09.</P>
      <Btn label="פתח חלונית (modal)" testID="open-modal" onPress={() => router.push('/modal')} />
      <Btn
        label={draftOpen ? 'סגור טופס זמני' : 'פתח טופס זמני'}
        testID="toggle-draft"
        onPress={() => {
          note('nav', `transient ${draftOpen ? 'closed' : 'opened'} by button`);
          setDraftOpen(!draftOpen);
        }}
      />
      {draftOpen ? (
        <View style={styles.draft}>
          <Text>טופס זמני פתוח — Back יסגור אותו לפני מעבר מסך</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: '#e8f5ef' },
  label: { fontSize: 15 },
  amount: { fontSize: 20, fontWeight: '700' },
  draft: { padding: 14, borderWidth: 1, borderColor: '#0a7d5a', borderRadius: 10 },
});
