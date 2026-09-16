// One transaction row (app.js renderTxList / renderTxListWithActions markup,
// styles.css .tx-row / .tx-icon / .tx-title / .tx-note / .tx-date /
// .tx-installment-meta / .tx-amount / .tx-menu-toggle).

import { Pressable, Text, View } from 'react-native';

import type { TxRowView } from '../presentation/transactionsView.ts';
import { TOUCH, webShadow } from './kit.tsx';
import { useTheme } from './theme.ts';

/** styles.css .tx-icon / .category-tile-icon background — a fixed neutral tint in both themes. */
export const WEB_ICON_BG = '#eef2f0';

export function TxRow({ row, onPress, onMenu, testID }: { row: TxRowView; onPress?: () => void; onMenu?: () => void; testID?: string }) {
  const t = useTheme();
  const meta = { fontSize: t.fs(11.5), color: t.c.textMuted };
  const body = (
    <>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: WEB_ICON_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: 15 }}>{row.icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: t.fs(13.5), fontWeight: '600', color: t.c.text, textAlign: 'left' }}>
          {row.title}
        </Text>
        {row.note ? (
          <Text numberOfLines={1} style={[meta, { marginTop: 2, textAlign: 'left' }]}>
            {row.note}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2, marginTop: 2 }}>
          <Text style={[meta, { textAlign: 'left' }]}>{row.dateText}</Text>
          {row.installment.map((m) => (
            <Text key={m} style={meta}>
              {m}
            </Text>
          ))}
          {row.isArchived ? <Text style={[meta, { color: t.c.warning }]}>בארכיון</Text> : null}
        </View>
      </View>
      <Text style={{ fontSize: t.fs(14), fontWeight: '700', color: row.tone === 'income' ? t.c.primaryText : t.c.danger, flexShrink: 0, writingDirection: 'ltr' }}>{row.amountText}</Text>
    </>
  );
  return (
    <View
      testID={testID}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 11, paddingStart: 14, paddingEnd: onMenu ? 4 : 14 },
        webShadow,
      ]}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'עריכת תנועה: ' + row.title}
          onPress={onPress}
          testID={testID ? `${testID}-open` : undefined}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH - 10 }, pressed && { opacity: 0.7 }]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{body}</View>
      )}
      {onMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'פעולות עבור ' + row.title}
          onPress={onMenu}
          testID={testID ? `${testID}-menu` : undefined}
          hitSlop={6}
          style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, pressed && { backgroundColor: t.c.bg }]}
        >
          <Text style={{ fontSize: 18, color: t.c.textMuted }}>⋮</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
