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

// The Web type scale (styles.css): hero 40 (.hero-amount), title 19 (.app-header h1),
// heading 15 (.section-title), body 14, small 13 (rows / notes), caption 11.5
// (.tx-date, .goal-meta-row). Line heights follow the Web's ~1.4–1.55.
const SIZES: Readonly<Record<TextVariant, readonly [number, number]>> = {
  hero: [40, 48],
  title: [19, 26],
  heading: [15, 21],
  body: [14, 20],
  small: [13, 19],
  caption: [11.5, 16.5],
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

/** styles.css --shadow (0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)). */
export const webShadow: ViewStyle = {
  elevation: 1.5,
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
};

/** styles.css .screen (padding 4px 16px) — cards stack 8px apart like .tx-row / .category-row. */
export function ScreenScroll({ children, testID, footer }: { children: ReactNode; testID?: string; footer?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 8, paddingBottom: footer ? 110 : 32 }}
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

/**
 * The Web's card tones (styles.css): 'none' = the plain surface card
 * (.tx-edit-form / .category-row / .goal-card: radius 12, --shadow);
 * 'primary' = .insight-card (tinted, radius 14, 4px start stripe, --shadow);
 * 'warning' / 'danger' = .attention-item / .goal-inline-confirm (tinted,
 * radius 10, 4px start stripe, no shadow).
 */
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
  const bg = accent === 'warning' ? t.c.warningBg : accent === 'danger' ? t.c.dangerBg : accent === 'primary' ? t.c.insightCardBg : t.c.surface;
  const base: ViewStyle =
    accentColor === null
      ? { backgroundColor: bg, borderRadius: 12, padding: 14, gap: 6, ...webShadow }
      : accent === 'primary'
        ? { backgroundColor: bg, borderRadius: 14, padding: 16, gap: 6, borderStartWidth: 4, borderStartColor: accentColor, ...webShadow }
        : { backgroundColor: bg, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, gap: 6, borderStartWidth: 4, borderStartColor: accentColor };
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

/**
 * styles.css .section-title: 15px bold, 22px above / 11px below (the screen's 8px
 * gap included); the first title on a screen sits 4px from the top
 * (.section-title:first-child).
 */
export function SectionTitle({ title, action, first = false }: { title: string; action?: ReactNode; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: first ? 0 : 14, marginBottom: 3 }}>
      <Text accessibilityRole="header" style={{ flexShrink: 1, fontSize: t.fs(15), fontWeight: '700', letterSpacing: -0.1, color: t.c.text, textAlign: 'left' }}>
        {title}
      </Text>
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

/**
 * The Web's button classes (styles.css): primary = .tx-edit-save (primary fill,
 * white text); secondary = .tx-edit-cancel / .cat-edit-btn (page-background fill,
 * border); danger = .settings-danger-btn (outlined red); dashed = .cat-add-toggle
 * (page-background fill, dashed border); ghost = a plain text action. Sizes follow
 * the Web (13.5px, compact 12px); the ≥44dp touch target is the native minimum.
 */
export type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dashed';

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
  let bg = 'transparent';
  let fg = t.c.text;
  let borderWidth = 0;
  let borderColor = 'transparent';
  let borderStyle: 'solid' | 'dashed' = 'solid';
  let weight: '400' | '600' = '400';
  switch (tone) {
    case 'primary':
      bg = off ? t.c.disabled : t.c.primary;
      fg = t.c.onPrimary;
      break;
    case 'secondary':
      bg = t.c.bg;
      fg = off ? t.c.textMuted : t.c.text;
      borderWidth = 1;
      borderColor = t.c.border;
      break;
    case 'danger':
      fg = off ? t.c.textMuted : t.c.danger;
      borderWidth = 1;
      borderColor = off ? t.c.disabled : t.c.danger;
      weight = '600';
      break;
    case 'dashed':
      bg = t.c.bg;
      fg = off ? t.c.textMuted : t.c.text;
      borderWidth = 1;
      borderColor = t.c.border;
      borderStyle = 'dashed';
      break;
    case 'ghost':
      fg = off ? t.c.textMuted : t.c.primaryText;
      weight = '600';
      break;
  }
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
          borderRadius: compact ? 8 : 10,
          paddingHorizontal: compact ? 10 : 14,
          paddingVertical: compact ? 6 : 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth,
          borderColor,
          borderStyle,
        },
        flex && { flex: 1 },
        pressed && !off && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: fg, fontSize: t.fs(compact ? 12 : 13.5), fontWeight: weight, textAlign: 'center' }}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

