// Home. Every figure comes from buildHomeView() (Stage 2 domain); this file
// only lays it out. "Amount until next income" is intentionally not shown.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { moveTileKey } from '../../src/domain/tileOrder.ts';
import { buildHomeView, HOME_TEXT, type HomeTile } from '../../src/presentation/homeView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Badge, Banner, Btn, Card, ConfirmDialog, EmptyState, Row, ScreenScroll, SectionTitle, TOUCH, useBackCloses } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { TxRow } from '../../src/ui/TxRow.tsx';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';

export default function HomeScreen() {
  return <WithFinance>{(s) => <HomeContent snapshot={s} />}</WithFinance>;
}

function HomeContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { finance } = useServices();
  const t = useTheme();
  const push = useSafePush();
  const view = useMemo(() => buildHomeView(snapshot), [snapshot]);
  const [reorder, setReorder] = useState(false);
  const [deleteId, setDeleteId] = useState<{ id: unknown } | null>(null);
  const write = useWrite();
  const closeReorder = useCallback(() => setReorder(false), []);
  useBackCloses(reorder, closeReorder);

  const openCategory = (key: string) => push({ pathname: '/category/[key]', params: { key } });
  const editWithdrawal = (id: unknown) => push({ pathname: '/item-form', params: { mode: 'edit', id: JSON.stringify(id) } });

  return (
    <ScreenScroll testID="screen-home">
      {view.corruptBanner ? <Banner tone="warning" text={view.corruptBanner} testID="home-corrupt" /> : null}

      <Pressable
        testID="home-hero"
        accessibilityRole="button"
        accessibilityLabel={HOME_TEXT.heroLabel + ': ' + view.hero.amountText + '. הקשה פותחת את יתרת ההתחלה.'}
        onPress={() => push('/opening-balance')}
        style={({ pressed }) => ({ backgroundColor: t.c.primary, borderRadius: 18, padding: 18, gap: 6, alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
      >
        <AppText tone="onPrimary" variant="small" center>
          {HOME_TEXT.heroLabel}
        </AppText>
        <AppText tone="onPrimary" variant="hero" center fit testID="home-hero-amount">
          {view.hero.amountText}
        </AppText>
        {view.hero.tone === 'negative' ? <Badge text="יתרה צפויה שלילית — אזהרה בלבד" tone="danger" /> : null}
        <AppText tone="onPrimary" variant="caption" center testID="home-hero-status">
          {view.hero.status}
        </AppText>
        {view.hero.state === 'unconfigured' ? (
          <View style={{ alignSelf: 'center' }}>
            <Btn label="הגדר יתרת התחלה" tone="secondary" compact onPress={() => push('/opening-balance')} testID="home-setup-opening" />
          </View>
        ) : null}
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <SnapshotCard label="הכנסות" value={view.incomeText} tone="primary" testID="home-income" />
        <SnapshotCard label="סך הכול הוצאות" value={view.expensesText} tone="danger" caption={'לתקופה ' + view.periodText} testID="home-expenses" />
        <SnapshotCard label="משיכות מזומן" value={view.withdrawalsText} tone="warning" caption="מפחיתות יתרה, אינן הוצאה" testID="home-withdrawals" />
      </View>

      <SectionTitle
        title="קטגוריות"
        action={<Btn label={reorder ? 'סיום' : 'סידור'} tone="ghost" compact onPress={() => setReorder((r) => !r)} testID="home-reorder-toggle" />}
      />
      {reorder ? (
        <View style={{ gap: 6 }} testID="home-reorder">
          {view.tileOrderLabels.map((k, i) => (
            <Card key={k.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText style={{ flex: 1 }}>{k.label}</AppText>
              <Btn
                label="▲"
                tone="secondary"
                compact
                disabled={i === 0 || write.busy}
                accessibilityLabel={'הזזת ' + k.label + ' מוקדם יותר'}
                onPress={() => void write.run(() => finance.setTileOrder(moveTileKey(view.tileOrder, k.key, -1)))}
                testID={`reorder-up-${k.key}`}
              />
              <Btn
                label="▼"
                tone="secondary"
                compact
                disabled={i === view.tileOrderLabels.length - 1 || write.busy}
                accessibilityLabel={'הזזת ' + k.label + ' מאוחר יותר'}
                onPress={() => void write.run(() => finance.setTileOrder(moveTileKey(view.tileOrder, k.key, 1)))}
                testID={`reorder-down-${k.key}`}
              />
            </Card>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {view.tiles.map((tile) => (
            <Tile
              key={tile.key}
              tile={tile}
              onOpen={tile.kind === 'category' ? () => openCategory(tile.key) : undefined}
              onLoanView={(v) => void write.run(() => finance.setLoanBalanceView(v))}
            />
          ))}
        </View>
      )}

      <SectionTitle title="🔔 התראות" />
      {view.alerts.length === 0 ? (
        <EmptyState text="אין התראות כרגע." testID="home-alerts-empty" />
      ) : (
        view.alerts.map((a) => (
          <Card key={a.key} accent="warning" testID="home-alert">
            <Row>
              <View style={{ flex: 1 }}>
                <AppText bold>{a.title}</AppText>
                {a.detail ? (
                  <AppText variant="small" tone="muted">
                    {a.detail}
                  </AppText>
                ) : null}
              </View>
              {a.amountText ? (
                <AppText bold tone="warning" style={{ flexShrink: 0 }}>
                  {a.amountText}
                </AppText>
              ) : null}
            </Row>
          </Card>
        ))
      )}

      <SectionTitle title="מה צפוי לרדת" />
      <AppText variant="caption" tone="muted">
        חיובים שיירדו מהבנק ב-10 הימים הקרובים (ללא משיכות מזומן וללא מה שכבר מופיע בהתראות).
      </AppText>
      {view.upcoming.length === 0 ? (
        <EmptyState text="אין חיובים צפויים ב-10 הימים הקרובים." testID="home-upcoming-empty" />
      ) : (
        view.upcoming.map((c) => (
          <Card key={c.key} testID="home-upcoming">
            <Row>
              <View style={{ flex: 1 }}>
                <AppText bold>{c.title}</AppText>
                <AppText variant="small" tone="muted">
                  {c.whenText + ' · ' + c.dateText}
                </AppText>
              </View>
              <AppText bold tone="danger" style={{ flexShrink: 0 }}>
                {c.amountText}
              </AppText>
            </Row>
          </Card>
        ))
      )}

      <SectionTitle title="פעילות אחרונה" />
      {view.recent.length === 0 ? (
        <EmptyState text="אין עדיין פעילות להצגה." />
      ) : (
        view.recent.map((r) => <TxRow key={r.key} row={r} testID="home-recent" />)
      )}

      <SectionTitle
        title="🏧 משיכת מזומן"
        action={<Btn label="+ משיכה" tone="ghost" compact onPress={() => push({ pathname: '/item-form', params: { mode: 'create', kind: 'cashWithdrawal' } })} testID="home-add-withdrawal" />}
      />
      <AppText variant="caption" tone="muted">
        משיכה מפחיתה את היתרה הצפויה בבנק, אך אינה נספרת כהוצאה. מוצגות משיכות החודש.
      </AppText>
      {view.withdrawalsThisMonth.length === 0 ? (
        <EmptyState text="אין משיכות מזומן החודש." testID="home-withdrawals-empty" />
      ) : (
        view.withdrawalsThisMonth.map((w) => (
          <Card key={w.key} testID="home-withdrawal">
            <Row>
              <View style={{ flex: 1 }}>
                <AppText bold>{w.amountText}</AppText>
                <AppText variant="small" tone="muted">
                  {w.dateText + (w.notes ? ' · ' + w.notes : '')}
                </AppText>
              </View>
              <Btn label="עריכה" tone="secondary" compact onPress={() => editWithdrawal(w.id)} testID="home-withdrawal-edit" />
              <Btn label="מחיקה" tone="ghost" compact onPress={() => setDeleteId({ id: w.id })} testID="home-withdrawal-delete" />
            </Row>
          </Card>
        ))
      )}
      {write.failure ? <Banner tone="error" text={write.failure.message} onDismiss={() => write.setFailure(null)} /> : null}

      <ConfirmDialog
        visible={deleteId !== null}
        title="מחיקת משיכה"
        message="למחוק את המשיכה הזו לצמיתות? לא ניתן לשחזר לאחר מכן."
        confirmLabel="מחיקה"
        destructive
        busy={write.busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const target = deleteId;
          if (target === null) return;
          void write.run(() => finance.deleteItem(target.id)).then(() => setDeleteId(null));
        }}
        testID="home-withdrawal-delete-dialog"
      />
    </ScreenScroll>
  );
}

function SnapshotCard({ label, value, tone, caption, testID }: { label: string; value: string; tone: 'primary' | 'danger' | 'warning'; caption?: string; testID?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 104, alignItems: 'center' }} testID={testID}>
      <AppText variant="caption" tone="muted" center>
        {label}
      </AppText>
      <AppText variant="heading" tone={tone} center fit testID={testID ? `${testID}-value` : undefined}>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" tone="muted" center>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}

function Tile({ tile, onOpen, onLoanView }: { tile: HomeTile; onOpen?: () => void; onLoanView: (v: 'total' | 'principal') => void }) {
  const t = useTheme();
  const style = { width: '48%' as const, flexGrow: 1, alignItems: 'center' as const, minHeight: 96 };
  if (tile.kind === 'loanBalance') {
    return (
      <Card style={style} testID="tile-loan-balance">
        <AppText variant="small" tone="muted" center>
          {tile.label}
        </AppText>
        <AppText variant="heading" center fit>
          {tile.amountText}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['principal', 'total'] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: tile.view === v }}
              onPress={() => onLoanView(v)}
              testID={`tile-loan-view-${v}`}
              style={{
                minHeight: TOUCH,
                minWidth: TOUCH + 12,
                paddingHorizontal: 10,
                borderRadius: 10,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: tile.view === v ? t.c.primary : t.c.border,
                backgroundColor: tile.view === v ? t.c.primary : t.c.bg,
              }}
            >
              <AppText variant="caption" tone={tile.view === v ? 'onPrimary' : 'muted'} bold>
                {v === 'principal' ? 'קרן' : 'סה"כ'}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Card>
    );
  }
  if (tile.kind === 'variableRemaining') {
    return (
      <Card style={style} testID="tile-variable-remaining">
        <AppText variant="small" tone="muted" center>
          {tile.label}
        </AppText>
        <AppText variant="heading" center fit>
          {tile.amountText}
        </AppText>
      </Card>
    );
  }
  return (
    <Card style={style} onPress={onOpen} accessibilityLabel={tile.label + ' ' + tile.amountText} testID={`tile-${tile.key}`}>
      <AppText variant="small" tone="muted" center>
        {tile.label}
      </AppText>
      <AppText variant="heading" tone={tile.red ? 'danger' : 'default'} center fit testID={`tile-${tile.key}-amount`}>
        {tile.amountText}
      </AppText>
      {tile.breakdown.map((line) => (
        <AppText key={line} variant="caption" tone="muted" center>
          {line}
        </AppText>
      ))}
      {tile.updatedLine ? (
        <AppText variant="caption" tone="muted" center>
          {tile.updatedLine}
        </AppText>
      ) : null}
    </Card>
  );
}
