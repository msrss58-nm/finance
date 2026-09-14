// Foundation UI primitives. RTL rules:
// - Layout direction comes from the native RTL flag (expo-localization
//   forcesRTL); flexDirection 'row' already starts on the right.
// - Text uses textAlign 'left', which React Native swaps to the start (right)
//   edge in RTL, so Latin-first lines align with Hebrew ones instead of
//   following their own first strong character.
// - In a label/value row the value never shrinks (no clipped "₪") and the
//   label wraps instead.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme.ts';

export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} testID={testID} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={[styles.text, styles.title]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={styles.text} testID={testID}>
      {children}
    </Text>
  );
}

export function Muted({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={[styles.text, styles.muted]} testID={testID}>
      {children}
    </Text>
  );
}

export function ErrorText({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={[styles.text, styles.error]} testID={testID}>
      {children}
    </Text>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.text, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.text, styles.rowLabel]}>{label}</Text>
      <Text style={[styles.text, styles.rowValue]} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  testID,
  disabled = false,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'secondary' && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.l, gap: spacing.m },
  text: { color: colors.text, fontSize: 16, lineHeight: 24, textAlign: 'left' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.m,
    gap: spacing.s,
  },
  sectionTitle: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.m },
  rowLabel: { flex: 1, flexShrink: 1 },
  rowValue: { flexShrink: 0, fontVariant: ['tabular-nums'], fontWeight: '600' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    alignItems: 'center',
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: colors.accent },
});
