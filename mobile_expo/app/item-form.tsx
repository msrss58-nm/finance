// Add / edit one item — the Web's per-type add and edit forms (app.js
// buildPreviewAddFormHtml / buildPreviewEditFormHtml). Validation and the
// stored shape are decided by the domain (itemWrites.ts); this screen only
// collects the fields and shows the result.

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useServices } from '../src/composition/ServicesContext.tsx';
import { categoryBaseType, categoryLabel } from '../src/domain/categoryWrites.ts';
import {
  createFormDefaults,
  editFormValues,
  findItemIndex,
  formKindForItem,
  LOAN_BANK_WHERE,
  type FixedFrequency,
  type ItemFormField,
  type ItemFormKind,
  type ItemFormValues,
} from '../src/domain/itemWrites.ts';
import { isPlainObject, type RawItem } from '../src/domain/raw.ts';
import { isBuiltinCreditCardSettlement, LOAN_PAYROLL_WHERE } from '../src/domain/resolvers.ts';
import { HEBREW_MONTHS } from '../src/presentation/format.ts';
import type { FinanceSnapshot } from '../src/state/financeController.ts';
import { AppText, Banner, Btn, ButtonRow, Card, Choice, DateField, EmptyState, Field, FormScreen, SelectField } from '../src/ui/kit.tsx';
import { fieldError, useWrite, WithFinance } from '../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const KINDS: readonly ItemFormKind[] = ['income', 'fixed', 'variable', 'loan', 'dated', 'cashWithdrawal'];

function parseId(raw: string | undefined): { ok: true; id: unknown } | { ok: false } {
  if (raw === undefined) return { ok: false };
  try {
    return { ok: true, id: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

type FormSpec =
  | { readonly mode: 'create'; readonly kind: ItemFormKind; readonly categoryKey: string | null }
  | { readonly mode: 'edit'; readonly kind: ItemFormKind; readonly id: unknown; readonly item: RawItem; readonly categoryKey: string | null };

function resolveSpec(snapshot: FinanceSnapshot, params: Record<string, string | string[] | undefined>): FormSpec | { readonly error: string } {
  const { items, categoryConfig } = snapshot.data;
  if (one(params.mode) === 'edit') {
    const parsed = parseId(one(params.id));
    if (!parsed.ok) return { error: 'התנועה לא נמצאה' };
    const idx = findItemIndex(items, parsed.id);
    if (idx === -1) return { error: 'התנועה לא נמצאה — ייתכן שכבר נמחקה.' };
    const item = items[idx] as RawItem;
    if (item.isArchived) return { error: 'תנועה בארכיון אינה ניתנת לעריכה — יש לשחזר אותה תחילה.' };
    const key = typeof item.displayCategory === 'string' ? item.displayCategory : null;
    return { mode: 'edit', kind: formKindForItem(item), id: parsed.id, item, categoryKey: key };
  }
  const category = one(params.category) || null;
  const kindParam = one(params.kind);
  if (kindParam === 'cashWithdrawal') return { mode: 'create', kind: 'cashWithdrawal', categoryKey: null };
  if (category === null) return { error: 'לא נבחרה קטגוריה' };
  const bt = categoryBaseType(categoryConfig, category);
  if (!(KINDS as readonly unknown[]).includes(bt) || bt === 'cashWithdrawal') return { error: 'הקטגוריה אינה קיימת' };
  return { mode: 'create', kind: bt as ItemFormKind, categoryKey: category };
}

export default function ItemFormRoute() {
  const params = useLocalSearchParams();
  return <WithFinance>{(s) => <ItemFormGate snapshot={s} params={params} />}</WithFinance>;
}

function ItemFormGate({ snapshot, params }: { snapshot: FinanceSnapshot; params: Record<string, string | string[] | undefined> }) {
  const [spec] = useState(() => resolveSpec(snapshot, params));
  if ('error' in spec) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'תנועה' }} />
        <EmptyState text={spec.error} testID="item-form-error" />
      </FormScreen>
    );
  }
  return <ItemForm snapshot={snapshot} spec={spec} />;
}

