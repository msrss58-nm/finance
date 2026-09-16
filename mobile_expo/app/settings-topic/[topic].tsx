// One settings topic (app.js renderSettingsDetailScreen()). Back always
// returns to the topics menu.

import Constants from 'expo-constants';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { FONT_SIZE_OPTIONS, PRIMARY_COLOR_OPTIONS, resolveAppearance, THEME_OPTIONS, type AppearanceField } from '../../src/domain/appearance.ts';
import { getProjectedBalanceOpeningConfig, type NotificationFlags } from '../../src/domain/settings.ts';
import type { GoalsReminderStatus } from '../../src/notifications/goalsReminderScheduler.ts';
import { formatAmount, formatDate } from '../../src/presentation/format.ts';
import { buildActivityRows, isSettingsTopicKey, SETTINGS_TOPICS, WHATS_NEW, type SettingsTopicKey } from '../../src/presentation/settingsView.ts';
import { SECURITY_FAILURE_MESSAGES } from '../../src/security/securityTypes.ts';
import type { RestorePreview } from '../../src/state/backupController.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import {
  AppText,
  Banner,
  Btn,
  ButtonRow,
  Card,
  Choice,
  ColorSwatchRow,
  Divider,
  EmptyState,
  Field,
  LabelValue,
  PillToggleRow,
  ScreenScroll,
  ToggleRow,
  useBackCloses,
} from '../../src/ui/kit.tsx';
import { PRIMARY_SWATCH } from '../../src/ui/theme.ts';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';
import { useStore } from '../../src/ui/useStore.ts';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function SettingsTopicRoute() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const topic = one(params.topic);
  if (!isSettingsTopicKey(topic)) {
    return (
      <ScreenScroll>
        <Stack.Screen options={{ title: 'הגדרות' }} />
        <EmptyState text="הנושא לא נמצא." />
      </ScreenScroll>
    );
  }
  const meta = SETTINGS_TOPICS.find((t) => t.key === topic);
  return (
    <>
      <Stack.Screen options={{ title: meta ? meta.icon + ' ' + meta.label : 'הגדרות' }} />
      <WithFinance>{(s) => <TopicBody topic={topic} snapshot={s} />}</WithFinance>
    </>
  );
}

function TopicBody({ topic, snapshot }: { topic: SettingsTopicKey; snapshot: FinanceSnapshot }) {
  switch (topic) {
    case 'security':
      return <SecurityTopic snapshot={snapshot} />;
    case 'appearance':
      return <AppearanceTopic snapshot={snapshot} />;
    case 'notifications':
      return <NotificationsTopic snapshot={snapshot} />;
    case 'data':
      return <DataTopic />;
    case 'openingBalance':
      return <OpeningBalanceTopic snapshot={snapshot} />;
    case 'activityLog':
      return <ActivityLogTopic snapshot={snapshot} />;
    case 'experimental':
      return (
        <ScreenScroll testID="settings-experimental">
          <EmptyState text="אין כרגע אפשרויות ניסיוניות פעילות." />
        </ScreenScroll>
      );
    case 'about':
      return <AboutTopic />;
  }
}

type PinFormMode = 'none' | 'set' | 'change' | 'remove';

