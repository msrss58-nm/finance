// Create / edit a savings goal (app.js buildGoalFormHtml / saveNewGoal /
// saveGoalEdit). With components, the target is their sum and not editable.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useServices } from '../src/composition/ServicesContext.tsx';
import { goalTargetAmount } from '../src/domain/goalsPlanning.ts';
import { formatAmount } from '../src/presentation/format.ts';
import type { FinanceSnapshot } from '../src/state/financeController.ts';
import { AppText, Banner, Btn, ButtonRow, Card, DateField, EmptyState, Field, FormScreen } from '../src/ui/kit.tsx';
import { fieldError, useWrite, WithFinance } from '../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function GoalFormRoute() {
  const params = useLocalSearchParams<{ goalId?: string }>();
  return <WithFinance>{(s) => <GoalForm snapshot={s} goalId={one(params.goalId) || null} />}</WithFinance>;
}

function GoalForm({ snapshot, goalId }: { snapshot: FinanceSnapshot; goalId: string | null }) {
  const { finance, reminder } = useServices();
  const router = useRouter();
  const goal = goalId === null ? null : (snapshot.data.goalsState.goals.find((g) => g.id === goalId) ?? null);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : '');
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? '');
  const [savedAmount, setSavedAmount] = useState(goal ? String(goal.savedAmount) : '');
  const write = useWrite();

  if (!snapshot.data.goalsState.valid || (goalId !== null && goal === null)) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'יעד' }} />
        <EmptyState text={snapshot.data.goalsState.valid ? 'היעד לא נמצא.' : 'נתוני היעדים פגומים — לא ניתן לערוך.'} />
      </FormScreen>
    );
  }
  const hasComponents = goal !== null && goal.components.length > 0;
  const values = { title, targetAmount, dueDate, savedAmount };

  const save = () => {
    void write.run(() => (goal ? finance.editGoal(goal.id, values) : finance.createGoal(values))).then((o) => {
      if (!o?.ok) return;
      router.back();
      // app.js saveNewGoal(): a newly created goal may make the monthly reminder due right away.
      if (!goal) reminder.check();
    });
  };

  return (
    <FormScreen testID="screen-goal-form">
      <Stack.Screen options={{ title: goal ? 'עריכת יעד' : 'יעד חיסכון חדש' }} />
      <Field label="שם היעד" placeholder="לדוגמה: ביטוח רכב" value={title} onChangeText={setTitle} error={fieldError(write.failure, 'title')} testID="goal-title" />
      {hasComponents && goal ? (
        <Card>
          <AppText variant="small" tone="muted">
            סכום יעד (מחושב אוטומטית מסכום הרכיבים)
          </AppText>
          <AppText bold>{formatAmount(goalTargetAmount(goal))}</AppText>
        </Card>
      ) : (
        <Field label="סכום יעד" keyboardType="numeric" placeholder="₪" value={targetAmount} onChangeText={setTargetAmount} error={fieldError(write.failure, 'targetAmount')} testID="goal-amount" />
      )}
      <DateField label="תאריך יעד" value={dueDate} onChange={setDueDate} error={fieldError(write.failure, 'dueDate')} testID="goal-date" />
      <Field label="נחסך כבר (לא חובה)" keyboardType="numeric" placeholder="₪0" value={savedAmount} onChangeText={setSavedAmount} error={fieldError(write.failure, 'savedAmount')} testID="goal-saved" />
      {write.failure && write.failure.kind === 'failed' ? <Banner tone="error" text={write.failure.message} /> : null}
      <ButtonRow>
        <Btn label="💾 שמור יעד" busy={write.busy} onPress={save} flex testID="goal-save" />
        <Btn label="ביטול" tone="secondary" disabled={write.busy} onPress={() => router.back()} flex testID="goal-cancel" />
      </ButtonRow>
    </FormScreen>
  );
}
