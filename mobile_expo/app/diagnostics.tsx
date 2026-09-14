// Foundation diagnostics (development builds only — the route is guarded by
// __DEV__ in app/_layout.tsx). Exercises every Stage 1 platform seam on a real
// device with synthetic data. Not product UI.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { useServices } from '../src/composition/ServicesContext.tsx';
import { ltr } from '../src/core/bidi.ts';
import { runPersistenceSelfTest, type SelfTestCheck } from '../src/data/persistenceSelfTest.ts';
import { DEVICE_LOCAL_KEYS } from '../src/data/storageKeys.ts';
import { OWNED_NOTIFICATION_IDS } from '../src/notifications/notificationGateway.ts';
import { readDirectionInfo } from '../src/platform/deviceInfo.ts';
import { SECURITY_FAILURE_MESSAGES } from '../src/security/securityTypes.ts';
import { describeAuthState } from '../src/ui/authText.ts';
import { Body, Button, ErrorText, Muted, Row, Screen, Section } from '../src/ui/components.tsx';
import { colors, spacing } from '../src/ui/theme.ts';
import { useStore } from '../src/ui/useStore.ts';

const yesNo = (v: boolean) => (v ? 'כן' : 'לא');

export default function DiagnosticsScreen() {
  const { kv, auth, notifications, notificationInit } = useServices();
  const authState = useStore(auth.state);
  const privacy = useStore(auth.privacyStatus);
  const direction = readDirectionInfo();

  // --- navigation: an in-screen transient that Back must close first ---
  const [transientOpen, setTransientOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!transientOpen) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setTransientOpen(false);
        return true;
      });
      return () => sub.remove();
    }, [transientOpen]),
  );

  // --- persistence ---
  const [checks, setChecks] = useState<SelfTestCheck[] | null>(null);
  const [marker, setMarker] = useState<string | null | undefined>(undefined);
  const [markerVersion, setMarkerVersion] = useState(0);
  const refreshMarker = () => setMarkerVersion((n) => n + 1);
  useEffect(() => {
    let active = true;
    kv.get(DEVICE_LOCAL_KEYS.diagnosticsMarker).then(
      (value) => active && setMarker(value),
      () => active && setMarker('שגיאת קריאה'),
    );
    return () => {
      active = false;
    };
  }, [kv, markerVersion]);

  // --- security ---
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);

  // --- notifications ---
  const [permission, setPermission] = useState<string>('—');
  const [pending, setPending] = useState<string>('—');
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [notifyVersion, setNotifyVersion] = useState(0);
  const refreshNotifications = () => setNotifyVersion((n) => n + 1);
  useEffect(() => {
    let active = true;
    void Promise.all([notifications.permissionStatus(), notifications.pendingOwnedIds()]).then(([p, ids]) => {
      if (!active) return;
      setPermission(p.ok ? p.value : `שגיאה (${p.error.kind})`);
      setPending(ids.ok ? (ids.value.length === 0 ? 'אין' : ids.value.join(', ')) : `שגיאה (${ids.error.kind})`);
    });
    return () => {
      active = false;
    };
  }, [notifications, notifyVersion]);

  return (
    <Screen testID="screen-diagnostics">
      <Section title="ניווט">
        <Button label="פתיחת חלונית זמנית" tone="secondary" testID="diag-open-transient" onPress={() => setTransientOpen(true)} />
        {transientOpen ? (
          <View style={styles.transient} testID="diag-transient">
            <Body>חלונית זמנית פתוחה — Back סוגר אותה לפני המסך.</Body>
          </View>
        ) : null}
      </Section>

      <Section title="כיוון ושפה">
        <Row label="RTL מההפעלה" value={yesNo(direction.isRTL)} testID="diag-rtl" />
        <Row label="שפת מכשיר" value={ltr(direction.locale)} />
        <Row label="כיוון שפה" value={ltr(direction.localeDirection ?? '—')} />
        <Row label="אזור זמן" value={ltr(direction.timeZone ?? '—')} />
      </Section>

      <Section title="אחסון (SQLite)">
        <Button
          label="הרצת בדיקה עצמית"
          testID="diag-selftest"
          onPress={() => {
            setChecks(null);
            runPersistenceSelfTest(kv)
              .then(setChecks)
              .catch(() => setChecks([{ name: 'self-test threw', pass: false }]));
          }}
        />
        {checks?.map((c) => (
          <Row key={c.name} label={c.name} value={c.pass ? 'PASS' : 'FAIL'} testID={`diag-check-${c.pass ? 'pass' : 'fail'}`} />
        ))}
        <Row label="סימון שרידות" value={marker === undefined ? '…' : marker === null ? 'אין' : ltr(marker)} testID="diag-marker" />
        <Button
          label="כתיבת סימון"
          tone="secondary"
          testID="diag-marker-write"
          onPress={() => void kv.set(DEVICE_LOCAL_KEYS.diagnosticsMarker, `written-${new Date().toISOString()}`).then(refreshMarker)}
        />
        <Button
          label="מחיקת סימון"
          tone="secondary"
          testID="diag-marker-clear"
          onPress={() => void kv.remove(DEVICE_LOCAL_KEYS.diagnosticsMarker).then(refreshMarker)}
        />
      </Section>

      <Section title="אבטחה (מנעול תשתית — לא PIN)">
        <Row label="מצב" value={describeAuthState(authState)} testID="diag-auth-state" />
        <Row
          label="הגנת מסך"
          value={privacy.mode === null ? '—' : `${privacy.mode}${privacy.lastApplyFailed ? ' (נכשל)' : ''}`}
          testID="diag-privacy"
        />
        <Muted>קוד התשתית הסינתטי: {ltr('2468')}. אינו סוד ואינו אימות.</Muted>
        <Button
          label="הפעלת מנעול תשתית"
          testID="diag-lock-enable"
          disabled={authState.kind !== 'notConfigured'}
          onPress={() =>
            void auth.configureFoundationLock().then((r) => setSecurityMessage(r.ok ? 'המנעול הופעל' : SECURITY_FAILURE_MESSAGES[r.error.kind]))
          }
        />
        <Button
          label="הסרת מנעול תשתית"
          tone="danger"
          testID="diag-lock-remove"
          disabled={authState.kind !== 'unlocked'}
          onPress={() => void auth.removeLock().then((r) => setSecurityMessage(r.ok ? 'המנעול הוסר' : SECURITY_FAILURE_MESSAGES[r.error.kind]))}
        />
        {securityMessage !== null ? <Muted testID="diag-security-message">{securityMessage}</Muted> : null}
      </Section>

      <Section title="התראות מקומיות">
        {notificationInit.ok ? null : <ErrorText>אתחול ההתראות נכשל ({notificationInit.error.kind})</ErrorText>}
        <Row label="הרשאה" value={ltr(permission)} testID="diag-notif-permission" />
        <Row label="מתוזמנות" value={ltr(pending)} testID="diag-notif-pending" />
        <Button
          label="בקשת הרשאה"
          testID="diag-notif-request"
          onPress={() => void notifications.requestPermission().then(refreshNotifications)}
        />
        <Button
          label="התראת בדיקה בעוד 20 שניות"
          testID="diag-notif-20s"
          onPress={() =>
            void notifications
              .schedule({
                id: OWNED_NOTIFICATION_IDS.foundationTest,
                title: 'FamilyFinance — בדיקה',
                body: 'התראת בדיקה מקומית. אין בה מידע פיננסי.',
                at: new Date(Date.now() + 20_000),
                payload: { ffRoute: 'goals' },
              })
              .then((r) => {
                setNotifyMessage(r.ok ? 'תוזמנה' : `נכשל (${r.error.kind})`);
                return refreshNotifications();
              })
          }
        />
        <Button
          label="ביטול התראת הבדיקה"
          tone="secondary"
          testID="diag-notif-cancel"
          onPress={() =>
            void notifications.cancel(OWNED_NOTIFICATION_IDS.foundationTest).then((r) => {
              setNotifyMessage(r.ok ? 'בוטלה' : `נכשל (${r.error.kind})`);
              return refreshNotifications();
            })
          }
        />
        {notifyMessage !== null ? <Muted testID="diag-notif-message">{notifyMessage}</Muted> : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  transient: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: spacing.m,
  },
});
