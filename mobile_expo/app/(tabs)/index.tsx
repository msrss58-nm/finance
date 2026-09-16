// Home — the approved Web Cockpit (index.html #screen-home, styles.css), in the
// Web's order and visual language: gradient balance hero with its status pill,
// the 2-column income / expenses snapshot, 3-column category tiles, in-app
// alerts, "מה צפוי לרדת", recent activity (4 rows) and the cash-withdrawal
// section (saved rows + inline quick-add rows). Every figure comes from
// buildHomeView() (Stage 2 domain); "amount until next income" is not shown.
//
// Native adaptations (reported): the hero opens the opening-balance screen
// (Web: an inline form inside the card); a long press on a category tile
// opens the reorder list (Web: long-press drag); ✏️ on a saved withdrawal opens
// the edit screen (Web: inline edit); validation errors show as a banner
// (Web: alert()).

import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { todayStr } from '../../src/domain/dates.ts';
import { createFormDefaults } from '../../src/domain/itemWrites.ts';
import { moveTileKey } from '../../src/domain/tileOrder.ts';
import { buildHomeView, HOME_TEXT, type HomeTile } from '../../src/presentation/homeView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Banner, Btn, Card, CompactDateInput, ConfirmDialog, ScreenScroll, SectionTitle, TOUCH, useBackCloses, webShadow } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { TxRow, WEB_ICON_BG } from '../../src/ui/TxRow.tsx';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';

export default function HomeScreen() {
  return <WithFinance>{(s) => <HomeContent snapshot={s} />}</WithFinance>;
}

