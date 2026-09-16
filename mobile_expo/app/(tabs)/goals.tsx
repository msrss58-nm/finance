// Goals — index.html #screen-goals and app.js buildGoalCardHtml(): the
// פעילים / ארכיון filter toggle, then one .goal-card per goal — a head (name +
// badge, יעד / נותר / נחסך / תאריך יעד, 7px progress track, chevron) and, when
// expanded, the components, the schedule notes and the actions row, exactly as
// the Web card. Figures come from buildGoalsView() (Stage 2 FIFO funding);
// writes go through FinanceController.
//
// Native adaptations (reported): edit / add component open their own screens
// (Web: inline forms inside the card); confirmations are dialogs (Web: inline
// confirm boxes).

import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { buildGoalsView, type GoalCardView } from '../../src/presentation/goalsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Banner, Btn, Card, ConfirmDialog, Fab, FilterToggle, ScreenScroll, SectionTitle, TOUCH, webShadow } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useSafePush, useWrite, WithFinance } from '../../src/ui/useFinance.tsx';

export default function GoalsScreen() {
  return <WithFinance>{(s) => <GoalsContent snapshot={s} />}</WithFinance>;
}

type Pending =
  | { readonly kind: 'archive'; readonly goalId: string; readonly archived: boolean }
  | { readonly kind: 'removeComponent'; readonly goalId: string; readonly componentId: string; readonly name: string }
  | { readonly kind: 'resetCorrupt' }
  | null;

function GoalsContent({ snapshot }: { snapshot: FinanceSnapshot }) {
  const { finance } = useServices();
  const t = useTheme();
  const view = useMemo(() => buildGoalsView(snapshot), [snapshot]);
  const push = useSafePush();
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const write = useWrite();

  if (!view.valid) {
    return (
      <ScreenScroll testID="screen-goals">
        <SectionTitle title="יעדים" first />
        <Card accent="danger" testID="goals-corrupt">
          <AppText bold>⚠️ לא ניתן לטעון את נתוני היעדים</AppText>
          <AppText variant="small">הנתונים השמורים במכשיר זה פגומים או אינם תקינים. כדי למנוע אובדן מידע, הם לא שונו ולא נמחקו. ניתן:</AppText>
          <AppText variant="small">• לשחזר גיבוי תקין (Version 2) דרך הגדרות ⟵ נתונים.</AppText>
          <AppText variant="small">• לאפס אך ורק את נתוני היעדים הפגומים (פעולה בלתי הפיכה).</AppText>
          <Btn label="אפס נתוני יעדים פגומים" tone="danger" onPress={() => setPending({ kind: 'resetCorrupt' })} testID="goals-reset-corrupt" />
        </Card>
        {write.failure ? <Banner tone="error" text={write.failure.message} /> : null}
        <ConfirmDialog
          visible={pending?.kind === 'resetCorrupt'}
          title="איפוס נתוני יעדים"
          message="לאפס את נתוני היעדים הפגומים? רק נתוני היעדים יימחקו — שאר הנתונים באפליקציה לא ישתנו. לא ניתן לבטל לאחר הביצוע."
          confirmLabel="אישור איפוס נתוני יעדים"
          destructive
          busy={write.busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void write.run(() => finance.resetCorruptGoals()).then(() => setPending(null))}
          testID="goals-reset-dialog"
        />
      </ScreenScroll>
    );
  }

  const list = showArchived ? view.archived : view.active;
  const confirmPending = () => {
    const p = pending;
    if (p === null) return;
    const action =
      p.kind === 'archive'
        ? () => finance.toggleGoalArchived(p.goalId)
        : p.kind === 'removeComponent'
          ? () => finance.removeComponent(p.goalId, p.componentId)
          : () => finance.resetCorruptGoals();
    void write.run(action).then((o) => {
      setPending(null);
      if (o?.ok && p.kind === 'archive') setExpanded(null);
    });
  };
  const note = { fontSize: t.fs(12.5), color: t.c.text, opacity: 0.82, lineHeight: t.fs(19.4), textAlign: 'center' as const, paddingVertical: 12, paddingHorizontal: 4 };

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll testID="screen-goals" footer={!showArchived ? <Fab label="הוסף יעד" onPress={() => push('/goal-form')} testID="goals-fab" /> : null}>
        <SectionTitle title="יעדים" first />
        <FilterToggle
          options={[
            { value: 'active', label: 'פעילים' },
            { value: 'archived', label: 'ארכיון' },
          ]}
          value={showArchived ? 'archived' : 'active'}
          onChange={(v) => {
            setShowArchived(v === 'archived');
            setExpanded(null);
          }}
          accessibilityLabel="סינון יעדים"
          testID="goals-filter"
        />
        {list.length === 0 ? (
          showArchived ? (
            <Text style={note} testID="goals-empty-archived">
              אין יעדים בארכיון.
            </Text>
          ) : (
            <View testID="goals-empty">
              <Text style={note}>{'עדיין אין יעדי חיסכון פעילים.\nהוסף/י יעד ראשון כדי להתחיל לעקוב אחרי חיסכון והעברות חודשיות.'}</Text>
              <View style={{ alignItems: 'center' }}>
                <Btn label="הוסף יעד ראשון" onPress={() => push('/goal-form')} testID="goals-add-first" />
              </View>
            </View>
          )
        ) : (
          list.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              expanded={expanded === g.id}
              onToggle={() => setExpanded((e) => (e === g.id ? null : g.id))}
              onEdit={() => push({ pathname: '/goal-form', params: { goalId: g.id } })}
              onAddComponent={() => push({ pathname: '/component-form', params: { goalId: g.id } })}
              onEditComponent={(cid) => push({ pathname: '/component-form', params: { goalId: g.id, componentId: cid } })}
              onRemoveComponent={(cid, name) => setPending({ kind: 'removeComponent', goalId: g.id, componentId: cid, name })}
              onArchive={() => setPending({ kind: 'archive', goalId: g.id, archived: g.isArchived })}
            />
          ))
        )}
        {write.failure ? <Banner tone="error" text={write.failure.message} onDismiss={() => write.setFailure(null)} /> : null}
      </ScreenScroll>
      <ConfirmDialog
        visible={pending !== null && pending.kind !== 'resetCorrupt'}
        title={pending?.kind === 'removeComponent' ? 'הסרת רכיב' : pending?.kind === 'archive' && pending.archived ? 'שחזור מארכיון' : 'העברה לארכיון'}
        message={
          pending?.kind === 'removeComponent'
            ? 'להסיר את הרכיב "' + pending.name + '"?'
            : pending?.kind === 'archive' && pending.archived
              ? 'לשחזר את היעד מהארכיון?'
              : 'להעביר את היעד לארכיון?'
        }
        confirmLabel={pending?.kind === 'removeComponent' ? 'אישור הסרה' : pending?.kind === 'archive' && pending.archived ? 'אישור שחזור' : 'אישור העברה לארכיון'}
        destructive
        busy={write.busy}
        onCancel={() => setPending(null)}
        onConfirm={confirmPending}
        testID="goals-confirm"
      />
    </View>
  );
}