/** Two buttons side by side (primary action first = start side). */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{children}</View>;
}

/** The floating "+" — bottom-centre above the navigation, styles.css .fab (56px, 28px "+"). */
export function Fab({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) {
  const t = useTheme();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', start: 0, end: 0, bottom: 16, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 6 },
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: t.c.onPrimary, fontSize: 28, lineHeight: 32, fontWeight: '400' }}>+</Text>
      </Pressable>
    </View>
  );
}

// ----- status ------------------------------------------------------------------------------

/** A status line (styles.css .settings-hint / .reminder-error-box tones). */
export function Banner({ tone, text, onDismiss, testID }: { tone: 'success' | 'error' | 'info' | 'warning'; text: string; onDismiss?: () => void; testID?: string }) {
  const t = useTheme();
  const bg = tone === 'error' ? t.c.dangerBg : tone === 'warning' ? t.c.warningBg : tone === 'success' ? t.c.primaryBg : t.c.surface;
  const fg = tone === 'error' ? t.c.danger : tone === 'warning' ? t.c.warning : tone === 'success' ? t.c.primaryText : t.c.text;
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={[{ backgroundColor: bg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, tone === 'info' ? webShadow : null]}>
      <Text style={{ flex: 1, fontSize: t.fs(12.5), lineHeight: t.fs(18.8), color: fg, textAlign: 'left' }}>{text}</Text>
      {onDismiss ? <Btn label="✕" tone="ghost" compact onPress={onDismiss} accessibilityLabel="סגירת ההודעה" testID={testID ? `${testID}-dismiss` : undefined} /> : null}
    </View>
  );
}

/** styles.css .goal-badge: 10px, 600, radius 6. */
export function Badge({ text, tone }: { text: string; tone: 'success' | 'danger' | 'muted' | 'warning' | 'primary' }) {
  const t = useTheme();
  const bg = tone === 'success' ? t.c.primaryBg : tone === 'danger' ? t.c.dangerBg : tone === 'warning' ? t.c.warningBg : tone === 'primary' ? t.c.primaryBg : t.c.bg;
  const fg = tone === 'danger' ? t.c.danger : tone === 'warning' ? t.c.warning : tone === 'muted' ? t.c.textMuted : t.c.text;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', borderWidth: tone === 'muted' ? 1 : 0, borderColor: t.c.border }}>
      <Text style={{ fontSize: t.fs(10), fontWeight: '600', color: fg }}>{text}</Text>
    </View>
  );
}

/** styles.css .goal-progress-track / -fill: 7px. */
export function ProgressBar({ value }: { value: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 7, borderRadius: 4, backgroundColor: t.c.border, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: 7, borderRadius: 4, backgroundColor: t.c.primary }} />
    </View>
  );
}

/** styles.css .insight-note, centred (the Web's empty-list text). */
export function EmptyState({ text, testID }: { text: string; testID?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 4 }} testID={testID}>
      <Text style={{ fontSize: t.fs(12.5), lineHeight: t.fs(19.4), color: t.c.text, opacity: 0.82, textAlign: 'center' }}>{text}</Text>
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