type AtmDraft = { readonly localId: number; readonly amount: string; readonly date: string; readonly notes: string };

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

  // app.js homeAtmRows: independent draft rows, always at least one.
  const nextId = useRef(2);
  const freshRow = (): AtmDraft => ({ localId: nextId.current++, amount: '', date: todayStr(snapshot.now), notes: '' });
  const [drafts, setDrafts] = useState<AtmDraft[]>(() => [{ localId: 1, amount: '', date: todayStr(snapshot.now), notes: '' }]);
  const patchDraft = (localId: number, patch: Partial<AtmDraft>) => setDrafts((d) => d.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  const dropDraft = (localId: number) =>
    setDrafts((d) => {
      const rest = d.filter((r) => r.localId !== localId);
      return rest.length > 0 ? rest : [freshRow()];
    });
  const saveDraft = (row: AtmDraft) => {
    const values = { ...createFormDefaults('cashWithdrawal', null, snapshot.data.categoryConfig, snapshot.now), amount: row.amount, start: row.date, notes: row.notes };
    void write.run(() => finance.createItem('cashWithdrawal', null, values)).then((o) => {
      if (o?.ok) dropDraft(row.localId);
    });
  };

  const openCategory = (key: string) => push({ pathname: '/category/[key]', params: { key } });
  const editWithdrawal = (id: unknown) => push({ pathname: '/item-form', params: { mode: 'edit', id: JSON.stringify(id) } });

  const tileRows: HomeTile[][] = [];
  for (let i = 0; i < view.tiles.length; i += 3) tileRows.push(view.tiles.slice(i, i + 3));
  const unconfigured = view.hero.state === 'unconfigured';

  return (
    <ScreenScroll testID="screen-home">
      {view.corruptBanner ? <Banner tone="warning" text={view.corruptBanner} testID="home-corrupt" /> : null}

      {/* .hero-gauge */}
      <Pressable
        testID="home-hero"
        accessibilityRole="button"
        accessibilityLabel={HOME_TEXT.heroLabel + ': ' + view.hero.amountText + '. הקשה פותחת את יתרת ההתחלה.'}
        onPress={() => push('/opening-balance')}
        style={({ pressed }) => [{ borderRadius: 14, opacity: pressed ? 0.92 : 1 }, webShadow]}
      >
        <LinearGradient
          colors={[t.c.primary, t.c.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 14, paddingVertical: 26, paddingHorizontal: 20, alignItems: 'center' }}
        >
          <Text style={{ fontSize: t.fs(13), color: '#ffffff', opacity: 0.85, textAlign: 'center' }}>{HOME_TEXT.heroLabel}</Text>
          <Text
            testID="home-hero-amount"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={{ fontSize: t.fs(40), fontWeight: '700', color: '#ffffff', marginVertical: 4, textAlign: 'center', writingDirection: 'ltr' }}
          >
            {view.hero.amountText}
          </Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, marginTop: 4 }}>
            <Text testID="home-hero-status" style={{ fontSize: t.fs(12), color: '#ffffff', textAlign: 'center' }}>
              {view.hero.status}
            </Text>
          </View>
          {unconfigured ? (
            <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
              <Btn label="הגדר יתרת התחלה" tone="dashed" onPress={() => push('/opening-balance')} testID="home-setup-opening" />
            </View>
          ) : null}
        </LinearGradient>
      </Pressable>

      {/* .snapshot-grid — income + expenses only (the Web's 2-column grid) */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <SnapshotCard label="הכנסות" value={view.incomeText} color={t.c.primaryText} testID="home-income" />
        <SnapshotCard label="סך הכול הוצאות" value={view.expensesText} color={t.c.danger} testID="home-expenses" />
      </View>

      {/* .category-tiles-grid — 3 columns */}
      {reorder ? (
        <View style={{ gap: 6, marginTop: 2 }} testID="home-reorder">
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
          <Btn label="סיום" onPress={closeReorder} testID="home-reorder-done" />
        </View>
      ) : (
        <View style={{ gap: 10, marginTop: 2 }} testID="home-tiles">
          {tileRows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
              {row.map((tile) => (
                <View key={tile.key} style={{ flex: 1, minWidth: 0 }}>
                  <Tile
                    tile={tile}
                    onOpen={tile.kind === 'category' ? () => openCategory(tile.key) : undefined}
                    onReorder={() => setReorder(true)}
                    onLoanView={(v) => void write.run(() => finance.setLoanBalanceView(v))}
                  />
                </View>
              ))}
              {Array.from({ length: 3 - row.length }, (_, k) => (
                <View key={'pad' + k} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>
      )}

      <SectionTitle title="🔔 התראות (בתוך האפליקציה)" />
      {view.alerts.map((a) => (
        <AttentionItem key={a.key} title={a.title} detail={a.detail} amount={a.amountText} amountColor={t.c.warning} testID="home-alert" />
      ))}

      <SectionTitle title="מה צפוי לרדת" />
      {view.upcoming.map((c) => (
        <AttentionItem key={c.key} title={c.title} detail={c.whenText + ' · ' + c.dateText} amount={c.amountText} amountColor={t.c.danger} testID="home-upcoming" />
      ))}

      <SectionTitle title="פעילות אחרונה" />
      {view.recent.map((r) => (
        <TxRow key={r.key} row={r} testID="home-recent" />
      ))}

      <SectionTitle title="🏧 משיכת מזומן" />
      {view.withdrawalsThisMonth.map((w) => (
        <View
          key={w.key}
          testID="home-withdrawal"
          style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }, webShadow]}
        >
          <Text style={{ fontSize: t.fs(14), fontWeight: '700', color: t.c.text, writingDirection: 'ltr' }}>{w.amountText}</Text>
          <Text style={{ fontSize: t.fs(12.5), color: t.c.textMuted, writingDirection: 'ltr' }}>{w.dateText}</Text>
          <Text style={{ flexGrow: 1, flexBasis: 100, minWidth: 60, fontSize: t.fs(13), color: t.c.textMuted, textAlign: 'left' }}>{w.notes}</Text>
          <CircleButton size={30} label="✏️" background={t.c.primaryBg} color={t.c.primaryText} accessibilityLabel="ערוך משיכה" onPress={() => editWithdrawal(w.id)} testID="home-withdrawal-edit" />
          <CircleButton size={30} label="🗑️" background={t.c.dangerBg} color={t.c.danger} accessibilityLabel="מחק משיכה" onPress={() => setDeleteId({ id: w.id })} testID="home-withdrawal-delete" />
        </View>
      ))}
      {drafts.map((row) => (
        <View
          key={row.localId}
          testID="home-atm-row"
          style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, backgroundColor: t.c.surface, borderRadius: 12, padding: 10 }, webShadow]}
        >
          <CircleButton
            size={34}
            label="+"
            background={t.c.primaryBg}
            color={t.c.primaryText}
            accessibilityLabel="הוסף שורת משיכה"
            onPress={() => setDrafts((d) => [...d, freshRow()])}
            testID="home-atm-add"
          />
          <TextInput
            testID="home-atm-amount"
            value={row.amount}
            onChangeText={(v) => patchDraft(row.localId, { amount: v })}
            keyboardType="numeric"
            placeholder="סכום"
            placeholderTextColor={t.c.textMuted}
            accessibilityLabel="סכום משיכה"
            style={[atmInput(t), { flexGrow: 1, flexBasis: 80, minWidth: 70 }]}
          />
          <CompactDateInput
            label="תאריך משיכה"
            value={row.date}
            onChange={(v) => patchDraft(row.localId, { date: v })}
            style={{ flexGrow: 1, flexBasis: 130, minWidth: 118 }}
            testID="home-atm-date"
          />
          <TextInput
            testID="home-atm-notes"
            value={row.notes}
            onChangeText={(v) => patchDraft(row.localId, { notes: v })}
            placeholder="הערה (אופציונלי)"
            placeholderTextColor={t.c.textMuted}
            accessibilityLabel="הערה"
            style={[atmInput(t), { flexGrow: 2, flexBasis: 140, minWidth: 100 }]}
          />
          <CircleButton
            size={34}
            label="💾"
            background={t.c.primary}
            color="#ffffff"
            accessibilityLabel="שמור משיכה"
            disabled={write.busy}
            onPress={() => saveDraft(row)}
            testID="home-atm-save"
          />
          <CircleButton size={34} label="✕" background={t.c.dangerBg} color={t.c.danger} accessibilityLabel="מחק שורה" onPress={() => dropDraft(row.localId)} testID="home-atm-delete" />
        </View>
      ))}
      {write.failure ? <Banner tone="error" text={write.failure.message} onDismiss={() => write.setFailure(null)} testID="home-error" /> : null}

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

