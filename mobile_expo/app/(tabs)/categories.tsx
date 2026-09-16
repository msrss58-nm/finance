// Categories — index.html #screen-categories: "ניהול קטגוריות", the system
// "📋 כל התנועות" row, then one .category-row per category in stored order
// (label only, as on the Web). The shared FAB adds a category (Web: the same
// FAB opens the inline add form; here it opens the add-category screen).

import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { buildCategoryList } from '../../src/presentation/transactionsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { Fab, ScreenScroll, SectionTitle, TOUCH, webShadow } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useSafePush, WithFinance } from '../../src/ui/useFinance.tsx';

export default function CategoriesScreen() {
  return <WithFinance>{(s) => <CategoriesContent snapshot={s} />}</WithFinance>;
}

/** styles.css .category-row / .cat-label */
export function CategoryRow({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH, backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
        webShadow,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{ fontSize: t.fs(14), color: t.c.text, textAlign: 'left' }}>{label}</Text>
    </Pressable>
  );
}

function CategoriesContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const push = useSafePush();
  const list = useMemo(() => buildCategoryList(snapshot), [snapshot]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll testID="screen-categories" footer={<Fab label="הוסף קטגוריה" onPress={() => push('/category-form')} testID="categories-fab" />}>
        <SectionTitle title="ניהול קטגוריות" first />
        <CategoryRow label="📋 כל התנועות" onPress={() => push({ pathname: '/category/[key]', params: { key: 'all' } })} testID="category-row-all" />
        {list.rows.map((r) => (
          <CategoryRow key={r.key} label={r.label} onPress={() => push({ pathname: '/category/[key]', params: { key: r.key } })} testID={`category-row-${r.key}`} />
        ))}
      </ScreenScroll>
    </View>
  );
}