// PIN set / change / remove (app.js buildSettingsPinSectionHtml(), Flutter
// _PinSecuritySection): inline forms, 4–6 digits, confirmation, and the current
// PIN before any change or removal. The Web's "שכחתי את הקוד" (removing the PIN
// without verifying it) is deliberately NOT offered: it would bypass the lock.
// Nothing here renders or logs a PIN; errors are fixed messages.
function SecurityTopic({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { auth } = useServices();
  const state = useStore(auth.state);
  const source = useStore(auth.lockSource);
  const privacy = useStore(auth.privacyStatus);
  const s = snapshot.data.settings;
  const webPinPresent = s.pinEnabled === true && typeof s.pinHash === 'string' && s.pinHash !== '';
  const [mode, setMode] = useState<PinFormMode>('none');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearFields = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };
  const close = useCallback(() => {
    setMode('none');
    setError(null);
    setCurrent('');
    setNext('');
    setConfirm('');
  }, []);
  useBackCloses(mode !== 'none' && !busy, close);
  const open = (m: PinFormMode) => {
    close();
    setNotice(null);
    setMode(m);
  };
  const pinOn = source === 'pin';
  const submit = () => {
    if (busy || mode === 'none') return;
    const doing = mode;
    setBusy(true);
    setError(null);
    const action = doing === 'set' ? auth.setPin(next, confirm) : doing === 'change' ? auth.changePin(current, next, confirm) : auth.removePin(current);
    void action.then((r) => {
      setBusy(false);
      clearFields();
      if (r.ok) {
        close();
        setNotice(doing === 'set' ? 'PIN הופעל.' : doing === 'change' ? 'הקוד עודכן.' : 'PIN בוטל.');
      } else {
        setError(SECURITY_FAILURE_MESSAGES[r.error.kind]);
      }
    });
  };
  return (
    // app.js buildSettingsPinSectionHtml() + buildAutoLockSectionHtml(): flat on the page, no cards.
    <ScreenScroll testID="settings-security">
      <>
        <AppText variant="small" tone="muted" testID="security-pin-hint">
          {pinOn
            ? 'PIN פעיל. הנתונים המקומיים אינם מוצפנים — זו נעילת פרטיות למסך בלבד.'
            : 'PIN כבוי. הנתונים המקומיים אינם מוצפנים — PIN מוסיף נעילת פרטיות למסך בלבד.'}
        </AppText>
        {notice ? <Banner tone="success" text={notice} onDismiss={() => setNotice(null)} testID="security-pin-notice" /> : null}
        {mode === 'none' ? (
          pinOn ? (
            <ButtonRow>
              <Btn label="שנה קוד" onPress={() => open('change')} flex testID="pin-open-change" />
              <Btn label="בטל PIN" tone="secondary" onPress={() => open('remove')} flex testID="pin-open-remove" />
            </ButtonRow>
          ) : state.kind === 'notConfigured' ? (
            <Btn label="+ הגדר PIN" tone="dashed" onPress={() => open('set')} testID="pin-open-set" />
          ) : null
        ) : (
          <>
            {mode !== 'set' ? (
              <Field label="קוד נוכחי" value={current} onChangeText={setCurrent} keyboardType="number-pad" maxLength={6} secure testID="pin-current" />
            ) : null}
            {mode !== 'remove' ? (
              <>
                <Field label="קוד חדש (4–6 ספרות)" value={next} onChangeText={setNext} keyboardType="number-pad" maxLength={6} secure testID="pin-new" />
                <Field
                  label={mode === 'set' ? 'אימות קוד' : 'אימות קוד חדש'}
                  value={confirm}
                  onChangeText={setConfirm}
                  keyboardType="number-pad"
                  maxLength={6}
                  secure
                  testID="pin-confirm"
                />
              </>
            ) : null}
            {error ? <Banner tone="error" text={error} testID="pin-error" /> : null}
            <ButtonRow>
              <Btn
                label={mode === 'set' ? 'הפעל PIN' : mode === 'change' ? 'שמור קוד חדש' : 'בטל PIN'}
                tone={mode === 'remove' ? 'danger' : 'primary'}
                busy={busy}
                onPress={submit}
                flex
                testID="pin-submit"
              />
              <Btn label="ביטול" tone="secondary" disabled={busy} onPress={close} flex testID="pin-cancel" />
            </ButtonRow>
          </>
        )}
        {webPinPresent ? (
          <AppText variant="small" tone="muted">
            קוד PIN שהוגדר בגרסת הדפדפן אינו מועבר לאפליקציה ואינו פעיל בה.
          </AppText>
        ) : null}
      </>
      {/* Native deviation: Android locks immediately on every move to the background (no timeout select). */}
      <AppText bold style={{ marginTop: 6 }}>
        נעילה אוטומטית
      </AppText>
      <AppText variant="small" tone="muted">
        {pinOn
          ? 'האפליקציה ננעלת מיד בכל מעבר לרקע, צילומי מסך נחסמים והתוכן מוסתר במסך האפליקציות האחרונות. הקשה על התראה או חזרה מבורר קבצים אינן עוקפות את הנעילה.'
          : 'יש להפעיל PIN כדי להשתמש בנעילה אוטומטית.'}
      </AppText>
      <LabelValue
        label="הגנת מסך כעת"
        value={privacy.mode === 'protected' ? 'פעילה' : privacy.mode === 'open' ? 'כבויה (אין נעילה מוגדרת)' : '—'}
        testID="security-privacy"
      />
    </ScreenScroll>
  );
}

