// Add a custom category, or rename / set the default day of an existing one
// (app.js category add / edit forms). Changing a default day never changes an
// existing item's own day.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useServices } from '../src/composition/ServicesContext.tsx';
import {
  categoryBaseType,
  categoryDefaultDayText,
  categoryLabel,
  CUSTOM_CATEGORY_TYPE_OPTIONS,
  getCategoryDefaultDayFieldLabel,
  type CustomCategoryBaseType,
} from '../src/domain/categoryWrites.ts';
import type { FinanceSnapshot } from '../src/state/financeController.ts';
import { AppText, Banner, Btn, ButtonRow, EmptyState, Field, FormScreen, SelectField } from '../src/ui/kit.tsx';
import { fieldError, useWrite, WithFinance } from '../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function CategoryFormRoute() {
  const params = useLocalSearchParams<{ key?: string }>();
  const key = one(params.key) || null;
  return <WithFinance>{(s) => <CategoryForm snapshot={s} editKey={key} />}</WithFinance>;
}

function CategoryForm({ snapshot, editKey }: { snapshot: FinanceSnapshot; editKey: string | null }) {
  const { finance } = useServices();
  const router = useRouter();
  const config = snapshot.data.categoryConfig;
  const exists = editKey !== null && config[editKey] !== undefined;
  const [title, setTitle] = useState(() => (exists ? categoryLabel(config, editKey as string) : ''));
  const [baseType, setBaseType] = useState<CustomCategoryBaseType>(CUSTOM_CATEGORY_TYPE_OPTIONS[0]?.value ?? 'fixed');
  const [day, setDay] = useState(() => (exists ? categoryDefaultDayText(config, editKey as string) : ''));
  const write = useWrite();

  if (editKey !== null && !exists) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'קטגוריה' }} />
        <EmptyState text="הקטגוריה לא נמצאה." />
      </FormScreen>
    );
  }

  const effectiveType = exists ? categoryBaseType(config, editKey as string) : baseType;
  const dayLabel = getCategoryDefaultDayFieldLabel(effectiveType);

  const save = () => {
    void write
      .run(() => (exists ? finance.editCategory(editKey as string, title, dayLabel === null ? null : day) : finance.addCategory(title, baseType, day)))
      .then((o) => {
        if (o?.ok) router.back();
      });
  };

  return (
    <FormScreen testID="screen-category-form">
      <Stack.Screen options={{ title: exists ? 'עריכת קטגוריה' : 'קטגוריה חדשה' }} />
      <Field label={exists ? 'שם קטגוריה' : 'שם הקטגוריה'} value={title} onChangeText={setTitle} error={fieldError(write.failure, 'title')} testID="category-title" />
      {!exists ? (
        <SelectField label="סוג" options={CUSTOM_CATEGORY_TYPE_OPTIONS} value={baseType} onChange={setBaseType} error={fieldError(write.failure, 'baseType')} testID="category-type" />
      ) : null}
      {dayLabel !== null ? (
        <Field
          label={dayLabel + ' (אופציונלי)'}
          value={day}
          onChangeText={setDay}
          keyboardType="number-pad"
          maxLength={2}
          error={fieldError(write.failure, 'day')}
          hint={exists ? 'שינוי יום ברירת המחדל אינו משנה תנועות קיימות.' : null}
          testID="category-day"
        />
      ) : null}
      {!exists ? (
        <AppText variant="caption" tone="muted">
          אייקון מתאים נבחר אוטומטית לפי שם הקטגוריה.
        </AppText>
      ) : null}
      {write.failure ? <Banner tone="error" text={write.failure.message} testID="category-form-failure" /> : null}
      <ButtonRow>
        <Btn label={exists ? '💾 שמור שינויים' : 'הוסף קטגוריה +'} busy={write.busy} onPress={save} flex testID="category-save" />
        <Btn label="ביטול" tone="secondary" disabled={write.busy} onPress={() => router.back()} flex testID="category-cancel" />
      </ButtonRow>
    </FormScreen>
  );
}
