// Opening Balance (CLAUDE.md §11): the user's actual balance on a date they
// choose. Saving writes amount + date + a fresh snapshot of that day's cash
// withdrawals together (domain). Replacing an existing one needs an explicit
// confirmation. No backward calculation, no fabricated 0, and the retired
// currentBalance / anchor fields are never read or written.

import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { useServices } from '../src/composition/ServicesContext.tsx';
import { todayStr } from '../src/domain/dates.ts';
import { validateOpeningBalanceInput } from '../src/domain/openingBalanceInput.ts';
import { getProjectedBalanceOpeningConfig } from '../src/domain/settings.ts';
import { formatAmount, formatDateStr } from '../src/presentation/format.ts';
import type { FinanceSnapshot } from '../src/state/financeController.ts';
import { AppText, Banner, Btn, ButtonRow, Card, ConfirmDialog, DateField, Field, FormScreen, LabelValue } from '../src/ui/kit.tsx';
import { useWrite, WithFinance } from '../src/ui/useFinance.tsx';

export default function OpeningBalanceRoute() {
  return <WithFinance>{(s) => <OpeningBalanceForm snapshot={s} />}</WithFinance>;
}

function OpeningBalanceForm({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { finance } = useServices();
  const router = useRouter();
  const existing = getProjectedBalanceOpeningConfig(snapshot.data.settings);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [dateStr, setDateStr] = useState(existing ? existing.dateStr : todayStr(snapshot.now));
  const [inputError, setInputError] = useState<{ field: 'amount' | 'date'; message: string } | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{ amount: number; dateStr: string } | null>(null);
  const write = useWrite();

  const finish = () => {
    // A saved opening balance changes what Home shows: land there (app.js closeOpeningBalanceFormToHome()).
    router.dismissAll();
    router.navigate('/');
  };
  const commit = (value: { amount: number; dateStr: string }) => {
    void write.run(() => finance.saveOpeningBalance(value.amount, value.dateStr)).then((o) => {
      setPendingReplace(null);
      if (o?.ok) finish();
    });
  };
  const submit = () => {
    const v = validateOpeningBalanceInput(amount, dateStr);
    if (!v.ok) {
      setInputError({ field: v.field, message: v.message });
      return;
    }
    setInputError(null);
    if (existing) setPendingReplace({ amount: v.amount, dateStr: v.dateStr });
    else commit(v);
  };

  return (
    <FormScreen testID="screen-opening-balance">
      <Stack.Screen options={{ title: 'יתרת התחלה לחישוב' }} />
      <AppText variant="small" tone="muted">
        היתרה משמשת נקודת התחלה חד־פעמית לחישוב היתרה הצפויה. לאחר מכן ההכנסות וההוצאות מתווספות ומופחתות אוטומטית לפי התאריך שלהן. זו אינה יתרת בנק מסונכרנת.
      </AppText>
      {existing ? (
        <Card testID="opening-current">
          <AppText variant="small" bold>
            יתרת ההתחלה השמורה
          </AppText>
          <LabelValue label="סכום" value={formatAmount(existing.amount)} />
          <LabelValue label="תאריך" value={formatDateStr(existing.dateStr)} />
        </Card>
      ) : null}
      <Field
        label="סכום יתרת התחלה"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        hint="ניתן להזין גם 0 או סכום שלילי (למשל -1500)."
        error={inputError?.field === 'amount' ? inputError.message : null}
        testID="opening-amount"
      />
      <DateField label="תאריך יתרת התחלה" value={dateStr} onChange={setDateStr} error={inputError?.field === 'date' ? inputError.message : null} testID="opening-date" />
      <AppText variant="caption" tone="muted">
        משיכות מזומן שכבר רשומות בתאריך זה נחשבות ככלולות בסכום שהוזן.
      </AppText>
      {write.failure ? <Banner tone="error" text={write.failure.message} /> : null}
      <ButtonRow>
        <Btn label="שמור יתרת התחלה" busy={write.busy} onPress={submit} flex testID="opening-save" />
        <Btn label="ביטול" tone="secondary" disabled={write.busy} onPress={() => router.back()} flex testID="opening-cancel" />
      </ButtonRow>
      <ConfirmDialog
        visible={pendingReplace !== null}
        title="שינוי יתרת ההתחלה"
        message="שינוי יתרת ההתחלה ישנה את כל חישובי היתרה הצפויה מתאריך זה ואילך."
        confirmLabel="אישור שינוי"
        destructive
        busy={write.busy}
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => pendingReplace && commit(pendingReplace)}
        testID="opening-replace-dialog"
      />
    </FormScreen>
  );
}
