// Goals: active/archived lists, expandable cards, components, funding plan
// and the confirmed-transfer ledger. All figures come from buildGoalsView()
// (Stage 2 FIFO funding); writes go through FinanceController.

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { buildGoalsView, type GoalCardView } from '../../src/presentation/goalsView.ts';
import type { FinanceSnapshot } from '../../src/state/financeController.ts';
import { AppText, Badge, Banner, Btn, ButtonRow, Card, Choice, ConfirmDialog, Divider, EmptyState, Fab, ProgressBar, Row, ScreenScroll, SectionTitle, TOUCH } from '../../src/ui/kit.tsx';
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
  const view = useMemo(() => buildGoalsView(snapshot), [snapshot]);
  const push = useSafePush();
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const write = useWrite();

  if (!view.valid) {
    return (
      <ScreenScroll testID="screen-goals">
        <SectionTitle title="יעדים" />
        <Card accent="danger" testID="goals-corrupt">
          <AppText bold>⚠️ לא ניתן לטעון את נתוני היעדים</AppText>
          <AppText variant="small">הנתונים השמורים במכשיר זה פגומים או אינם תקינים. כדי למנוע אובדן מידע, הם לא שונו ולא נמחקו. ניתן:</AppText>
          <AppText variant="small">• לשחזר גיבוי תקין דרך הגדרות ← נתונים.</AppText>
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

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll testID="screen-goals" footer={!showArchived ? <Fab label="הוסף יעד" onPress={() => push('/goal-form')} testID="goals-fab" /> : null}>
        <SectionTitle title="יעדים" />
        <Choice
          label="תצוגה"
          options={[
            { value: 'active', label: 'פעילים (' + view.active.length + ')' },
            { value: 'archived', label: 'ארכיון (' + view.archived.length + ')' },
          ]}
          value={showArchived ? 'archived' : 'active'}
          onChange={(v) => {
            setShowArchived(v === 'archived');
            setExpanded(null);
          }}
          testID="goals-filter"
        />
        {list.length === 0 ? (
          showArchived ? (
            <EmptyState text="אין יעדים בארכיון." testID="goals-empty-archived" />
          ) : (
            <Card testID="goals-empty">
              <AppText center tone="muted">
                עדיין אין יעדי חיסכון פעילים. הוסף/י יעד ראשון כדי להתחיל לעקוב אחרי חיסכון והעברות חודשיות.
              </AppText>
              <Btn label="הוסף יעד ראשון" onPress={() => push('/goal-form')} testID="goals-add-first" />
            </Card>
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
        destructive={pending?.kind === 'removeComponent'}
        busy={write.busy}
        onCancel={() => setPending(null)}
        onConfirm={confirmPending}
        testID="goals-confirm"
      />
    </View>
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
  return (
    <Card testID={`goal-${goal.id}`}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={'יעד: ' + goal.title} onPress={onToggle} style={{ gap: 6, minHeight: TOUCH }} testID="goal-head">
        <Row>
          <AppText variant="heading" style={{ flex: 1 }}>
            {goal.title}
          </AppText>
          {goal.badge === 'completed' ? <Badge text="הושלם" tone="success" /> : goal.badge === 'overdue' ? <Badge text="באיחור" tone="danger" /> : null}
          <AppText tone="muted">{expanded ? '▴' : '▾'}</AppText>
        </Row>
        <Row wrap gap={14}>
          <AppText variant="small">{'יעד: ' + goal.targetText}</AppText>
          <AppText variant="small">{'נותר: ' + goal.remainingText}</AppText>
        </Row>
        <Row wrap gap={14}>
          <AppText variant="small">{'נחסך: ' + goal.savedText}</AppText>
          <AppText variant="small">{'תאריך יעד: ' + goal.dueText}</AppText>
        </Row>
        <ProgressBar value={goal.progress} />
      </Pressable>
      {expanded ? (
        <View style={{ gap: 8, marginTop: 6 }} testID="goal-body">
          <Divider />
          {goal.components.length === 0 ? (
            <AppText variant="small" tone="muted">
              אין רכיבים — היעד משתמש בסכום שהוזן ישירות.
            </AppText>
          ) : (
            goal.components.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.c.bg, borderRadius: 10, padding: 8 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText bold>{c.name}</AppText>
                  <Row wrap gap={6}>
                    <AppText variant="caption" tone="muted">
                      {c.dateText}
                    </AppText>
                    {c.inherited ? <Badge text="מתאריך היעד" tone="muted" /> : c.early ? <Badge text="מוקדם מתאריך היעד" tone="warning" /> : null}
                    {c.funding === 'funded' ? <Badge text="מומן" tone="success" /> : c.funding === 'overdue' ? <Badge text="באיחור" tone="danger" /> : null}
                  </Row>
                  {c.remainingText ? (
                    <AppText variant="caption" tone="muted">
                      {c.remainingText}
                    </AppText>
                  ) : null}
                </View>
                <AppText bold style={{ flexShrink: 0 }}>
                  {c.amountText}
                </AppText>
                <Btn label="✏️" tone="ghost" compact accessibilityLabel={'עריכת רכיב ' + c.name} onPress={() => onEditComponent(c.id)} testID={`component-edit-${c.id}`} />
                <Btn label="🗑️" tone="ghost" compact accessibilityLabel={'הסרת רכיב ' + c.name} onPress={() => onRemoveComponent(c.id, c.name)} testID={`component-remove-${c.id}`} />
              </View>
            ))
          )}
          {goal.componentsTotalText ? (
            <Row>
              <AppText variant="small" bold style={{ flex: 1 }}>
                סה״כ יעד (מרכיבים)
              </AppText>
              <AppText variant="small" bold>
                {goal.componentsTotalText}
              </AppText>
            </Row>
          ) : null}
          {goal.completedNote ? <AppText variant="small">{goal.completedNote}</AppText> : null}
          {goal.overdueNotes.map((n) => (
            <AppText key={n} variant="small" tone="danger">
              {n}
            </AppText>
          ))}
          {goal.nextTransferNote ? <AppText variant="small">{goal.nextTransferNote}</AppText> : null}
          {goal.noScheduleNote ? (
            <AppText variant="small" tone="muted">
              {goal.noScheduleNote}
            </AppText>
          ) : null}
          {goal.overdueAmountText ? (
            <Row>
              <AppText variant="small" tone="danger" style={{ flex: 1 }}>
                סכום באיחור
              </AppText>
              <AppText variant="small" tone="danger" bold>
                {goal.overdueAmountText}
              </AppText>
            </Row>
          ) : null}
          {goal.plan.length > 0 ? (
            <View style={{ gap: 2 }} testID="goal-plan">
              <AppText variant="small" bold>
                לוח העברות מתוכנן (ב-2 לכל חודש)
              </AppText>
              {goal.plan.map((p) => (
                <Row key={p.key}>
                  <AppText variant="caption" tone="muted" style={{ flex: 1 }}>
                    {p.dateText}
                  </AppText>
                  <AppText variant="caption">{p.amountText}</AppText>
                </Row>
              ))}
            </View>
          ) : null}
          {goal.confirmedTransfers.length > 0 ? (
            <View style={{ gap: 2 }} testID="goal-confirmed">
              <AppText variant="small" bold>
                {'העברות שאושרו' + (goal.confirmedTotalText ? ' (' + goal.confirmedTotalText + ')' : '')}
              </AppText>
              {goal.confirmedTransfers.map((c) => (
                <Row key={c.key}>
                  <AppText variant="caption" tone="muted" style={{ flex: 1 }}>
                    {c.dateText}
                  </AppText>
                  <AppText variant="caption">{c.amountText}</AppText>
                </Row>
              ))}
            </View>
          ) : null}
          <ButtonRow>
            <Btn label="✏️ עריכה" tone="secondary" compact onPress={onEdit} testID="goal-edit" />
            <Btn label="+ הוסף רכיב" tone="secondary" compact onPress={onAddComponent} testID="goal-add-component" />
            <Btn label={goal.isArchived ? '↩️ שחזר מארכיון' : '🗄️ העבר לארכיון'} tone="ghost" compact onPress={onArchive} testID="goal-archive" />
          </ButtonRow>
        </View>
      ) : null}
    </Card>
  );
}