function atmInput(t: ReturnType<typeof useTheme>) {
  return {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: t.c.border,
    borderRadius: 10,
    fontSize: t.fs(13.5),
    color: t.c.text,
    backgroundColor: t.c.bg,
    textAlign: 'right' as const,
  };
}

/** .snapshot-card */
function SnapshotCard({ label, value, color, testID }: { label: string; value: string; color: string; testID: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[{ flex: 1, backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' }, webShadow]}>
      <Text style={{ fontSize: t.fs(10.5), color: t.c.textMuted, letterSpacing: 0.3, textAlign: 'center' }}>{label}</Text>
      <Text
        testID={`${testID}-value`}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ fontSize: t.fs(15), fontWeight: '700', marginTop: 5, color, textAlign: 'center', writingDirection: 'ltr' }}
      >
        {value}
      </Text>
    </View>
  );
}

/** .attention-item — warning tint, 4px start stripe, title / detail / amount. */
function AttentionItem({ title, detail, amount, amountColor, testID }: { title: string; detail: string; amount: string | null; amountColor: string; testID: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        backgroundColor: t.c.warningBg,
        borderStartWidth: 4,
        borderStartColor: t.c.warning,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: t.fs(13.5), fontWeight: '600', color: t.c.text, textAlign: 'left' }}>{title}</Text>
        {detail ? <Text style={{ fontSize: t.fs(12), color: t.c.textMuted, marginTop: 2, textAlign: 'left' }}>{detail}</Text> : null}
      </View>
      {amount ? <Text style={{ fontSize: t.fs(14), fontWeight: '700', color: amountColor, flexShrink: 0, writingDirection: 'ltr' }}>{amount}</Text> : null}
    </View>
  );
}

