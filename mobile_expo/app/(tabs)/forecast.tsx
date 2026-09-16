// Forecast — index.html #screen-insights: "תחזית", the "האירוע הכספי הבא"
// insight card, then (with an opening balance) the "📈 יתרה יומית צפויה" box with
// the Web's step chart and the "📋 פירוט יומי" box with the day table in its
// narrow (≤480px) labelled-card layout, then the two tracking insight cards.
// Every figure comes from buildForecastView() (Stage 2 engine); the 5th→4th
// period, "—" before the opening date, no 6-month view.
//
// Approved correction A fitted into the Web table: a day's expenses exclude cash
// withdrawals, which appear as their own labelled cell on the days that have one.

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { buildForecastView, FORECAST_TEXT, type ForecastChart, type ForecastDayRow } from '../../src/presentation/forecastView.ts';
import type { Tone } from '../../src/presentation/format.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { Btn, ScreenScroll, SectionTitle, TOUCH, webShadow } from '../../src/ui/kit.tsx';
import { useTheme, type Theme } from '../../src/ui/theme.ts';
import { useSafePush, WithFinance } from '../../src/ui/useFinance.tsx';

export default function ForecastScreen() {
  return <WithFinance>{(s) => <ForecastContent snapshot={s} />}</WithFinance>;
}

function toneColorOf(t: Theme, tone: Tone | 'income' | 'expense'): string {
  if (tone === 'positive' || tone === 'income') return t.c.success;
  if (tone === 'negative' || tone === 'expense') return t.c.danger;
  return t.c.text;
}

/** styles.css .insight-note */
function Note({ children, style }: { children: string; style?: object }) {
  const t = useTheme();
  return <Text style={[{ fontSize: t.fs(12.5), color: t.c.text, opacity: 0.82, lineHeight: t.fs(19.4), textAlign: 'left' }, style]}>{children}</Text>;
}

/** styles.css .insight-card (icon circle + title / value / note), --color-insight-card-bg. */
function InsightCard({ icon, title, value, valueColor, note, testID }: { icon: string; title: string; value: string; valueColor?: string; note: string; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: t.c.insightCardBg, borderRadius: 14, padding: 16, borderStartWidth: 4, borderStartColor: t.c.primary }, webShadow]}
    >
      <View style={[{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.c.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, webShadow]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: t.fs(11.5), color: t.c.textMuted, letterSpacing: 0.3, fontWeight: '600', textAlign: 'left' }}>{title}</Text>
        <Text style={{ fontSize: t.fs(21), fontWeight: '800', marginTop: 5, letterSpacing: -0.2, color: valueColor ?? t.c.text, textAlign: 'left', writingDirection: 'ltr' }}>{value}</Text>
        <Note style={{ marginTop: 6 }}>{note}</Note>
      </View>
    </View>
  );
}

/** styles.css .preview-forecast-box */
function Box({ children, testID }: { children: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[{ backgroundColor: t.c.surface, borderRadius: 14, padding: 16 }, webShadow]}>
      {children}
    </View>
  );
}

function BoxTitle({ text, marginBottom }: { text: string; marginBottom: number }) {
  const t = useTheme();
  return <Text style={{ fontSize: t.fs(15), fontWeight: '700', letterSpacing: -0.1, marginBottom, color: t.c.text, textAlign: 'left' }}>{text}</Text>;
}

function ForecastContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const t = useTheme();
  const view = useMemo(() => buildForecastView(snapshot), [snapshot]);
  const push = useSafePush();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScreenScroll testID="screen-forecast">
      <SectionTitle title="תחזית" first />
      <InsightCard icon="📊" title="האירוע הכספי הבא" value={view.nextEvent.valueText} valueColor={toneColorOf(t, view.nextEvent.tone)} note={view.nextEvent.note} testID="forecast-next-event" />

      {!view.configured ? (
        <View testID="forecast-unconfigured" style={{ gap: 8 }}>
          <Note>{FORECAST_TEXT.unconfigured}</Note>
          <Btn label="הגדר יתרת התחלה" onPress={() => push('/opening-balance')} testID="forecast-setup-opening" />
        </View>
      ) : (
        <>
          <Box testID="forecast-chart-box">
            <BoxTitle text={'📈 יתרה יומית צפויה — ' + view.periodLabel} marginBottom={4} />
            <Note style={{ marginBottom: 8 }}>{FORECAST_TEXT.basis}</Note>
            {view.chart ? <StepChart chart={view.chart} /> : null}
            {view.chart ? <Note>{view.chart.kind === 'empty' ? view.chart.message : view.chart.summary}</Note> : null}
          </Box>
          <Box testID="forecast-table-box">
            <BoxTitle text="📋 פירוט יומי" marginBottom={10} />
            {view.rows.map((row) => (
              <DayRow key={row.key} row={row} expanded={expanded === row.key} onToggle={() => setExpanded((k) => (k === row.key ? null : row.key))} />
            ))}
          </Box>
        </>
      )}

      {view.insights.map((c) => (
        <InsightCard key={c.title} icon="📊" title={c.title} value={c.value} note={c.note} />
      ))}
    </ScreenScroll>
  );
}

/** One labelled cell of the narrow layout (.forecast-day-cell::before = data-label). */
function Cell({ label, value, color, wide = false, bold = false, testID }: { label: string; value: string; color: string; wide?: boolean; bold?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <View style={{ width: wide ? '100%' : '50%', paddingEnd: 10 }}>
      <Text style={{ fontSize: t.fs(10), fontWeight: '500', color: t.c.textMuted, textAlign: 'left' }}>{label}</Text>
      <Text testID={testID} style={{ fontSize: t.fs(12.5), fontWeight: bold ? '600' : '400', color, textAlign: 'left', writingDirection: wide ? 'rtl' : 'ltr' }}>
        {value}
      </Text>
    </View>
  );
}