function AppearanceTopic({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { finance } = useServices();
  const write = useWrite();
  const a = resolveAppearance(snapshot.data.settings);
  const set = (field: AppearanceField) => (value: string) => void write.run(() => finance.setAppearance(field, value));
  return (
    <ScreenScroll testID="settings-appearance">
      <Choice label="ערכת נושא" options={THEME_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} value={a.theme} onChange={set('theme')} testID="appearance-theme" />
      <ColorSwatchRow
        label="צבע ראשי"
        options={PRIMARY_COLOR_OPTIONS.map((o) => ({ value: o.key, label: o.label, color: PRIMARY_SWATCH[o.key] }))}
        value={a.primaryColor}
        onChange={set('primaryColor')}
        testID="appearance-color"
      />
      <Choice label="גודל גופן" options={FONT_SIZE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} value={a.fontSize} onChange={set('fontSize')} testID="appearance-font" />
      {write.failure ? <Banner tone="error" text={write.failure.message} /> : null}
    </ScreenScroll>
  );
}

const IN_APP_ALERTS: readonly { readonly key: keyof NotificationFlags; readonly label: string }[] = [
  { key: 'upcomingPayment', label: 'תשלום שצפוי מחר' },
  { key: 'upcomingIncome', label: 'הכנסה שצפויה מחר' },
  { key: 'completedObligation', label: 'התחייבות שהסתיימה' },
];

function reminderStatusText(status: GoalsReminderStatus): string {
  if (!status.prefs.enabled) return 'התזכורת כבויה — אין התראות מתוזמנות.';
  switch (status.sync) {
    case 'scheduled':
      return status.scheduledFor ? 'התזכורת הבאה: ' + formatDate(status.scheduledFor) + ' בשעה 09:00.' : 'התזכורת מתוזמנת.';
    case 'nothingToRemind':
      return 'אין כרגע יעד שדורש העברה במועד התזכורת הבא — לא תוזמנה התראה.';
    case 'permissionMissing':
      return 'ההתראות אינן מאושרות במכשיר — לא תוזמנה התראה. ניתן לאשר אותן בהגדרות המערכת.';
    case 'goalsDataInvalid':
      return 'נתוני היעדים פגומים — לא תוזמנה תזכורת.';
    case 'failed':
      return 'תזמון ההתראה נכשל.';
    case 'disabled':
      return 'התזכורת כבויה — אין התראות מתוזמנות.';
    case null:
      return 'בודק…';
  }
}

function NotificationsTopic({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { finance, reminderScheduler } = useServices();
  const status = useStore(reminderScheduler.status);
  const write = useWrite();
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void reminderScheduler.reconcile();
    }, [reminderScheduler]),
  );
  const flags = snapshot.data.settings.notifications;
  const toggleReminder = (on: boolean) => {
    setBusy(true);
    void (on ? reminderScheduler.enable() : reminderScheduler.disable()).finally(() => setBusy(false));
  };
  return (
    // app.js buildNotificationsSectionHtml(): the hint, then label + "פעיל"/"כבוי" pill rows.
    <ScreenScroll testID="settings-notifications">
      <AppText variant="small" tone="muted">
        התראות אלה מוצגות בתוך האפליקציה בלבד, כשהיא פתוחה — אינן התראות מערכת (Push).
      </AppText>
      {IN_APP_ALERTS.map((d) => (
        <PillToggleRow key={d.key} label={d.label} value={flags[d.key]} disabled={write.busy} onChange={(v) => void write.run(() => finance.setInAppAlert(d.key, v))} testID={`alert-toggle-${d.key}`} />
      ))}
      {/* Native addition (approved Stage 3): the Goals system reminder. */}
      <Divider />
      <AppText bold>תזכורת יעדים (התראת מערכת)</AppText>
      <PillToggleRow
        label="תזכורת חודשית ב-2 לחודש בשעה 09:00"
        value={status.prefs.enabled}
        disabled={busy}
        onChange={toggleReminder}
        hint="ההתראה כללית ואינה מציגה סכומים או שמות יעדים. הקשה עליה פותחת את מסך היעדים לאחר ביטול הנעילה."
        testID="reminder-toggle"
      />
      <AppText variant="small" tone="muted" testID="reminder-status">
        {reminderStatusText(status)}
      </AppText>
      {status.prefs.enabled && status.permission !== null && status.permission !== 'granted' ? (
        <Btn label="פתיחת הגדרות המערכת" tone="secondary" onPress={() => void Linking.openSettings()} testID="reminder-open-settings" />
      ) : null}
      {write.failure ? <Banner tone="error" text={write.failure.message} /> : null}
    </ScreenScroll>
  );
}

