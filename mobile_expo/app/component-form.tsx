// Add / edit one goal component (app.js buildComponentFormHtml /
// saveNewComponent / saveComponentEdit). The goal's stored target follows the
// component sum (domain), never an independently edited total.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useServices } from '../src/composition/ServicesContext.tsx';
import type { FinanceSnapshot } from '../src/state/financeController.ts';
import { AppText, Banner, Btn, ButtonRow, DateField, EmptyState, Field, FormScreen } from '../src/ui/kit.tsx';
import { fieldError, useWrite, WithFinance } from '../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function ComponentFormRoute() {
  const params = useLocalSearchParams<{ goalId?: string; componentId?: string }>();
  return <WithFinance>{(s) => <ComponentForm snapshot={s} goalId={one(params.goalId) ?? ''} componentId={one(params.componentId) || null} />}</WithFinance>;
}

function ComponentForm({ snapshot, goalId, componentId }: { snapshot: FinanceSnapshot; goalId: string; componentId: string | null }) {
  const { finance } = useServices();
  const router = useRouter();
  const goal = snapshot.data.goalsState.goals.find((g) => g.id === goalId) ?? null;
  const component = goal && componentId ? (goal.components.find((c) => c.id === componentId) ?? null) : null;
  const [name, setName] = useState(component?.name ?? '');
  const [amount, setAmount] = useState(component ? String(component.amount) : '');
  const [dueDate, setDueDate] = useState(component?.dueDate ?? '');
  const write = useWrite();

  if (goal === null || (componentId !== null && component === null)) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'רכיב' }} />
        <EmptyState text="היעד או הרכיב לא נמצאו." />
      </FormScreen>
    );
  }
  const values = { name, amount, dueDate };
  const save = () => {
    void write
      .run(() => (component ? finance.editComponent(goal.id, component.id, values) : finance.addComponent(goal.id, values)))
      .then((o) => {
        if (o?.ok) router.back();
      });
  };

  return (
    <FormScreen testID="screen-component-form">
      <Stack.Screen options={{ title: component ? 'עריכת רכיב' : 'רכיב חדש — ' + goal.title }} />
      <Field label="שם הרכיב" placeholder="לדוגמה: ביטוח מקיף" value={name} onChangeText={setName} error={fieldError(write.failure, 'name')} testID="component-name" />
      <Field label="סכום" keyboardType="numeric" placeholder="₪" value={amount} onChangeText={setAmount} error={fieldError(write.failure, 'amount')} testID="component-amount" />
      <DateField
        label="תאריך יעד לרכיב זה (לא חובה — ברירת מחדל: תאריך היעד הראשי)"
        value={dueDate}
        onChange={setDueDate}
        allowClear
        error={fieldError(write.failure, 'dueDate')}
        testID="component-date"
      />
      <AppText variant="caption" tone="muted">
        לדוגמה: עבור ביטוח רכב יש להוסיף רק את הכיסויים שנבחרו בפועל — חובה + צד ג׳, או חובה + מקיף.
      </AppText>
      {write.failure && write.failure.kind === 'failed' ? <Banner tone="error" text={write.failure.message} /> : null}
      <ButtonRow>
        <Btn label="💾 שמור רכיב" busy={write.busy} onPress={save} flex testID="component-save" />
        <Btn label="ביטול" tone="secondary" disabled={write.busy} onPress={() => router.back()} flex testID="component-cancel" />
      </ButtonRow>
    </FormScreen>
  );
}
