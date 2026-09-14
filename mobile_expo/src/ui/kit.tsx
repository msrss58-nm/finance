// Product UI kit. RTL rules (as in the foundation components):
// - layout direction comes from the native RTL flag, so flexDirection 'row'
//   already starts at the right edge;
// - Text uses textAlign 'left', which React Native maps to the start (right)
//   edge in RTL;
// - an amount never shrinks (no clipped ₪): labels wrap instead;
// - every touch target is at least 44 dp.
// Styles are derived from the theme (appearance settings).

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { cashflowDateKey, isValidDateStr, parseLocalDateStr } from '../domain/dates.ts';
import { formatDate, HEBREW_MONTHS } from '../presentation/format.ts';
import { useTheme, type Theme } from './theme.ts';

export const TOUCH = 44;

// ----- text -------------------------------------------------------------------

export type TextVariant = 'hero' | 'title' | 'heading' | 'body' | 'small' | 'caption';
export type TextTone = 'default' | 'muted' | 'danger' | 'success' | 'warning' | 'primary' | 'onPrimary' | 'positive' | 'negative' | 'neutral';

const SIZES: Readonly<Record<TextVariant, readonly [number, number]>> = {
  hero: [32, 42],
  title: [21, 29],
  heading: [17, 24],
  body: [15.5, 23],
  small: [13.5, 20],
  caption: [12, 17],
};

export function toneColor(t: Theme, tone: TextTone): string {
  switch (tone) {
    case 'muted':
      return t.c.textMuted;
    case 'danger':
    case 'negative':
      return t.c.danger;
    case 'success':
    case 'positive':
      return t.c.success;
    case 'warning':
      return t.c.warning;
    case 'primary':
      return t.c.primaryText;
    case 'onPrimary':
      return t.c.onPrimary;
    case 'neutral':
    case 'default':
      return t.c.text;
  }
}