function DataTopic() {
  const { backup, files } = useServices();
  const s = useStore(backup.state);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const busy = s.busy !== null;
  const closeReset = useCallback(() => setResetOpen(false), []);
  const closePaste = useCallback(() => {
    setPasteOpen(false);
    setPasteText('');
  }, []);
  const cancelRestore = useCallback(() => backup.cancelRestore(), [backup]);
  useBackCloses(resetOpen, closeReset);
  useBackCloses(pasteOpen && !resetOpen, closePaste);
  useBackCloses(s.preview !== null && !resetOpen && !pasteOpen, cancelRestore);

  // app.js openRestorePastePanel(): a pending preview is dropped first.
  const openPaste = () => {
    if (s.preview !== null) backup.cancelRestore();
    backup.dismissMessage();
    setPasteText('');
    setPasteOpen(true);
  };
  const checkPaste = () => {
    void backup.checkPastedBackup(pasteText).then((ok) => {
      if (ok) closePaste();
    });
  };

  // app.js buildDataSectionHtml(): the action stack, then the paste panel and the
  // restore preview / result DIRECTLY below it — where the user just tapped —
  // then the danger zone. The preview used to render at the top of the screen,
  // out of view once the user had scrolled down to "שחזור", so a correctly
  // picked backup looked like "nothing happened" (Stage 3/4A recovery, A54).
  return (
    <ScreenScroll testID="settings-data">
      {files.supportsFolderExport ? (
        <Btn label="⬇️ גיבוי (הורדת קובץ JSON)" tone="dashed" busy={s.busy === 'export'} disabled={busy} onPress={() => void backup.exportBackup('folder')} testID="data-export-folder" />
      ) : null}
      <Btn label="📤 גיבוי (שיתוף קובץ JSON)" tone="dashed" disabled={busy} onPress={() => void backup.exportBackup('share')} testID="data-export-share" />
      <Btn
        label="⬆️ שחזור מגיבוי"
        tone="dashed"
        busy={s.busy === 'import' && !pasteOpen}
        disabled={busy || s.preview !== null}
        onPress={() => {
          closePaste();
          void backup.startImport();
        }}
        testID="data-import"
      />
      <Btn label="📋 הדבק גיבוי" tone="dashed" disabled={busy} onPress={openPaste} testID="data-paste" />
      <Btn label="📄 ייצוא תנועות ל-CSV" tone="dashed" busy={s.busy === 'csv'} disabled={busy} onPress={() => void backup.exportCsv('share')} testID="data-export-csv" />
      {pasteOpen ? (
        <Card testID="data-paste-panel">
          <Field label="פתח את קובץ הגיבוי, העתק את כל תוכנו והדבק כאן." value={pasteText} onChangeText={setPasteText} multiline testID="data-paste-text" />
          <ButtonRow>
            <Btn label="בדוק גיבוי" busy={s.busy === 'import'} onPress={checkPaste} flex testID="data-paste-check" />
            <Btn label="ביטול" tone="secondary" onPress={closePaste} flex testID="data-paste-cancel" />
          </ButtonRow>
        </Card>
      ) : null}
      {s.message ? <Banner tone={s.message.tone} text={s.message.text} onDismiss={() => backup.dismissMessage()} testID="data-message" /> : null}
      {s.preview ? <RestorePreviewCard preview={s.preview} /> : null}
      {/* .settings-danger-zone: a top border, then the outlined danger button / inline confirm. */}
      <Divider />
      <>
        {!resetOpen ? (
          <Btn
            label="🗑️ איפוס כל הנתונים"
            tone="danger"
            disabled={busy}
            onPress={() => {
              setResetText('');
              setResetOpen(true);
            }}
            testID="data-reset"
          />
        ) : (
          <>
            <AppText variant="small" tone="danger">
              פעולה זו תמחק לצמיתות את כל הנתונים, הקטגוריות, ההגדרות, היעדים ויומן הפעילות. לא ניתן לבטל לאחר הביצוע.
            </AppText>
            <Field label='הקלד/י "איפוס" לאישור' value={resetText} onChangeText={setResetText} testID="data-reset-word" />
            <ButtonRow>
              <Btn
                label="מחק הכל"
                tone="danger"
                busy={s.busy === 'reset'}
                onPress={() =>
                  void backup.resetAllData(resetText).then((ok) => {
                    if (ok) setResetOpen(false);
                  })
                }
                flex
                testID="data-reset-confirm"
              />
              <Btn label="ביטול" tone="secondary" disabled={s.busy === 'reset'} onPress={() => setResetOpen(false)} flex testID="data-reset-cancel" />
            </ButtonRow>
          </>
        )}
      </>
    </ScreenScroll>
  );
}

