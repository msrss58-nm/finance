// A category page — index.html #screen-transactions filtered by a category (or all
// transactions, key "all"): the .category-filter-chip (name — monthly total, ✏️ /
// 🗑️ / ✕), the (disabled) search bar, the תנועות פעילות / ארכיון toggle and the
// .tx-row list. Row tap = edit (active items only, as on the Web); ⋮ = archive /
// restore / permanent delete (confirmed).
//
// Native adaptations (reported): ⋮ opens an action sheet (Web: a dropdown); the
// category's ✏️ opens the category form (Web: inline form in the chip).

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { buildTransactionsView, type TxRowView } from '../../src/presentation/transactionsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { ActionSheet, Banner, Btn, ConfirmDialog, EmptyState, Fab, FilterToggle, ScreenScroll } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { TxRow } from '../../src/ui/TxRow.tsx';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function CategoryRoute() {
  const params = useLocalSearchParams<{ key?: string }>();
  const raw = one(params.key) ?? 'all';
  return <WithFinance>{(s) => <CategoryContent snapshot={s} categoryKey={raw === 'all' ? null : raw} />}</WithFinance>;
}

function ChipAction({ label, danger = false, onPress, testID }: { label: string; danger?: boolean; onPress: () => void; testID: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: danger ? t.c.danger : t.c.border,
        backgroundColor: t.c.bg,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: t.fs(12), color: danger ? t.c.danger : t.c.text }}>{label}</Text>
    </Pressable>
  );
}

function CategoryContent({ snapshot, categoryKey }: { snapshot: FinanceSnapshot; categoryKey: string | null }) {
  const { finance } = useServices();
  const t = useTheme();
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
          <View
            testID="category-header"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', backgroundColor: t.c.primaryBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}
          >
            <Text testID="category-total" style={{ flexShrink: 1, fontSize: t.fs(12.5), fontWeight: '600', color: t.c.primaryDark, textAlign: 'left' }}>
              {view.title + (view.monthTotalText ? ' — ' + view.monthTotalText : '')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ChipAction label="✏️ עריכה" onPress={() => push({ pathname: '/category-form', params: { key: categoryKey } })} testID="category-edit" />
              {view.canDelete ? <ChipAction label="🗑️ מחיקה" danger onPress={() => setDeleteCategory(true)} testID="category-delete" /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="סגירת הסינון" onPress={() => router.back()} hitSlop={10} testID="category-close">
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.c.primaryDark, paddingHorizontal: 2 }}>✕</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <TextInput
          editable={false}
          placeholder="חיפוש תנועה... (לא פעיל בשלב זה)"
          placeholderTextColor={t.c.textMuted}
          accessibilityLabel="חיפוש (לא פעיל)"
          style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: t.c.border, borderRadius: 10, fontSize: t.fs(14), backgroundColor: t.c.surface, color: t.c.text, textAlign: 'right' }}
        />
        <FilterToggle
          options={[
            { value: 'active', label: 'תנועות פעילות' },
            { value: 'archived', label: 'ארכיון' },
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
                  ? { key: 'restore', label: 'שחזר', onPress: () => void write.run(() => finance.unarchiveItem(menuFor.id)) }
                  : { key: 'archive', label: 'העבר לארכיון', onPress: () => void write.run(() => finance.archiveItem(menuFor.id)) },
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
        message="למחוק קטגוריה זו?"
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