export function AppText({
  children,
  variant = 'body',
  tone = 'default',
  bold = false,
  center = false,
  numberOfLines,
  fit = false,
  style,
  testID,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  bold?: boolean;
  center?: boolean;
  numberOfLines?: number;
  /** One line, shrunk to fit: an amount must never break mid-number. */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const [size, lineHeight] = SIZES[variant];
  return (
    <Text
      testID={testID}
      numberOfLines={fit ? 1 : numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.5 : undefined}
      accessibilityRole={variant === 'title' ? 'header' : undefined}
      style={[
        {
          color: toneColor(t, tone),
          fontSize: t.fs(size),
          lineHeight: t.fs(lineHeight),
          textAlign: center ? 'center' : 'left',
          fontWeight: bold || variant === 'title' || variant === 'hero' || variant === 'heading' ? '700' : '400',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ----- containers -----------------------------------------------------------------

export function ScreenScroll({ children, testID, footer }: { children: ReactNode; testID?: string; footer?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: footer ? 96 : 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** A form screen: scrolls, and keeps the focused field above the keyboard. */
export function FormScreen({ children, testID }: { children: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export type CardAccent = 'none' | 'primary' | 'warning' | 'danger';

export function Card({
  children,
  onPress,
  testID,
  accent = 'none',
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
  accent?: CardAccent;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const accentColor = accent === 'primary' ? t.c.primary : accent === 'warning' ? t.c.warning : accent === 'danger' ? t.c.danger : null;
  const bg = accent === 'warning' ? t.c.warningBg : accent === 'danger' ? t.c.dangerBg : accent === 'primary' ? t.c.primaryBg : t.c.surface;
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.c.border,
    ...(accentColor ? { borderStartWidth: 4, borderStartColor: accentColor } : null),
  };
  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, { minHeight: TOUCH }, pressed && { opacity: 0.85 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
      <AppText variant="heading" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

/** Label on the start side, value on the end side; the value never shrinks. */
export function LabelValue({ label, value, tone = 'default', testID, bold = false }: { label: string; value: string; tone?: TextTone; testID?: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }} testID={testID}>
      <AppText variant="small" tone="muted" style={{ flex: 1, flexShrink: 1 }}>
        {label}
      </AppText>
      <AppText variant="small" tone={tone} bold={bold} style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </AppText>
    </View>
  );
}

export function Row({ children, gap = 8, wrap = false, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.c.border, marginVertical: 4 }} />;
}

// ----- buttons ------------------------------------------------------------------------

export type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Btn({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  busy = false,
  testID,
  compact = false,
  flex = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  compact?: boolean;
  flex?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const off = disabled || busy;
  const bg = off && tone !== 'ghost' ? t.c.disabled : tone === 'primary' ? t.c.primary : tone === 'danger' ? t.c.danger : tone === 'secondary' ? t.c.surface : 'transparent';
  const fg = tone === 'primary' || tone === 'danger' ? t.c.onPrimary : off ? t.c.textMuted : tone === 'secondary' ? t.c.primaryText : t.c.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: TOUCH,
          minWidth: TOUCH,
          borderRadius: 11,
          paddingHorizontal: compact ? 12 : 16,
          paddingVertical: compact ? 8 : 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: tone === 'secondary' ? 1 : 0,
          borderColor: off ? t.c.disabled : t.c.primary,
        },
        flex && { flex: 1 },
        pressed && !off && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: fg, fontSize: t.fs(compact ? 14 : 15.5), fontWeight: '700', textAlign: 'center' }}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

/** Two buttons side by side (primary action first = start side). */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{children}</View>;
}

/** The floating "+" — bottom-centre, like the Web's .fab. */
export function Fab({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) {
  const t = useTheme();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', start: 0, end: 0, bottom: 20, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: t.c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 6,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: t.c.onPrimary, fontSize: 30, lineHeight: 34, fontWeight: '400' }}>+</Text>
      </Pressable>
    </View>
  );
}

// ----- status ------------------------------------------------------------------------------

export function Banner({ tone, text, onDismiss, testID }: { tone: 'success' | 'error' | 'info' | 'warning'; text: string; onDismiss?: () => void; testID?: string }) {
  const t = useTheme();
  const bg = tone === 'error' ? t.c.dangerBg : tone === 'warning' ? t.c.warningBg : tone === 'success' ? t.c.primaryBg : t.c.surface;
  const fg: TextTone = tone === 'error' ? 'danger' : tone === 'warning' ? 'warning' : tone === 'success' ? 'primary' : 'default';
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: bg, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.border }}
    >
      <AppText variant="small" tone={fg} style={{ flex: 1 }}>
        {text}
      </AppText>
      {onDismiss ? <Btn label="✕" tone="ghost" compact onPress={onDismiss} accessibilityLabel="סגירת ההודעה" testID={testID ? `${testID}-dismiss` : undefined} /> : null}
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: 'success' | 'danger' | 'muted' | 'warning' | 'primary' }) {
  const t = useTheme();
  const bg = tone === 'success' ? t.c.primaryBg : tone === 'danger' ? t.c.dangerBg : tone === 'warning' ? t.c.warningBg : tone === 'primary' ? t.c.primaryBg : t.c.bg;
  const fg: TextTone = tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : tone === 'primary' ? 'primary' : 'muted';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <AppText variant="caption" tone={fg} bold>
        {text}
      </AppText>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 8, borderRadius: 4, backgroundColor: t.c.border, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: t.c.primary }} />
    </View>
  );
}

export function EmptyState({ text, testID }: { text: string; testID?: string }) {
  return (
    <View style={{ paddingVertical: 20, paddingHorizontal: 8 }} testID={testID}>
      <AppText tone="muted" center>
        {text}
      </AppText>
    </View>
  );
}

/** Self-dismissing, non-blocking notice. */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const t = useTheme();
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [text, onDone]);
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', start: 16, end: 16, bottom: 16, backgroundColor: t.c.text, borderRadius: 12, padding: 12 }}
    >
      <Text style={{ color: t.c.bg, fontSize: t.fs(14), textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

// ----- form fields --------------------------------------------------------------------------

function FieldShell({ label, error, hint, children, labelFor }: { label: string; error?: string | null; hint?: string | null; children: ReactNode; labelFor?: string }) {
  return (
    <View style={{ gap: 5 }} accessibilityLabel={labelFor}>
      <AppText variant="small" tone="muted" bold>
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" tone="danger" testID="field-error">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  keyboardType,
  placeholder,
  testID,
  multiline = false,
  maxLength,
  editable = true,
  secure = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  hint?: string | null;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  testID?: string;
  multiline?: boolean;
  maxLength?: number;
  editable?: boolean;
  /** Masked input (PIN fields). */
  secure?: boolean;
}) {
  const t = useTheme();
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={t.c.textMuted}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? 88 : TOUCH + 4,
          borderWidth: 1,
          borderColor: error ? t.c.danger : t.c.border,
          borderRadius: 11,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: t.fs(16),
          color: t.c.text,
          backgroundColor: t.c.surface,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </FieldShell>
  );
}

export type Option<T extends string> = { readonly value: T; readonly label: string };

/** A small set of choices shown inline as chips (wraps on narrow screens). */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
  testID,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T | '';
  onChange: (value: T) => void;
  error?: string | null;
  hint?: string | null;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" testID={testID}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              testID={testID ? `${testID}-${o.value}` : undefined}
              style={{
                minHeight: TOUCH,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: 11,
                borderWidth: 1,
                borderColor: active ? t.c.primary : t.c.border,
                backgroundColor: active ? t.c.primary : t.c.surface,
              }}
            >
              <Text style={{ color: active ? t.c.onPrimary : t.c.text, fontSize: t.fs(14.5), fontWeight: active ? '700' : '400' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

function SheetModal({ visible, title, onClose, children, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: t.c.overlay, justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="סגירה">
        <Pressable
          testID={testID}
          onPress={() => undefined}
          style={{ backgroundColor: t.c.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28, gap: 10, maxHeight: '85%' }}
        >
          <AppText variant="heading">{title}</AppText>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A choice from a longer list, picked in a bottom sheet. */
export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'יש לבחור',
  error,
  hint,
  testID,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T | '';
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string | null;
  testID?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current ? current.label : placeholder}`}
        onPress={() => setOpen(true)}
        testID={testID}
        style={{
          minHeight: TOUCH + 4,
          borderWidth: 1,
          borderColor: error ? t.c.danger : t.c.border,
          borderRadius: 11,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: t.c.surface,
        }}
      >
        <Text style={{ flex: 1, fontSize: t.fs(16), color: current ? t.c.text : t.c.textMuted, textAlign: 'left' }}>{current ? current.label : placeholder}</Text>
        <Text style={{ color: t.c.textMuted, fontSize: 14 }}>▾</Text>
      </Pressable>
      <SheetModal visible={open} title={label} onClose={() => setOpen(false)} testID={testID ? `${testID}-sheet` : undefined}>
        <ScrollView>
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: o.value === value }}
              onPress={() => {
                setOpen(false);
                onChange(o.value);
              }}
              testID={testID ? `${testID}-option-${o.value}` : undefined}
              style={{ minHeight: TOUCH + 4, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.border }}
            >
              <Text style={{ fontSize: t.fs(16), color: o.value === value ? t.c.primaryText : t.c.text, fontWeight: o.value === value ? '700' : '400', textAlign: 'left' }}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>
    </FieldShell>
  );
}

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** A local 'YYYY-MM-DD' picked from a month calendar (no date-picker package); '' = empty. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  testID,
  allowClear = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string | null;
  testID?: string;
  allowClear?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const valid = isValidDateStr(value);
  const selected = valid ? (parseLocalDateStr(value) as Date) : null;
  const [month, setMonth] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const openPicker = () => {
    const base = selected ?? new Date();
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  };
  const cells: (Date | null)[] = [];
  const lead = month.getDay();
  for (let i = 0; i < lead; i++) cells.push(null);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  const todayKey = cashflowDateKey(new Date());
  const pick = (d: Date) => {
    setOpen(false);
    onChange(cashflowDateKey(d));
  };
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <FieldShell label={label} error={error} hint={hint}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected ? formatDate(selected) : 'לא נבחר'}`}
          onPress={openPicker}
          testID={testID}
          style={{
            flex: 1,
            minHeight: TOUCH + 4,
            borderWidth: 1,
            borderColor: error ? t.c.danger : t.c.border,
            borderRadius: 11,
            paddingHorizontal: 12,
            justifyContent: 'center',
            backgroundColor: t.c.surface,
          }}
        >
          <Text style={{ fontSize: t.fs(16), color: selected ? t.c.text : t.c.textMuted, textAlign: 'left' }} testID={testID ? `${testID}-value` : undefined}>
            {selected ? formatDate(selected) : 'בחירת תאריך'}
          </Text>
        </Pressable>
        {allowClear && value ? <Btn label="ניקוי" tone="secondary" compact onPress={() => onChange('')} testID={testID ? `${testID}-clear` : undefined} /> : null}
      </View>
      <SheetModal visible={open} title={label} onClose={() => setOpen(false)} testID={testID ? `${testID}-calendar` : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Btn label="הקודם" tone="secondary" compact onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} testID="calendar-prev" />
          <AppText variant="heading" center style={{ flex: 1 }}>
            {HEBREW_MONTHS[month.getMonth()] + ' ' + month.getFullYear()}
          </AppText>
          <Btn label="הבא" tone="secondary" compact onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} testID="calendar-next" />
        </View>
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={{ flex: 1, textAlign: 'center', color: t.c.textMuted, fontSize: t.fs(12.5) }}>
              {w}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((d, di) => {
              if (!d) return <View key={di} style={{ flex: 1, height: TOUCH }} />;
              const key = cashflowDateKey(d);
              const isSel = value === key;
              const isToday = key === todayKey;
              return (
                <Pressable
                  key={di}
                  accessibilityRole="button"
                  accessibilityLabel={formatDate(d)}
                  accessibilityState={{ selected: isSel }}
                  onPress={() => pick(d)}
                  testID={`calendar-day-${key}`}
                  style={{
                    flex: 1,
                    height: TOUCH,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 22,
                    backgroundColor: isSel ? t.c.primary : 'transparent',
                    borderWidth: isToday && !isSel ? 1 : 0,
                    borderColor: t.c.primary,
                  }}
                >
                  <Text style={{ color: isSel ? t.c.onPrimary : t.c.text, fontSize: t.fs(15) }}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <ButtonRow>
          <Btn label="היום" tone="secondary" compact onPress={() => pick(new Date())} testID="calendar-today" />
          <Btn label="סגירה" tone="ghost" compact onPress={() => setOpen(false)} testID="calendar-close" />
        </ButtonRow>
      </SheetModal>
    </FieldShell>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
  hint,
  disabled = false,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string | null;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!value)}
      testID={testID}
      style={{ minHeight: TOUCH + 4, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.disabled }}
        thumbColor={t.c.surface}
        testID={testID ? `${testID}-switch` : undefined}
      />
    </Pressable>
  );
}

// ----- dialogs & Back ---------------------------------------------------------------------------

export type SheetAction = { readonly key: string; readonly label: string; readonly tone?: 'default' | 'danger'; readonly onPress: () => void };

/** A bottom action sheet; Back / tapping outside cancels. */
export function ActionSheet({ visible, title, actions, onClose, testID }: { visible: boolean; title: string; actions: readonly SheetAction[]; onClose: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <SheetModal visible={visible} title={title} onClose={onClose} testID={testID}>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            a.onPress();
          }}
          testID={testID ? `${testID}-${a.key}` : undefined}
          style={{ minHeight: TOUCH + 4, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.border }}
        >
          <Text style={{ fontSize: t.fs(16), color: a.tone === 'danger' ? t.c.danger : t.c.text, textAlign: 'left' }}>{a.label}</Text>
        </Pressable>
      ))}
      <Btn label="ביטול" tone="secondary" onPress={onClose} testID={testID ? `${testID}-cancel` : undefined} />
    </SheetModal>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'ביטול',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
  testID,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => undefined : onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.c.overlay, justifyContent: 'center', padding: 20 }}>
        <View testID={testID} accessibilityViewIsModal style={{ backgroundColor: t.c.surface, borderRadius: 16, padding: 18, gap: 12 }}>
          <AppText variant="heading">{title}</AppText>
          {message ? <AppText variant="small">{message}</AppText> : null}
          {children}
          <ButtonRow>
            <Btn label={confirmLabel} tone={destructive ? 'danger' : 'primary'} busy={busy} onPress={onConfirm} flex testID={testID ? `${testID}-confirm` : undefined} />
            <Btn label={cancelLabel} tone="secondary" disabled={busy} onPress={onCancel} flex testID={testID ? `${testID}-cancel` : undefined} />
          </ButtonRow>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Hardware Back closes an in-screen transient (an expanded panel, an inline
 * form) before it leaves the screen. Only while the screen is focused.
 */
export function useBackCloses(active: boolean, close: () => void): void {
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [active, close]),
  );
}

/** Memoised themed styles. */
export function useThemedStyles<T>(make: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => make(t), [t, make]);
}