function RestorePreviewCard({ preview: p }: { preview: RestorePreview }) {
  const { backup } = useServices();
  const s = useStore(backup.state);
  const goalsLine = p.goalsAware
    ? String(p.backupGoalsCount ?? 0)
    : p.localGoalsValid
      ? 'לא כלולים בגיבוי זה — היעדים הקיימים במכשיר (' + p.localGoalsCount + ') יישמרו'
      : 'לא כלולים בגיבוי זה — הנתונים הקיימים במכשיר פגומים ויישמרו ללא שינוי';
  return (
    <Card accent="warning" testID="restore-preview">
      <AppText bold>הגיבוי שנבחר יחליף את הנתונים הנוכחיים:</AppText>
      {!p.goalsAware ? (
        <AppText variant="small">הגיבוי נוצר לפני הוספת מערכת היעדים. הנתונים הכספיים ישוחזרו והיעדים הקיימים יישמרו.</AppText>
      ) : null}
      <LabelValue label="תנועות" value={String(p.itemCount)} testID="restore-items" />
      <LabelValue label="קטגוריות" value={String(p.categoryCount)} />
      <LabelValue label="הגדרות" value={p.hasSettings ? 'כן' : 'לא'} />
      <LabelValue label="יומן פעילות" value={p.activityCount + ' רשומות'} />
      <LabelValue label="יעדים" value={goalsLine} testID="restore-goals" />
      {!p.goalsAware && p.localGoalsRawPresent ? (
        <>
          <ToggleRow
            label={p.localGoalsValid ? 'למחוק גם את ' + p.localGoalsCount + ' היעדים הקיימים במכשיר' : 'למחוק גם את נתוני היעדים הפגומים במכשיר'}
            value={s.deleteExistingGoals}
            onChange={(v) => backup.setDeleteExistingGoals(v)}
            testID="restore-delete-goals"
          />
          {s.deleteExistingGoals ? (
            <AppText variant="small" tone="danger">
              כל נתוני היעדים הקיימים יימחקו לצמיתות בעת השחזור. לא ניתן לבטל לאחר הביצוע.
            </AppText>
          ) : null}
        </>
      ) : null}
      <Btn
        label={s.deleteExistingGoals ? 'כן, שחזר ודרוס נתונים קיימים (וגם מחק את היעדים)' : 'כן, שחזר ודרוס נתונים קיימים'}
        tone="danger"
        busy={s.busy === 'restore'}
        onPress={() => void backup.confirmRestore()}
        testID="restore-confirm"
      />
      <Btn label="ביטול" tone="secondary" disabled={s.busy === 'restore'} onPress={() => backup.cancelRestore()} testID="restore-cancel" />
    </Card>
  );
}

