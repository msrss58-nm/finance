// Foundation diagnostics (development builds only — the route is guarded by
// __DEV__ in app/_layout.tsx). Exercises every Stage 1 platform seam on a real
// device with synthetic data. Not product UI.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { useServices } from '../src/composition/ServicesContext.tsx';
import { buildSyntheticBackup } from '../src/composition/syntheticDataset.ts';
import { ltr } from '../src/core/bidi.ts';
import { runPersistenceSelfTest, type SelfTestCheck } from '../src/data/persistenceSelfTest.ts';
import { DEVICE_LOCAL_KEYS } from '../src/data/storageKeys.ts';
import { OWNED_NOTIFICATION_IDS } from '../src/notifications/notificationGateway.ts';
import { readDirectionInfo } from '../src/platform/deviceInfo.ts';
import { expoPinKdf } from '../src/platform/expoPinKdf.ts';
import { KDF_KNOWN_ANSWER } from '../src/security/pinKdfSelfTest.ts';
import { SECURITY_FAILURE_MESSAGES } from '../src/security/securityTypes.ts';
import { describeAuthState } from '../src/ui/authText.ts';
import { Body, Button, ErrorText, Muted, Row, Screen, Section } from '../src/ui/components.tsx';
import { FileOperationPanel } from '../src/ui/FileOperationPanel.tsx';
import { ConfirmDialog } from '../src/ui/kit.tsx';
import { colors, spacing } from '../src/ui/theme.ts';
import { useStore } from '../src/ui/useStore.ts';

const yesNo = (v: boolean) => (v ? 'כן' : 'לא');

export default function DiagnosticsScreen() {
  const { kv, auth, notifications, notificationInit, finance, files } = useServices();
  const [seedConfirm, setSeedConfirm] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [kdfResult, setKdfResult] = useState<string | null>(null);

  // Native KDF self-test + timing: the public known-answer vector, then 3
  // derivations and 3 verifications at 100,000 iterations with a synthetic
  // input. Shows only verdicts and milliseconds — never a salt or verifier.
  const runKdfCheck = async () => {
    setKdfResult('running…');
    const v = KDF_KNOWN_ANSWER;
    const known = await expoPinKdf.deriveVerifier(v.pin, v.saltB64, v.iterations);
    if (!known.ok) {
      setKdfResult('vector: FAIL (' + known.error.kind + ')');
      return;
    }
    const derive: number[] = [];
    const verify: number[] = [];
    let saltB64 = '';
    let verifierB64 = '';
    for (let i = 0; i < 3; i++) {
      const salt = await expoPinKdf.generateSalt();
      if (!salt.ok) return setKdfResult('salt: FAIL (' + salt.error.kind + ')');
      saltB64 = salt.value;
      let t0 = Date.now();
      const d = await expoPinKdf.deriveVerifier('13579', saltB64, v.iterations);
      derive.push(Date.now() - t0);
      if (!d.ok) return setKdfResult('derive: FAIL (' + d.error.kind + ')');
      verifierB64 = d.value;
      t0 = Date.now();
      const good = await expoPinKdf.verifyPin('13579', saltB64, v.iterations, verifierB64);
      verify.push(Date.now() - t0);
      if (!good.ok || good.value !== true) return setKdfResult('verify: FAIL');
    }
    const wrong = await expoPinKdf.verifyPin('97531', saltB64, v.iterations, verifierB64);
    const weak = await expoPinKdf.deriveVerifier('13579', saltB64, 1000);
    setKdfResult(
      'vector=' + (known.value === v.verifierB64 ? 'MATCH' : 'MISMATCH') +
        ' derive=' + derive.join('/') + 'ms verify=' + verify.join('/') + 'ms' +
        ' wrongPin=' + (wrong.ok ? String(wrong.value) : 'error') +
        ' weakParams=' + (weak.ok ? 'ACCEPTED' : 'refused'),
    );
  };
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

      <Section title="KDF של PIN (וקטור וזמנים)">
        <Muted>וקטור ציבורי סינתטי מול המודול הנייטיבי, ואז 3 גזירות ו-3 אימותים ב-100,000 איטרציות.</Muted>
        <Button label="הרצת בדיקת KDF" testID="diag-kdf-run" onPress={() => void runKdfCheck()} />
        {kdfResult !== null ? <Muted testID="diag-kdf-result">{ltr(kdfResult)}</Muted> : null}
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

      <Section title="נתונים סינתטיים (פיתוח)">
        <Muted>מחליף את הנתונים הפיננסיים במכשיר בנתוני בדיקה, דרך מסלול השחזור המאומת והאטומי. למכשיר בדיקה בלבד.</Muted>
        <Button label="טעינת נתונים סינתטיים" tone="danger" testID="diag-seed" onPress={() => setSeedConfirm(true)} />
        {seedMessage !== null ? <Muted testID="diag-seed-message">{seedMessage}</Muted> : null}
      </Section>

      <FileOperationPanel files={files} />

      <ConfirmDialog
        visible={seedConfirm}
        title="להחליף את הנתונים בנתוני בדיקה?"
        message="כל הנתונים הפיננסיים הנוכחיים יוחלפו."
        confirmLabel="החלפה"
        destructive
        onCancel={() => setSeedConfirm(false)}
        onConfirm={() => {
          setSeedConfirm(false);
          void finance.restoreBackup(buildSyntheticBackup(new Date()), true).then((o) => setSeedMessage(o.ok ? `נטענו ${o.count ?? 0} מפתחות` : o.message));
        }}
        testID="diag-seed-dialog"
      />
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
