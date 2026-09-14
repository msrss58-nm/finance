// One transaction row (app.js renderTxList / renderTxListWithActions markup).

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TxRowView } from '../presentation/transactionsView.ts';
import { AppText, TOUCH } from './kit.tsx';
import { useTheme } from './theme.ts';

export function TxRow({ row, onPress, onMenu, testID }: { row: TxRowView; onPress?: () => void; onMenu?: () => void; testID?: string }) {
  const t = useTheme();
  const body = (
    <>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18 }}>{row.icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText bold numberOfLines={2}>
          {row.title || '—'}
        </AppText>
        {row.note ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {row.note}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}>
          <AppText variant="caption" tone="muted">
            {row.dateText}
          </AppText>
          {row.installment.map((m) => (
            <AppText key={m} variant="caption" tone="muted">
              {m}
            </AppText>
          ))}
          {row.isArchived ? (
            <AppText variant="caption" tone="warning">
              בארכיון
            </AppText>
          ) : null}
        </View>
      </View>
      <AppText bold tone={row.tone === 'income' ? 'primary' : 'danger'} style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}>
        {row.amountText}
      </AppText>
    </>
  );
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: t.c.surface,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.c.border,
        paddingStart: 12,
        paddingEnd: onMenu ? 0 : 12,
        paddingVertical: 8,
        minHeight: 60,
      }}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'עריכת תנועה: ' + row.title}
          onPress={onPress}
          testID={testID ? `${testID}-open` : undefined}
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH }, pressed && { opacity: 0.7 }]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{body}</View>
      )}
      {onMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'פעולות עבור ' + row.title}
          onPress={onMenu}
          testID={testID ? `${testID}-menu` : undefined}
          style={({ pressed }) => [{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
        >
          <Text style={{ fontSize: 22, color: t.c.textMuted }}>⋮</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