function OpeningBalanceTopic({ snapshot }: { snapshot: FinanceSnapshot }) {
  const push = useSafePush();
  const opening = getProjectedBalanceOpeningConfig(snapshot.data.settings);
  return (
    <ScreenScroll testID="settings-opening">
      <AppText variant="small" tone="muted">
        היתרה משמשת נקודת התחלה חד־פעמית לחישוב היתרה הצפויה. לאחר מכן ההכנסות וההוצאות מתווספות ומופחתות אוטומטית לפי התאריך שלהן.
      </AppText>
      {/* app.js buildOpeningBalanceSectionHtml(): flat סכום / תאריך rows (raw YYYY-MM-DD), dashed action. */}
      {opening ? (
        <>
          <LabelValue label="סכום" value={formatAmount(opening.amount)} testID="settings-opening-amount" />
          <LabelValue label="תאריך" value={opening.dateStr} />
        </>
      ) : null}
      <Btn label={opening ? 'תקן יתרת התחלה' : '+ הגדר יתרת התחלה'} tone="dashed" onPress={() => push('/opening-balance')} testID="settings-opening-edit" />
    </ScreenScroll>
  );
}

function ActivityLogTopic({ snapshot }: { snapshot: FinanceSnapshot }) {
  const rows = useMemo(() => buildActivityRows(snapshot.data.activityLog), [snapshot]);
  return (
    <ScreenScroll testID="settings-activity">
      {rows.length === 0 ? (
        <EmptyState text="אין עדיין רשומות ביומן הפעילות." />
      ) : (
        rows.map((r) => (
          <Card key={r.key}>
            <AppText bold>{r.label}</AppText>
            {r.detail ? <AppText variant="small">{r.detail}</AppText> : null}
            <AppText variant="caption" tone="muted">
              {r.ts}
            </AppText>
          </Card>
        ))
      )}
    </ScreenScroll>
  );
}

function AboutTopic() {
  return (
    <ScreenScroll testID="settings-about">
      {/* app.js buildAboutSectionHtml(): version, "מה חדש" list, local-data hint. */}
      <Card>
        <LabelValue label="גרסה" value={Constants.expoConfig?.version ?? '—'} />
        <AppText bold style={{ marginTop: 10 }}>
          מה חדש
        </AppText>
        {WHATS_NEW.map((line) => (
          <AppText key={line} testID="about-whats-new-item">
            {'• ' + line}
          </AppText>
        ))}
        <AppText variant="small" tone="muted" style={{ marginTop: 10 }}>
          FamilyFinance PRO — אפליקציה מקומית לניהול תקציב משפחתי. כל הנתונים נשמרים במכשיר בלבד.
        </AppText>
      </Card>
    </ScreenScroll>
  );
}