/** .goal-badge */
function GoalBadge({ text, tone }: { text: string; tone: 'completed' | 'overdue' | 'inherited' | 'early' }) {
  const t = useTheme();
  const bg = tone === 'completed' ? t.c.insightCardBg : tone === 'overdue' ? t.c.dangerBg : tone === 'early' ? t.c.warningBg : t.c.bg;
  const fg = tone === 'overdue' ? t.c.danger : tone === 'early' ? t.c.warning : tone === 'inherited' ? t.c.textMuted : t.c.text;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginStart: 6, borderWidth: tone === 'inherited' ? 1 : 0, borderColor: t.c.border }}>
      <Text style={{ fontSize: t.fs(10), fontWeight: '600', color: fg }}>{text}</Text>
    </View>
  );
}

/** .goal-meta-row: two "label: <b>value</b>" pairs, spread apart. */
function MetaRow({ items }: { items: readonly (readonly [string, string])[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      {items.map(([label, value]) => (
        <Text key={label} style={{ fontSize: t.fs(11.5), color: t.c.textMuted }}>
          {label + ': '}
          <Text style={{ color: t.c.text, fontWeight: '700' }}>{value}</Text>
        </Text>
      ))}
    </View>
  );
}

/** .cat-edit-btn / .cat-delete-btn — small bordered actions. */
function SmallAction({ label, danger = false, dashed = false, onPress, accessibilityLabel, testID }: { label: string; danger?: boolean; dashed?: boolean; onPress: () => void; accessibilityLabel?: string; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 34,
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: danger ? t.c.danger : t.c.border,
        backgroundColor: t.c.bg,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: t.fs(12), color: danger ? t.c.danger : t.c.text }}>{label}</Text>
    </Pressable>
  );
}