/** styles.css .tx-edit-group: a 12px muted label above the control; hint / error below. */
function FieldShell({
  label,
  error,
  hint,
  children,
  labelFor,
  compact = false,
  style,
}: {
  label: string;
  error?: string | null;
  hint?: string | null;
  children: ReactNode;
  labelFor?: string;
  /** Bare control only (inline rows). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  if (compact) return <View style={style}>{children}</View>;
  return (
    <View style={[{ gap: 4 }, style]} accessibilityLabel={labelFor}>
      <Text style={{ fontSize: t.fs(12), color: t.c.textMuted, textAlign: 'left' }}>{label}</Text>
      {children}
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <Text testID="field-error" style={{ fontSize: t.fs(12), color: t.c.danger, marginTop: 2, textAlign: 'left' }}>
          {error}
        </Text>
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
          minHeight: multiline ? 56 : TOUCH,
          borderWidth: 1,
          borderColor: error ? t.c.danger : t.c.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 9,
          fontSize: t.fs(14),
          color: t.c.text,
          backgroundColor: error ? t.c.dangerBg : t.c.bg,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </FieldShell>
  );
}

/** A bare date input for inline rows (styles.css .home-atm-date-input). */
export function CompactDateInput({ label, value, onChange, style, testID }: { label: string; value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <DateField label={label} value={value} onChange={onChange} compact style={style} testID={testID} />;
}

/** styles.css .filter-toggle / .filter-btn — equal segments; the active one is primary. */
export function FilterToggle<T extends string>({
  options,
  value,
  onChange,
  testID,
  accessibilityLabel,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} testID={testID} style={{ flexDirection: 'row', gap: 8, marginTop: 2, marginBottom: 8 }}>
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
              flex: 1,
              minHeight: TOUCH - 4,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: active ? t.c.primary : t.c.border,
              backgroundColor: active ? t.c.primary : t.c.surface,
            }}
          >
            <Text style={{ fontSize: t.fs(13), color: active ? t.c.onPrimary : t.c.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  compact = false,
  style,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string | null;
  testID?: string;
  allowClear?: boolean;
  /** A bare input for inline rows (no label / hint / clear), e.g. .home-atm-date-input. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
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
    <FieldShell label={label} error={error} hint={hint} compact={compact} style={style}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected ? formatDate(selected) : 'לא נבחר'}`}
          onPress={openPicker}
          testID={testID}
          style={{
            flex: 1,
            minHeight: compact ? 40 : TOUCH,
            borderWidth: 1,
            borderColor: error ? t.c.danger : t.c.border,
            borderRadius: 10,
            paddingHorizontal: compact ? 10 : 12,
            justifyContent: 'center',
            backgroundColor: t.c.bg,
          }}
        >
          <Text style={{ fontSize: t.fs(compact ? 13.5 : 14), color: selected ? t.c.text : t.c.textMuted, textAlign: 'left' }} testID={testID ? `${testID}-value` : undefined}>
            {selected ? formatDate(selected) : 'בחירת תאריך'}
          </Text>
        </Pressable>
        {allowClear && value && !compact ? <Btn label="ניקוי" tone="secondary" compact onPress={() => onChange('')} testID={testID ? `${testID}-clear` : undefined} /> : null}
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

/** styles.css .settings-color-swatch: 32px colour circles; the active one gets a text-colour ring. */
export function ColorSwatchRow<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  options: readonly { readonly value: T; readonly label: string; readonly color: string }[];
  value: T | '';
  onChange: (value: T) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <FieldShell label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} accessibilityRole="radiogroup" testID={testID}>
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
              style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: o.color, borderWidth: 2, borderColor: active ? t.c.text : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

/** styles.css .settings-row + .settings-toggle-btn: the label, then a "פעיל" / "כבוי" pill. */
export function PillToggleRow({
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: t.fs(13.5), color: t.c.text, textAlign: 'left' }}>{label}</Text>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onChange(!value)}
        hitSlop={8}
        testID={testID}
        style={{
          minHeight: 32,
          minWidth: 64,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: value ? t.c.primary : t.c.border,
          backgroundColor: value ? t.c.primary : t.c.surface,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text style={{ fontSize: t.fs(12), color: value ? t.c.onPrimary : t.c.textMuted }}>{value ? 'פעיל' : 'כבוי'}</Text>
      </Pressable>
    </View>
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
