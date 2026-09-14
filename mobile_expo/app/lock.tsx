// The only route while sensitive content is not allowed: booting, locked,
// verifying, or failed. Renders no financial content in any state.

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppServices } from '../src/composition/bootstrap.ts';
import { useBootState } from '../src/composition/ServicesContext.tsx';
import { ltr } from '../src/core/bidi.ts';
import { SECURITY_FAILURE_MESSAGES } from '../src/security/securityTypes.ts';
import { Body, Button, ErrorText, Muted, Title } from '../src/ui/components.tsx';
import { colors, spacing } from '../src/ui/theme.ts';
import { useStore } from '../src/ui/useStore.ts';

export default function LockRoute() {
  const boot = useBootState();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body} testID="lock-screen">
        {boot.status === 'booting' ? <Muted testID="lock-state">טוען…</Muted> : null}
        {boot.status === 'failed' ? (
          <>
            <Title>לא ניתן לפתוח את האפליקציה</Title>
            <ErrorText testID="lock-state">{boot.reason === 'storage' ? 'פתיחת מאגר הנתונים נכשלה.' : 'שגיאה בלתי צפויה באתחול.'}</ErrorText>
            <Muted>{ltr(boot.causeType)}</Muted>
          </>
        ) : null}
        {boot.status === 'ready' ? <LockContent services={boot.services} /> : null}
      </View>
    </SafeAreaView>
  );
}

function LockContent({ services }: { services: AppServices }) {
  const state = useStore(services.auth.state);
  const [code, setCode] = useState('');

  if (state.kind === 'initializing') return <Muted testID="lock-state">בודק את מצב האבטחה…</Muted>;

  if (state.kind === 'unavailable') {
    return (
      <>
        <Title>הגישה נחסמה</Title>
        <ErrorText testID="lock-state">{SECURITY_FAILURE_MESSAGES[state.failure.kind]}</ErrorText>
        <Muted>מטעמי אבטחה האפליקציה אינה נפתחת כשמצב הנעילה אינו ידוע.</Muted>
      </>
    );
  }

  if (state.kind !== 'locked' && state.kind !== 'unlocking') return null; // the gate is about to switch

  const busy = state.kind === 'unlocking';
  const waiting = state.kind === 'locked' && state.retryAllowedAt !== null;
  const submit = () => {
    const value = code;
    setCode('');
    void services.auth.submit(value);
  };

  return (
    <>
      <Title>האפליקציה נעולה</Title>
      <Body testID="lock-state">{busy ? 'מאמת…' : 'הזינו קוד כדי להמשיך'}</Body>
      <Muted>מנעול תשתית זמני (שלב 1) — אינו אימות PIN אמיתי.</Muted>
      <TextInput
        testID="lock-code"
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        editable={!busy}
        style={styles.input}
        accessibilityLabel="קוד"
      />
      {state.kind === 'locked' && state.lastAttemptFailed ? (
        <ErrorText testID="lock-error">{waiting ? 'קוד שגוי. יש להמתין מספר שניות לפני ניסיון נוסף.' : 'קוד שגוי'}</ErrorText>
      ) : null}
      <Button label="פתיחה" testID="lock-submit" disabled={busy || code.length === 0} onPress={submit} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.m },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    fontSize: 20,
    textAlign: 'center',
    color: colors.text,
  },
});
