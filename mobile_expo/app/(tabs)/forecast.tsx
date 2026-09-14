// Forecast: the 5th→4th period (approved decision D) from the Stage 2 engine.
// Days before the opening date stay unavailable ("—"); cash withdrawals are
// shown apart from expenses (correction A). No 6-month view.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { buildForecastView, FORECAST_TEXT, type ForecastChart, type ForecastDayRow } from '../../src/presentation/forecastView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Badge, Btn, Card, ScreenScroll, SectionTitle, TOUCH } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useSafePush, WithFinance } from '../../src/ui/useFinance.tsx';

export default function ForecastScreen() {
  return <WithFinance>{(s) => <ForecastContent snapshot={s} />}</WithFinance>;
}

function ForecastContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const view = useMemo(() => buildForecastView(snapshot), [snapshot]);
  const push = useSafePush();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScreenScroll testID="screen-forecast">
      <SectionTitle title="תחזית" />
      <Card accent="primary" testID="forecast-next-event">
        <AppText variant="caption" tone="muted" bold>
          האירוע הכספי הבא
        </AppText>
        <AppText variant="heading" tone={view.nextEvent.tone}>
          {view.nextEvent.valueText}
        </AppText>
        <AppText variant="small">{view.nextEvent.note}</AppText>
      </Card>

      {!view.configured ? (
        <Card testID="forecast-unconfigured">
          <AppText>{FORECAST_TEXT.unconfigured}</AppText>
          <Btn label="הגדר יתרת התחלה" onPress={() => push('/opening-balance')} testID="forecast-setup-opening" />
        </Card>
      ) : (
        <>
          <SectionTitle title={'📈 יתרה יומית צפויה'} />
          <AppText variant="small" bold testID="forecast-period">
            {view.periodLabel}
          </AppText>
          <AppText variant="caption" tone="muted">
            {FORECAST_TEXT.basis}
          </AppText>
          {view.chart ? <Chart chart={view.chart} /> : null}

          <SectionTitle title="📋 פירוט יומי" />
          <AppText variant="caption" tone="muted">
            הקשה על יום מציגה את התנועות שלו.
          </AppText>
          {view.rows.map((row) => (
            <DayRow key={row.key} row={row} expanded={expanded === row.key} onToggle={() => setExpanded((k) => (k === row.key ? null : row.key))} />
          ))}
        </>
      )}

      <SectionTitle title="מעקב" />
      {view.insights.map((c) => (
        <Card key={c.title} accent="primary">
          <AppText variant="caption" tone="muted" bold>
            {c.title}
          </AppText>
          <AppText variant="heading">{c.value}</AppText>
          <AppText variant="small">{c.note}</AppText>
        </Card>
      ))}
    </ScreenScroll>
  );
}

function DayRow({ row, expanded, onToggle }: { row: ForecastDayRow; expanded: boolean; onToggle: () => void }) {
  const t = useTheme();
  const unavailable = row.availability === 'unavailable';
  const parts = unavailable
    ? ['אין נתון לפני יתרת ההתחלה']
    : [
        'הכנסות ' + row.incomeText,
        'הוצאות ' + row.expensesText,
        ...(row.withdrawalsText ? ['משיכות ' + row.withdrawalsText] : []),
        ...(row.availability === 'opening' ? [] : ['שינוי ' + row.netText]),
      ];
  return (
    <View
      testID={`forecast-day-${row.key}`}
      style={{
        backgroundColor: row.isToday ? t.c.primaryBg : t.c.surface,
        borderRadius: 12,
        borderWidth: row.isToday ? 1.5 : StyleSheet.hairlineWidth,
        borderColor: row.isToday ? t.c.primary : t.c.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={row.dateText + ', יתרה צפויה ' + row.balanceText}
        onPress={onToggle}
        style={{ minHeight: TOUCH + 8, padding: 10, gap: 2 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText bold style={{ flex: 1 }}>
            {row.dateText + (row.isToday ? ' · היום' : '')}
          </AppText>
          <AppText bold tone={row.balanceTone} style={{ flexShrink: 0 }} testID={`forecast-balance-${row.key}`}>
            {row.balanceText}
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          {parts.join(' · ')}
        </AppText>
      </Pressable>
      {expanded ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 6 }} testID={`forecast-details-${row.key}`}>
          {row.openingNote ? (
            <AppText variant="caption" tone="muted">
              {row.openingNote}
            </AppText>
          ) : null}
          {row.events.map((ev) => (
            <View key={ev.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <AppText variant="small">{ev.title}</AppText>
                {ev.kind === 'withdrawal' ? <Badge text="משיכה — לא הוצאה" tone="warning" /> : null}
                {ev.includedInOpening ? <Badge text="כלול ביתרת ההתחלה" tone="muted" /> : null}
              </View>
              <AppText variant="small" bold tone={ev.kind === 'income' ? 'positive' : ev.kind === 'withdrawal' ? 'warning' : 'negative'} style={{ flexShrink: 0 }}>
                {ev.amountText}
              </AppText>
            </View>
          ))}
          {row.emptyNote ? (
            <AppText variant="caption" tone="muted">
              {row.emptyNote}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const CHART_HEIGHT = 130;

/** The Web's approved projected-daily-balance chart, drawn with views (no chart package). */
function Chart({ chart }: { chart: ForecastChart }) {
  const t = useTheme();
  if (chart.kind === 'empty') {
    return (
      <Card>
        <AppText variant="small" tone="muted">
          {chart.message}
        </AppText>
      </Card>
    );
  }
  const crossing = chart.min <= 0 && chart.max >= 0;
  const base = crossing ? 0 : chart.min;
  const range = chart.max - chart.min || 1;
  const topH = (CHART_HEIGHT * (chart.max - base)) / range;
  const bottomH = CHART_HEIGHT - topH;
  const byIndex = new Map(chart.points.map((p) => [p.index, p.value]));
  const columns = Array.from({ length: chart.totalDays }, (_, i) => i + 1);
  return (
    <Card testID="forecast-chart" accessibilityLabel={chart.summary}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" tone="muted">
          {chart.maxText}
        </AppText>
        <AppText variant="caption" tone="muted">
          {'מינימום ' + chart.minText}
        </AppText>
      </View>
      <View style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'stretch' }} accessible accessibilityLabel={chart.summary}>
        {columns.map((index) => {
          const v = byIndex.get(index);
          const up = v !== undefined && v > base ? (CHART_HEIGHT * (v - base)) / range : 0;
          const down = v !== undefined && v < base ? (CHART_HEIGHT * (base - v)) / range : 0;
          const color = v !== undefined && v >= 0 ? t.c.success : t.c.danger;
          return (
            <View key={index} style={{ flex: 1, marginHorizontal: 0.5 }}>
              <View style={{ height: topH, justifyContent: 'flex-end' }}>
                {v !== undefined && up === 0 && down === 0 ? <View style={{ height: 1.5, backgroundColor: color }} /> : null}
                {up > 0 ? <View style={{ height: Math.max(1.5, up), backgroundColor: color, opacity: 0.75, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} /> : null}
              </View>
              <View style={{ height: bottomH, borderTopWidth: crossing ? StyleSheet.hairlineWidth : 0, borderTopColor: t.c.textMuted }}>
                {down > 0 ? <View style={{ height: Math.max(1.5, down), backgroundColor: t.c.danger, opacity: 0.75 }} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" tone="muted">
          {chart.firstLabel}
        </AppText>
        <AppText variant="caption" tone="muted">
          {chart.lastLabel}
        </AppText>
      </View>
      <AppText variant="caption" tone="muted">
        {chart.summary}
      </AppText>
    </Card>
  );
}