function GoalCard({
  goal,
  expanded,
  onToggle,
  onEdit,
  onAddComponent,
  onEditComponent,
  onRemoveComponent,
  onArchive,
}: {
  goal: GoalCardView;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddComponent: () => void;
  onEditComponent: (id: string) => void;
  onRemoveComponent: (id: string, name: string) => void;
  onArchive: () => void;
}) {
  const t = useTheme();
  const scheduleNote = (text: string, tone: 'normal' | 'danger' = 'normal', key?: string) => (
    <Text key={key} style={{ fontSize: t.fs(12), lineHeight: t.fs(18.6), marginTop: 8, color: tone === 'danger' ? t.c.danger : t.c.textMuted, fontWeight: tone === 'danger' ? '600' : '400', textAlign: 'left' }}>
      {text}
    </Text>
  );
  return (
    <View testID={`goal-${goal.id}`} style={[{ backgroundColor: t.c.surface, borderRadius: 12, overflow: 'hidden' }, webShadow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={'יעד: ' + goal.title}
        onPress={onToggle}
        testID="goal-head"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH, paddingVertical: 13, paddingHorizontal: 14 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <Text style={{ fontSize: t.fs(14.5), fontWeight: '700', color: t.c.text }}>{goal.title}</Text>
            {goal.badge === 'completed' ? <GoalBadge text="הושלם" tone="completed" /> : goal.badge === 'overdue' ? <GoalBadge text="באיחור" tone="overdue" /> : null}
          </View>
          <MetaRow items={[['יעד', goal.targetText], ['נותר', goal.remainingText]]} />
          <MetaRow items={[['נחסך', goal.savedText], ['תאריך יעד', goal.dueText]]} />
          <View style={{ height: 7, borderRadius: 4, backgroundColor: t.c.border, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: goal.progress }}>
            <View style={{ width: `${Math.max(0, Math.min(100, goal.progress))}%`, height: 7, borderRadius: 4, backgroundColor: t.c.primary }} />
          </View>
        </View>
        <Text style={{ fontSize: 13, color: t.c.textMuted, transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>▾</Text>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.c.border, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 }} testID="goal-body">
          {goal.components.map((c, i) => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingVertical: 7,
                borderBottomWidth: i < goal.components.length - 1 ? 1 : 0,
                borderStyle: 'dashed',
                borderBottomColor: t.c.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: t.fs(13), fontWeight: '600', color: t.c.text, textAlign: 'left' }}>{c.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                  <Text style={{ fontSize: t.fs(11), color: t.c.textMuted }}>{c.dateText}</Text>
                  {c.inherited ? <GoalBadge text="מתאריך היעד" tone="inherited" /> : c.early ? <GoalBadge text="מוקדם מתאריך היעד" tone="early" /> : null}
                  {c.funding === 'funded' ? <GoalBadge text="מומן" tone="completed" /> : c.funding === 'overdue' ? <GoalBadge text="באיחור" tone="overdue" /> : null}
                </View>
                {c.remainingText ? <Text style={{ fontSize: t.fs(11), color: t.c.textMuted, marginTop: 2, textAlign: 'left' }}>{c.remainingText}</Text> : null}
              </View>
              <Text style={{ fontSize: t.fs(13), fontWeight: '600', color: t.c.text, writingDirection: 'ltr', flexShrink: 0 }}>{c.amountText}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <SmallAction label="✏️" accessibilityLabel={'עריכת רכיב ' + c.name} onPress={() => onEditComponent(c.id)} testID={`component-edit-${c.id}`} />
                <SmallAction label="🗑️" danger accessibilityLabel={'הסרת רכיב ' + c.name} onPress={() => onRemoveComponent(c.id, c.name)} testID={`component-remove-${c.id}`} />
              </View>
            </View>
          ))}
          {goal.components.length > 0 && goal.componentsTotalText ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: t.c.border }}>
              <Text style={{ fontSize: t.fs(13.5), fontWeight: '700', color: t.c.text }}>סה״כ יעד (מרכיבים)</Text>
              <Text style={{ fontSize: t.fs(13.5), fontWeight: '700', color: t.c.text, writingDirection: 'ltr' }}>{goal.componentsTotalText}</Text>
            </View>
          ) : null}
          {goal.components.length === 0 ? (
            <Text style={{ fontSize: t.fs(12.5), color: t.c.text, opacity: 0.82, marginTop: 6, lineHeight: t.fs(19.4), textAlign: 'left' }}>אין רכיבים — היעד משתמש בסכום שהוזן ישירות.</Text>
          ) : null}
          {goal.completedNote ? scheduleNote(goal.completedNote) : null}
          {goal.overdueNotes.map((n) => scheduleNote(n, 'danger', n))}
          {goal.nextTransferNote ? scheduleNote(goal.nextTransferNote) : null}
          {goal.noScheduleNote ? (
            <Text style={{ fontSize: t.fs(12.5), color: t.c.text, opacity: 0.82, marginTop: 6, lineHeight: t.fs(19.4), textAlign: 'left' }}>{goal.noScheduleNote}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <SmallAction label="✏️ עריכה" onPress={onEdit} testID="goal-edit" />
            <SmallAction label="+ הוסף רכיב" dashed onPress={onAddComponent} testID="goal-add-component" />
            <SmallAction label={goal.isArchived ? '↩️ שחזר מארכיון' : '🗄️ העבר לארכיון'} danger onPress={onArchive} testID="goal-archive" />
          </View>
        </View>
      ) : null}
    </View>
  );
}
