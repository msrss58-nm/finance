// Categories: every category in stored order with item counts, the
// all-transactions entry, and the add-category action.

import { useMemo } from 'react';
import { View } from 'react-native';

import { buildCategoryList } from '../../src/presentation/transactionsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Card, Fab, Row, ScreenScroll, SectionTitle } from '../../src/ui/kit.tsx';
import { useSafePush, WithFinance } from '../../src/ui/useFinance.tsx';

export default function CategoriesScreen() {
  return <WithFinance>{(s) => <CategoriesContent snapshot={s} />}</WithFinance>;
}

function countText(active: number, archived: number): string {
  return active + ' פעילות' + (archived > 0 ? ' · ' + archived + ' בארכיון' : '');
}

function CategoriesContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const push = useSafePush();
  const list = useMemo(() => buildCategoryList(snapshot), [snapshot]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll testID="screen-categories" footer={<Fab label="הוסף קטגוריה" onPress={() => push('/category-form')} testID="categories-fab" />}>
        <SectionTitle title="ניהול קטגוריות" />
        <Card onPress={() => push({ pathname: '/category/[key]', params: { key: 'all' } })} testID="category-row-all" accessibilityLabel="כל התנועות">
          <Row>
            <AppText bold style={{ flex: 1 }}>
              📋 כל התנועות
            </AppText>
            <AppText variant="small" tone="muted">
              {countText(list.totalActive, list.totalArchived)}
            </AppText>
            <AppText tone="muted">‹</AppText>
          </Row>
        </Card>
        {list.rows.map((r) => (
          <Card key={r.key} onPress={() => push({ pathname: '/category/[key]', params: { key: r.key } })} testID={`category-row-${r.key}`} accessibilityLabel={r.label}>
            <Row>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText bold>{r.label}</AppText>
                {r.baseTypeText ? (
                  <AppText variant="caption" tone="muted">
                    {r.baseTypeText}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="small" tone="muted">
                {countText(r.activeCount, r.archivedCount)}
              </AppText>
              <AppText tone="muted">‹</AppText>
            </Row>
          </Card>
        ))}
      </ScreenScroll>
    </View>
  );
}
