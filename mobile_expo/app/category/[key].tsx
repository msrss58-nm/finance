// A category page (app.js Transactions screen filtered by category), or all
// transactions (key "all"). Row tap = edit (active items only, as on the Web);
// ⋮ = archive / restore / permanent delete (confirmed).

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { buildTransactionsView, type TxRowView } from '../../src/presentation/transactionsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { ActionSheet, AppText, Banner, Btn, ButtonRow, Card, Choice, ConfirmDialog, EmptyState, Fab, ScreenScroll } from '../../src/ui/kit.tsx';
import { TxRow } from '../../src/ui/TxRow.tsx';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function CategoryRoute() {
  const params = useLocalSearchParams<{ key?: string }>();
  const raw = one(params.key) ?? 'all';
  return <WithFinance>{(s) => <CategoryContent snapshot={s} categoryKey={raw === 'all' ? null : raw} />}</WithFinance>;
}

function CategoryContent({ snapshot, categoryKey }: { snapshot: FinanceSnapshot; categoryKey: string | null }) {
  const { finance } = useServices();
  const router = useRouter();
  const push = useSafePush();
  const [archived, setArchived] = useState(false);
  const [menuFor, setMenuFor] = useState<TxRowView | null>(null);
  const [deleteRow, setDeleteRow] = useState<TxRowView | null>(null);
  const [deleteCategory, setDeleteCategory] = useState(false);
  const write = useWrite();
  const view = useMemo(() => buildTransactionsView(snapshot, categoryKey, archived), [snapshot, categoryKey, archived]);

  const title = view.exists ? view.title : 'קטגוריה';
  const edit = (row: TxRowView) => push({ pathname: '/item-form', params: { mode: 'edit', id: JSON.stringify(row.id) } });

  if (!view.exists) {
    return (
      <ScreenScroll testID="screen-category">
        <Stack.Screen options={{ title }} />
        <EmptyState text="הקטגוריה כבר אינה קיימת." />
        <Btn label="חזרה" tone="secondary" onPress={() => router.back()} />
      </ScreenScroll>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      <ScreenScroll
        testID="screen-category"
        footer={
          view.canAdd && !archived ? (
            <Fab label="הוסף תנועה" onPress={() => push({ pathname: '/item-form', params: { mode: 'create', category: categoryKey ?? '' } })} testID="category-fab" />
          ) : null
        }
      >
        {categoryKey !== null ? (
          <Card accent="primary" testID="category-header">
            <AppText bold>{view.title}</AppText>
            {view.baseTypeText ? (
              <AppText variant="caption" tone="muted">
                {'סוג: ' + view.baseTypeText}
              </AppText>
            ) : null}
            {view.monthTotalText ? <AppText testID="category-total">{view.monthTotalText}</AppText> : null}
            <ButtonRow>
              <Btn label="✏️ עריכה" tone="secondary" compact onPress={() => push({ pathname: '/category-form', params: { key: categoryKey } })} testID="category-edit" />
              {view.canDelete ? <Btn label="🗑️ מחיקה" tone="ghost" compact onPress={() => setDeleteCategory(true)} testID="category-delete" /> : null}
            </ButtonRow>
          </Card>
        ) : null}
        <Choice
          label="תצוגה"
          options={[
            { value: 'active', label: 'תנועות פעילות (' + view.activeCount + ')' },
            { value: 'archived', label: 'ארכיון (' + view.archivedCount + ')' },
          ]}
          value={archived ? 'archived' : 'active'}
          onChange={(v) => setArchived(v === 'archived')}
          testID="category-filter"
        />
        {write.failure ? <Banner tone="error" text={write.failure.message} onDismiss={() => write.setFailure(null)} testID="category-error" /> : null}
        {view.rows.length === 0 ? (
          <EmptyState text={archived ? 'אין תנועות בארכיון.' : 'אין תנועות פעילות.'} testID="category-empty" />
        ) : (
          view.rows.map((row) => (
            <TxRow key={row.key} row={row} testID="tx-row" onPress={row.editable ? () => edit(row) : undefined} onMenu={row.id === null ? undefined : () => setMenuFor(row)} />
          ))
        )}
      </ScreenScroll>

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor ? menuFor.title || 'תנועה' : ''}
        onClose={() => setMenuFor(null)}
        testID="tx-menu"
        actions={
          menuFor === null
            ? []
            : [
                ...(menuFor.editable ? [{ key: 'edit', label: '✏️ עריכה', onPress: () => edit(menuFor) }] : []),
                menuFor.isArchived
                  ? { key: 'restore', label: '↩️ שחזר', onPress: () => void write.run(() => finance.unarchiveItem(menuFor.id)) }
                  : { key: 'archive', label: '🗄️ העבר לארכיון', onPress: () => void write.run(() => finance.archiveItem(menuFor.id)) },
                { key: 'delete', label: '🗑️ מחק לצמיתות', tone: 'danger' as const, onPress: () => setDeleteRow(menuFor) },
              ]
        }
      />
      <ConfirmDialog
        visible={deleteRow !== null}
        title="מחיקת תנועה"
        message="למחוק את התנועה הזו לצמיתות? לא ניתן לשחזר לאחר מכן."
        confirmLabel="מחק לצמיתות"
        destructive
        busy={write.busy}
        onCancel={() => setDeleteRow(null)}
        onConfirm={() => {
          const row = deleteRow;
          if (row === null) return;
          void write.run(() => finance.deleteItem(row.id)).then(() => setDeleteRow(null));
        }}
        testID="tx-delete-dialog"
      />
      <ConfirmDialog
        visible={deleteCategory}
        title="מחיקת קטגוריה"
        message="למחוק קטגוריה זו? קטגוריה שיש לה תנועות (כולל בארכיון) לא תימחק."
        confirmLabel="אישור מחיקה"
        destructive
        busy={write.busy}
        onCancel={() => setDeleteCategory(false)}
        onConfirm={() => {
          if (categoryKey === null) return;
          void write.run(() => finance.deleteCategory(categoryKey)).then((o) => {
            setDeleteCategory(false);
            if (o?.ok) router.back();
          });
        }}
        testID="category-delete-dialog"
      />
    </View>
  );
}