const WHERE_OPTIONS = [
  { value: 'bank', label: 'חשבון בנק' },
  { value: 'credit', label: 'כרטיס אשראי' },
] as const;
const LOAN_OPTIONS = [
  { value: LOAN_BANK_WHERE, label: 'חשבון בנק' },
  { value: LOAN_PAYROLL_WHERE, label: 'דרך תלוש השכר' },
] as const;
const FREQUENCY_OPTIONS: readonly { value: FixedFrequency; label: string }[] = [
  { value: 'monthly', label: 'חודשי' },
  { value: 'bimonthly', label: 'דו-חודשי' },
  { value: 'annual', label: 'שנתי' },
];
const MONTH_OPTIONS = HEBREW_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

function ItemForm({ snapshot, spec }: { snapshot: FinanceSnapshot; spec: FormSpec }) {
  const { finance } = useServices();
  const router = useRouter();
  const { categoryConfig } = snapshot.data;
  const [values, setValues] = useState<ItemFormValues>(() =>
    spec.mode === 'edit' ? editFormValues(spec.item, categoryConfig) : createFormDefaults(spec.kind, spec.categoryKey, categoryConfig, snapshot.now),
  );
  const [categoryKey, setCategoryKey] = useState<string | null>(spec.categoryKey);
  const write = useWrite();
  const kind = spec.kind;

  const set = (name: ItemFormField) => (text: string) => setValues((v) => ({ ...v, [name]: text }));
  const err = (name: ItemFormField) => fieldError(write.failure, name);
  const f = (name: ItemFormField) => ({ value: values[name] as string, onChangeText: set(name), error: err(name), testID: `item-${name}` });

  // Built-in credit-card settlement: always a bank outflow, last 4 digits required.
  const isSettlement = spec.mode === 'edit' ? isBuiltinCreditCardSettlement(spec.item) : kind === 'dated' && categoryKey === 'dated';

  // The add form's category picker: shown for fixed/variable/dated when more than one category shares the type.
  const siblingKeys =
    spec.mode === 'create' && (kind === 'fixed' || kind === 'variable' || kind === 'dated')
      ? Object.keys(categoryConfig).filter((k) => isPlainObject(categoryConfig[k]) && categoryBaseType(categoryConfig, k) === kind)
      : [];

  const title =
    kind === 'cashWithdrawal'
      ? spec.mode === 'edit'
        ? 'עריכת משיכת מזומן'
        : 'משיכת מזומן חדשה'
      : spec.mode === 'edit'
        ? 'עריכת תנועה'
        : 'תנועה חדשה — ' + categoryLabel(categoryConfig, categoryKey ?? '');

  const save = () => {
    void write
      .run(() => (spec.mode === 'edit' ? finance.editItem(spec.id, values) : finance.createItem(kind, kind === 'cashWithdrawal' ? null : categoryKey, values)))
      .then((o) => {
        if (o?.ok) router.back();
      });
  };

  const whereChoice = (label: string) => (
    <Choice
      label={label}
      options={WHERE_OPTIONS}
      value={values.where === 'bank' || values.where === 'credit' ? values.where : ''}
      onChange={(v) => setValues((s) => ({ ...s, where: v }))}
      error={err('where')}
      hint={kind === 'variable' && values.where === '' ? 'לתנועה זו לא נשמר אמצעי תשלום — יש לבחור לפני שמירה.' : null}
      testID="item-where"
    />
  );
  const cardField = (label = '4 ספרות אחרונות של הכרטיס') => <Field label={label} keyboardType="number-pad" maxLength={4} placeholder="לדוגמה: 5646" {...f('cardLast4')} />;

  return (
    <FormScreen testID="screen-item-form">
      <Stack.Screen options={{ title }} />
      {siblingKeys.length > 1 ? (
        <SelectField
          label="קטגוריה"
          options={siblingKeys.map((k) => ({ value: k, label: categoryLabel(categoryConfig, k) }))}
          value={categoryKey ?? ''}
          onChange={(k) => setCategoryKey(k)}
          testID="item-category"
        />
      ) : null}

      {kind === 'income' ? (
        <>
          <Field label="שם / תיאור" placeholder="משכורת, בונוס" {...f('title')} />
          <Field label="סכום" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <Field label="יום כניסה" keyboardType="number-pad" maxLength={2} {...f('day')} />
        </>
      ) : null}

      {kind === 'loan' ? (
        <>
          <Field label="שם ההלוואה" {...f('title')} />
          <Field label="סכום מקור (סך ההלוואה המקורית)" keyboardType="numeric" placeholder="₪" {...f('originalAmount')} />
          <Field label="החזר חודשי" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <Choice label="היכן יורד" options={LOAN_OPTIONS} value={values.where} onChange={(v) => setValues((s) => ({ ...s, where: v }))} error={err('where')} testID="item-where" />
          <Field label="ריבית (%)" keyboardType="numeric" {...f('interest')} />
          <Field label="מתי יורד (יום בחודש)" keyboardType="number-pad" maxLength={2} {...f('day')} />
          <Field label="כמה תשלומים (סך הכל)" keyboardType="number-pad" {...f('total')} />
          <DateField label="תאריך לקיחה / פתיחה" value={values.start} onChange={set('start')} error={err('start')} allowClear testID="item-start" />
        </>
      ) : null}

      {kind === 'variable' ? (
        <>
          <Card>
            <AppText variant="small" tone="muted">
              תשלום מכרטיס אשראי נשאר למעקב בלבד (אינו מופחת שוב בתחזית — ההשפעה בפועל מגיעה מחיוב הכרטיס). תשלום מחשבון בנק מפחית את היתרה הצפויה בכל תאריך תשלום בפועל.
            </AppText>
          </Card>
          <Field label="שם התשלום" {...f('title')} />
          <Field label="סכום מקור (סך כל העסקה המקורית)" keyboardType="numeric" placeholder="₪" {...f('originalAmount')} />
          <Field label="עלות חודשית" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <Field label="יום ירידה" keyboardType="number-pad" maxLength={2} {...f('day')} />
          <Field label="כמה תשלומים (סך הכל)" keyboardType="number-pad" {...f('total')} />
          <DateField label="תאריך התחלה" value={values.start} onChange={set('start')} error={err('start')} allowClear testID="item-start" />
          {whereChoice('אמצעי תשלום')}
          {values.where === 'credit' ? cardField() : null}
        </>
      ) : null}

      {kind === 'fixed' ? (
        <>
          <Field label="שם ההוצאה" {...f('title')} />
          <Field label="סכום" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <Field label="יום ירידה" keyboardType="number-pad" maxLength={2} {...f('day')} />
          {whereChoice('איפה יורד')}
          {values.where === 'credit' ? cardField() : null}
          <Choice
            label="תדירות"
            options={FREQUENCY_OPTIONS}
            value={values.frequency}
            onChange={(v) => setValues((s) => ({ ...s, frequency: v }))}
            testID="item-frequency"
          />
          {values.frequency === 'bimonthly' ? (
            <SelectField
              label="חודש התחלה"
              options={MONTH_OPTIONS}
              value={values.bimonthlyStartMonth}
              onChange={set('bimonthlyStartMonth')}
              error={err('bimonthlyStartMonth')}
              testID="item-bimonthly-start"
            />
          ) : null}
          <Field label="הערות" multiline {...f('notes')} />
        </>
      ) : null}

      {kind === 'dated' ? (
        <>
          <Field label="שם ההוצאה" placeholder="לדוגמה: קניות בסופר" {...f('title')} />
          <Field label="סכום" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <DateField label="תאריך החיוב" value={values.start} onChange={set('start')} error={err('start')} testID="item-start" />
          {isSettlement ? (
            <>
              {cardField()}
              <Field label="הערות (אופציונלי)" multiline {...f('notes')} />
            </>
          ) : (
            <>
              {whereChoice('אמצעי תשלום')}
              {values.where === 'credit' ? cardField() : null}
            </>
          )}
        </>
      ) : null}

      {kind === 'cashWithdrawal' ? (
        <>
          <Card accent="warning">
            <AppText variant="small">משיכת מזומן מפחיתה את היתרה הצפויה בבנק, אך אינה נספרת כהוצאת צריכה רגילה.</AppText>
          </Card>
          <Field label="סכום" keyboardType="numeric" placeholder="₪" {...f('amount')} />
          <DateField label="תאריך המשיכה" value={values.start} onChange={set('start')} error={err('start')} testID="item-start" />
          <Field label="הערה (אופציונלי)" placeholder="למשל: כספומט" {...f('notes')} />
        </>
      ) : null}

      {write.failure ? <Banner tone="error" text={write.failure.message} testID="item-form-failure" /> : null}
      <ButtonRow>
        <Btn label={spec.mode === 'edit' ? '💾 שמור שינויים' : 'הוסף תנועה +'} busy={write.busy} onPress={save} flex testID="item-save" />
        <Btn label="ביטול" tone="secondary" disabled={write.busy} onPress={() => router.back()} flex testID="item-cancel" />
      </ButtonRow>
    </FormScreen>
  );
}