/** .forecast-day-row in the Web's narrow layout: a labelled date across the row, then labelled cells two per line. */
function DayRow({ row, expanded, onToggle }: { row: ForecastDayRow; expanded: boolean; onToggle: () => void }) {
  const t = useTheme();
  const unavailable = row.availability === 'unavailable';
  const netColor = unavailable || row.netText === '—' ? t.c.text : row.netText.includes('-') ? t.c.danger : row.netText.includes('+') ? t.c.success : t.c.text;
  return (
    <View testID={`forecast-day-${row.key}`} style={{ borderBottomWidth: 1, borderBottomColor: t.c.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={row.dateText + (unavailable ? ', אין נתון לפני יתרת ההתחלה' : ', יתרה צפויה ' + row.balanceText)}
        onPress={onToggle}
        style={({ pressed }) => ({
          minHeight: TOUCH,
          paddingVertical: 10,
          paddingHorizontal: 4,
          borderRadius: 8,
          backgroundColor: row.isToday ? t.c.insightCardBg : pressed ? t.c.bg : 'transparent',
          flexDirection: 'row',
          flexWrap: 'wrap',
          rowGap: 4,
        })}
      >
        <Cell label="תאריך" value={row.dateText} color={t.c.text} wide bold />
        <Cell label="הכנסות" value={row.incomeText} color={unavailable ? t.c.text : t.c.success} />
        <Cell label="הוצאות" value={row.expensesText} color={unavailable ? t.c.text : t.c.danger} />
        {row.withdrawalsText ? <Cell label="משיכות" value={row.withdrawalsText} color={t.c.warning} /> : null}
        <Cell label="שינוי יומי" value={row.netText} color={netColor} />
        <Cell label="יתרה צפויה" value={row.balanceText} color={unavailable ? t.c.text : toneColorOf(t, row.balanceTone)} testID={`forecast-balance-${row.key}`} />
      </Pressable>
      {expanded ? (
        <View style={{ backgroundColor: t.c.bg, paddingTop: 4, paddingHorizontal: 12, paddingBottom: 10 }} testID={`forecast-details-${row.key}`}>
          {row.openingNote ? <Note>{row.openingNote}</Note> : null}
          {row.events.map((ev) => (
            <View key={ev.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 }}>
              <Text style={{ flex: 1, fontSize: t.fs(12.5), color: t.c.text, textAlign: 'left' }}>
                {ev.title}
                {ev.includedInOpening ? <Text style={{ opacity: 0.82 }}> (כלול ביתרת ההתחלה)</Text> : null}
                {ev.kind === 'withdrawal' ? <Text style={{ opacity: 0.82 }}> (משיכה — לא הוצאה)</Text> : null}
              </Text>
              <Text style={{ fontSize: t.fs(12.5), fontWeight: '700', color: ev.kind === 'income' ? t.c.success : t.c.danger, writingDirection: 'ltr', flexShrink: 0 }}>{ev.amountText}</Text>
            </View>
          ))}
          {row.emptyNote ? <Note>{row.emptyNote}</Note> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The Web's step chart (app.js renderMonthlyCashflowChart(): viewBox 300×170,
 * padL 40 / padR 8 / padT 14 / padB 20): a 16%-opacity rectangle per day from the
 * baseline to its balance, a 2px staircase outline in the text colour, a dashed
 * zero line when the range crosses 0, and 7-unit min / max / first / last labels.
 * Drawn with Views scaled to the available width. With nothing to plot the Web
 * keeps the (empty) chart area and explains below it — so does this.
 */
function StepChart({ chart }: { chart: ForecastChart }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const k = width / 300;
  const H = 170 * k;
  if (chart.kind === 'empty') {
    return <View testID="forecast-chart-empty" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', height: H || 170 }} />;
  }
  const padL = 40 * k;
  const padR = 8 * k;
  const padT = 14 * k;
  const padB = 20 * k;
  const innerW = 300 * k - padL - padR;
  const innerH = H - padT - padB;
  const minV = chart.min;
  const maxV = chart.max;
  const range = maxV - minV || 1;
  const xOf = (i: number) => padL + (i / chart.totalDays) * innerW;
  const yOf = (v: number) => padT + innerH - ((v - minV) / range) * innerH;
  const crossing = minV <= 0 && maxV >= 0;
  const baselineY = crossing ? yOf(0) : yOf(minV);
  const label = { position: 'absolute' as const, fontSize: 7 * k, color: t.c.textMuted };
  const stroke = 2;
  const shapes: ReactNode[] = [];
  const first = chart.points[0];
  if (width > 0 && first) {
    let prevX = xOf(first.index);
    let prevY = yOf(first.value);
    chart.points.forEach((p, i) => {
      const x = xOf(p.index);
      const y = yOf(p.value);
      const fill = p.value >= 0 ? t.c.success : t.c.danger;
      shapes.push(
        <View
          key={'r' + i}
          style={{ position: 'absolute', left: Math.min(prevX, x), top: Math.min(y, baselineY), width: Math.max(1, Math.abs(x - prevX)), height: Math.max(1, Math.abs(baselineY - y)), backgroundColor: fill, opacity: 0.16 }}
        />,
      );
      shapes.push(<View key={'h' + i} style={{ position: 'absolute', left: Math.min(prevX, x), top: prevY - stroke / 2, width: Math.max(stroke, Math.abs(x - prevX)), height: stroke, backgroundColor: t.c.text }} />);
      shapes.push(<View key={'v' + i} style={{ position: 'absolute', left: x - stroke / 2, top: Math.min(prevY, y) - stroke / 2, width: stroke, height: Math.abs(y - prevY) + stroke, backgroundColor: t.c.text }} />);
      prevX = x;
      prevY = y;
    });
  }
  return (
    <View
      testID="forecast-chart"
      accessible
      accessibilityLabel={chart.summary}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: H || 170, position: 'relative', direction: 'ltr' }}
    >
      {width > 0 ? (
        <>
          {crossing ? <View style={{ position: 'absolute', left: padL, width: innerW, top: baselineY, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: t.c.border }} /> : null}
          {shapes}
          <Text style={[label, { left: padL, top: padT - 2 - 8 * k }]}>{chart.maxText}</Text>
          <Text style={[label, { left: padL, top: H - padB + 12 * k - 8 * k }]}>{chart.minText}</Text>
          <Text style={[label, { left: padL, top: H - 4 * k - 8 * k }]}>{chart.firstLabel}</Text>
          <Text style={[label, { right: padR, top: H - 4 * k - 8 * k }]}>{chart.lastLabel}</Text>
        </>
      ) : null}
    </View>
  );
}