/** .home-atm-add-btn / -save-btn / -delete-btn / -edit-btn — round, touch area ≥ 44dp. */
function CircleButton({
  size,
  label,
  background,
  color,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
}: {
  size: number;
  label: string;
  background: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const slop = Math.max(0, Math.ceil((TOUCH - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      testID={testID}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
        flexShrink: 0,
      })}
    >
      <Text style={{ fontSize: size >= 34 ? 15 : 13, color }}>{label}</Text>
    </Pressable>
  );
}

/** .category-tile / .stat-tile */
function Tile({ tile, onOpen, onReorder, onLoanView }: { tile: HomeTile; onOpen?: () => void; onReorder: () => void; onLoanView: (v: 'total' | 'principal') => void }) {
  const t = useTheme();
  const box = [{ backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' as const, minWidth: 0 }, webShadow];
  const icon = <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: WEB_ICON_BG, marginBottom: 6 }} />;
  const label = (text: string) => (
    <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: t.fs(10.5), color: t.c.textMuted, textAlign: 'center', alignSelf: 'stretch' }}>
      {text}
    </Text>
  );
  const value = (text: string, red: boolean, testID?: string) => (
    <Text
      testID={testID}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={{ fontSize: t.fs(13.5), fontWeight: '700', marginTop: 4, color: red ? t.c.danger : t.c.text, textAlign: 'center', writingDirection: 'ltr' }}
    >
      {text}
    </Text>
  );
  const small = (text: string) => (
    <Text key={text} style={{ fontSize: t.fs(9.5), color: t.c.textMuted, textAlign: 'center', lineHeight: t.fs(13.3) }}>
      {text}
    </Text>
  );

  if (tile.kind === 'loanBalance') {
    return (
      <View style={box} testID="tile-loan-balance">
        {icon}
        {label(tile.label)}
        {value(tile.amountText, false)}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          {(['principal', 'total'] as const).map((v) => {
            const active = tile.view === v;
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onLoanView(v)}
                hitSlop={12}
                testID={`tile-loan-view-${v}`}
                style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: active ? t.c.primary : t.c.border, backgroundColor: active ? t.c.primary : t.c.bg }}
              >
                <Text style={{ fontSize: t.fs(9.5), color: active ? '#ffffff' : t.c.textMuted }}>{v === 'principal' ? 'קרן' : 'סה"כ'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  if (tile.kind === 'variableRemaining') {
    return (
      <View style={box} testID="tile-variable-remaining">
        {icon}
        {label(tile.label)}
        {value(tile.amountText, false)}
      </View>
    );
  }
  // Built-in fixed / loan tiles carry no icon circle (app.js Version 1.4.8), a bank breakdown instead.
  const withIcon = tile.key !== 'fixed' && tile.key !== 'loan';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label + ' ' + tile.amountText}
      accessibilityHint="לחיצה ארוכה לסידור האריחים"
      onPress={onOpen}
      onLongPress={onReorder}
      delayLongPress={450}
      testID={`tile-${tile.key}`}
      style={({ pressed }) => [...box, pressed && { opacity: 0.85 }]}
    >
      {withIcon ? icon : null}
      {label(tile.label)}
      {value(tile.amountText, tile.red, `tile-${tile.key}-amount`)}
      {tile.updatedLine ? <View style={{ marginTop: 4 }}>{small(tile.updatedLine)}</View> : null}
      {tile.breakdown.length > 0 ? <View style={{ marginTop: 4 }}>{tile.breakdown.map(small)}</View> : null}
    </Pressable>
  );
}
