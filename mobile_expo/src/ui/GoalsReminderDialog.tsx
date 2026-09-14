// The consolidated monthly Goals reminder dialog (app.js #goals-reminder-overlay).
// Not closable by tapping outside; Android Back = "remind me later" (never a
// confirmation). The app never transfers money — it records what the user did.

import { Modal, ScrollView, View } from 'react-native';

import { useServices } from '../composition/ServicesContext.tsx';
import { buildReminderCustom, buildReminderSummary } from '../presentation/reminderView.ts';
import { AppText, Banner, Btn, Divider, Field } from './kit.tsx';
import { useTheme } from './theme.ts';
import { useStore } from './useStore.ts';

export function GoalsReminderDialog() {
  const { reminder } = useServices();
  const state = useStore(reminder.state);
  const t = useTheme();
  if (!state.open) return null;

  const card = (children: React.ReactNode) => (
    <Modal visible transparent animationType="fade" onRequestClose={() => reminder.postpone()} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.c.overlay, justifyContent: 'center', padding: 16 }}>
        <View testID="reminder-dialog" accessibilityViewIsModal style={{ backgroundColor: t.c.surface, borderRadius: 18, padding: 18, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (state.mode === 'custom') {
    const view = buildReminderCustom(state.due, state.custom);
    return card(
      <>
        <AppText variant="title" center>
          ✏️ עדכון סכום שהועבר בפועל
        </AppText>
        <AppText variant="small" tone="muted" center>
          ניתן לעדכן כל יעד בנפרד, כולל הזנת 0 עבור יעד שלא מומן החודש.
        </AppText>
        {view.rows.map((r) => (
          <View key={r.goalId} style={{ gap: 4 }}>
            <Field
              label={r.title}
              hint={r.remainingText}
              value={r.text}
              keyboardType="numeric"
              onChangeText={(text) => reminder.setCustomAmount(r.goalId, text)}
              error={r.invalid ? 'סכום לא תקין' : null}
              testID={`reminder-custom-${r.goalId}`}
            />
            {r.overRemaining ? (
              <AppText variant="caption" tone="warning">
                הסכום גבוה מהיתרה הנדרשת ליעד זה
              </AppText>
            ) : null}
          </View>
        ))}
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText bold>סה״כ</AppText>
          <AppText bold testID="reminder-custom-total">
            {view.totalText}
          </AppText>
        </View>
        {state.error ? <Banner tone="error" text={state.error} testID="reminder-error" /> : null}
        <Btn label="אישור הקצאה" busy={state.writing} onPress={() => void reminder.confirmCustom()} testID="reminder-confirm-custom" />
        <Btn label="חזרה לסיכום" tone="secondary" disabled={state.writing} onPress={() => reminder.backToSummary()} testID="reminder-back" />
        <AppText variant="caption" tone="muted" center>
          האפליקציה אינה מבצעת את ההעברה בפועל — אישור זה מתעד שההעברה בוצעה על ידך מחוץ לאפליקציה.
        </AppText>
      </>,
    );
  }

  const view = buildReminderSummary(state.due);
  return card(
    <>
      <AppText variant="title" center>
        💰 תזכורת חיסכון חודשית
      </AppText>
      <AppText variant="small" tone="muted" center>
        יש להעביר את הסכומים הבאים לחשבון החיסכון שלך.
      </AppText>
      {view.rows.map((r) => (
        <View key={r.goalId} style={{ backgroundColor: t.c.bg, borderRadius: 12, padding: 10, gap: 2 }} testID={`reminder-row-${r.goalId}`}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <AppText bold style={{ flex: 1 }}>
              {r.title}
            </AppText>
            <AppText bold style={{ flexShrink: 0 }}>
              {r.amountText}
            </AppText>
          </View>
          {r.overdueText ? (
            <AppText variant="caption" tone="danger">
              {r.overdueText}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="muted">
            {r.remainingAfterText}
          </AppText>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText bold>סה״כ מומלץ להעביר</AppText>
        <AppText bold testID="reminder-total">
          {view.totalText}
        </AppText>
      </View>
      {state.error ? <Banner tone="error" text={state.error} testID="reminder-error" /> : null}
      <Btn label="העברתי את הסכום המומלץ" busy={state.writing} onPress={() => void reminder.confirmFull()} testID="reminder-confirm-full" />
      <Btn label="העברתי סכום אחר" tone="secondary" disabled={state.writing} onPress={() => reminder.switchToCustom()} testID="reminder-custom" />
      <AppText variant="caption" tone="muted" center>
        האפליקציה אינה מבצעת את ההעברה בפועל — היא רק רושמת שאישרת שביצעת אותה בעצמך, מחוץ לאפליקציה.
      </AppText>
      <Btn label="הזכר לי מאוחר יותר" tone="ghost" disabled={state.writing} onPress={() => reminder.postpone()} testID="reminder-postpone" />
    </>,
  );
}
