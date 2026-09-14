// The only route while sensitive content is not allowed: booting, locked,
// verifying, or failed. Renders no financial content in any state. The card
// follows the Web lock overlay (index.html .lock-card): 🔒, title, prompt,
// numeric PIN field, error line and "פתח". Keyboard-safe: the card scrolls
// above the keyboard, and the keyboard's Done key also submits.

import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppServices } from '../src/composition/bootstrap.ts';
import { useBootState } from '../src/composition/ServicesContext.tsx';
import { ltr } from '../src/core/bidi.ts';
import { SECURITY_FAILURE_MESSAGES } from '../src/security/securityTypes.ts';
import { useTheme } from '../src/ui/theme.ts';
import { useStore } from '../src/ui/useStore.ts';

export default function LockRoute() {
  const boot = useBootState();
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View
            testID="lock-screen"
            accessibilityViewIsModal
            style={{ backgroundColor: t.c.surface, borderRadius: 18, padding: 24, gap: 12, alignItems: 'center', elevation: 3 }}
          >
            <Text style={{ fontSize: 40 }} accessibilityElementsHidden>
              🔒
            </Text>
            {boot.status === 'booting' ? <Line testID="lock-state">טוען…</Line> : null}
            {boot.status === 'failed' ? (
              <>
                <Title>לא ניתן לפתוח את האפליקציה</Title>
                <Line tone="danger" testID="lock-state">
                  {boot.reason === 'storage' ? 'פתיחת מאגר הנתונים נכשלה.' : 'שגיאה בלתי צפויה באתחול.'}
                </Line>
                <Line>{ltr(boot.causeType)}</Line>
              </>
            ) : null}
            {boot.status === 'ready' ? <LockContent services={boot.services} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: t.fs(19), fontWeight: '700', color: t.c.text, textAlign: 'center' }}>{children}</Text>;
}

function Line({ children, tone = 'muted', testID }: { children: ReactNode; tone?: 'muted' | 'danger'; testID?: string }) {
  const t = useTheme();
  return (
    <Text testID={testID} style={{ fontSize: t.fs(14), color: tone === 'danger' ? t.c.danger : t.c.textMuted, textAlign: 'center' }}>
      {children}
    </Text>
  );
}

function LockContent({ services }: { services: AppServices }) {
  const t = useTheme();
  const state = useStore(services.auth.state);
  const [code, setCode] = useState('');

  if (state.kind === 'initializing') return <Line testID="lock-state">בודק את מצב האבטחה…</Line>;

  if (state.kind === 'unavailable') {
    return (
      <>
        <Title>הגישה נחסמה</Title>
        <Line tone="danger" testID="lock-state">
          {SECURITY_FAILURE_MESSAGES[state.failure.kind]}
        </Line>
        <Line>מטעמי אבטחה האפליקציה אינה נפתחת כשמצב הנעילה אינו ידוע.</Line>
      </>
    );
  }

  if (state.kind !== 'locked' && state.kind !== 'unlocking') return null; // the gate is about to switch

  const busy = state.kind === 'unlocking';
  const waiting = state.kind === 'locked' && state.retryAllowedAt !== null;
  const disabled = busy || code.length === 0;
  const submit = () => {
    if (disabled) return;
    const value = code;
    setCode('');
    void services.auth.submit(value);
  };

  return (
    <>
      <Title>האפליקציה נעולה</Title>
      <Line testID="lock-state">{busy ? 'מאמת…' : 'הזן/י PIN לפתיחה'}</Line>
      <TextInput
        testID="lock-code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        returnKeyType="done"
        secureTextEntry
        maxLength={6}
        editable={!busy}
        autoFocus
        accessibilityLabel="קוד PIN"
        style={{
          alignSelf: 'stretch',
          minHeight: 52,
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: 12,
          backgroundColor: t.c.bg,
          color: t.c.text,
          fontSize: 22,
          letterSpacing: 6,
          textAlign: 'center',
        }}
      />
      {state.kind === 'locked' && state.lastAttemptFailed ? (
        <Line tone="danger" testID="lock-error">
          {waiting ? 'קוד שגוי. יש להמתין מספר שניות לפני ניסיון נוסף.' : 'קוד שגוי, נסה/י שוב'}
        </Line>
      ) : null}
      <Pressable
        testID="lock-submit"
        accessibilityRole="button"
        accessibilityLabel="פתח"
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={submit}
        style={({ pressed }) => ({
          alignSelf: 'stretch',
          minHeight: 50,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled ? t.c.disabled : t.c.primary,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: t.c.onPrimary, fontSize: t.fs(16), fontWeight: '700' }}>{busy ? 'מאמת…' : 'פתח'}</Text>
      </Pressable>
    </>
  );
}
