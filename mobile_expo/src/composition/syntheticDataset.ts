// DEVELOPMENT ONLY — a synthetic dataset for physical-device QA, loaded from
// the diagnostics screen (a __DEV__-only route) through the normal validated,
// atomic restore path. Dates are relative to `now` so every Home/Forecast
// section has something to show: an income and a payment due tomorrow (in-app
// alerts), charges inside the 10-day window, a payroll loan and credit-card
// items (no bank events), cash withdrawals, a completed loan (archived by the
// next run's automatic sweep), a custom category with a default day, and
// goals with components, a due reminder and an overdue goal.

import { BACKUP_SCHEMA_VERSION, type BackupEnvelope } from '../domain/backup.ts';
import { DEFAULT_CATEGORY_CONFIG_JSON } from '../domain/categoryConfig.ts';
import { cashflowDateKey, nowTimestampStr } from '../domain/dates.ts';
import { FF_KEYS } from '../domain/keys.ts';

export function buildSyntheticBackup(now: Date): BackupEnvelope {
  const at = (offsetDays: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const d = (offsetDays: number) => cashflowDateKey(at(offsetDays));
  const dayOf = (offsetDays: number) => String(at(offsetDays).getDate());
  const monthsAgo = (m: number) => cashflowDateKey(new Date(now.getFullYear(), now.getMonth() - m, 1));
  const base = Math.floor(now.getTime() / 1000) * 1000;
  let n = 0;
  const id = () => base + n++;
  const fixed = { isArchived: false, notes: '', cardLast4: '', bimonthly: false, bimonthlyStartMonth: null, period: 'חודשי' };

  const items = [
    { id: id(), type: 'income', isArchived: false, displayCategory: 'income', title: 'משכורת', amount: 14500, day: dayOf(1) },
    { id: id(), type: 'fixed', displayCategory: 'fixed', title: 'שכירות', amount: 4200, day: dayOf(3), where: 'bank', ...fixed },
    { id: id(), type: 'fixed', displayCategory: 'fixed', title: 'ביטוח רכב', amount: 2400, day: dayOf(1), where: 'bank', ...fixed, period: 'שנתי' },
    { id: id(), type: 'fixed', displayCategory: 'fixed', title: 'Netflix — מנוי', amount: 49.9, day: '12', where: 'credit', ...fixed, cardLast4: '1234' },
    {
      id: id(),
      type: 'fixed',
      displayCategory: 'fixed',
      title: 'ארנונה',
      amount: 780,
      day: dayOf(6),
      where: 'bank',
      ...fixed,
      bimonthly: true,
      bimonthlyStartMonth: at(6).getMonth() + 1,
    },
    { id: id(), type: 'loan', isArchived: false, displayCategory: 'loan', title: 'הלוואת רכב', originalAmount: 36000, amount: 1100, where: 'חשבון בנק', interest: '4.5', day: dayOf(5), total: '36', start: monthsAgo(12) },
    { id: id(), type: 'loan', isArchived: false, displayCategory: 'loan', title: 'הלוואה דרך השכר', originalAmount: 12000, amount: 520, where: 'דרך תלוש השכר', interest: '3', day: '10', total: '24', start: monthsAgo(6) },
    { id: id(), type: 'loan', isArchived: false, displayCategory: 'loan', title: 'הלוואה שהסתיימה', originalAmount: 2000, amount: 1000, where: 'חשבון בנק', interest: '', day: '1', total: '2', start: monthsAgo(24) },
    { id: id(), type: 'variable', isArchived: false, displayCategory: 'variable', title: 'מקרר — 10 תשלומים', originalAmount: 5000, amount: 500, day: dayOf(7), total: '10', start: monthsAgo(3), where: 'bank', cardLast4: '' },
    { id: id(), type: 'variable', isArchived: false, displayCategory: 'variable', title: 'טלוויזיה', originalAmount: 3600, amount: 300, day: '15', total: '12', start: monthsAgo(2), where: 'credit', cardLast4: '5678' },
    { id: id(), type: 'dated', isArchived: false, displayCategory: 'dated', title: 'חיוב ויזה', start: d(8), amount: 2150, where: 'bank', cardLast4: '4580', notes: 'חיוב חודשי' },
    { id: id(), type: 'fixed', displayCategory: 'custom_qa_car', title: 'דלק', amount: 600, day: '', where: 'bank', ...fixed },
    { id: id(), type: 'cashWithdrawal', isArchived: false, title: 'משיכת מזומן', amount: 300, start: d(0), notes: 'כספומט' },
    { id: id(), type: 'cashWithdrawal', isArchived: false, title: 'משיכת מזומן', amount: 500, start: d(4), notes: 'לחופשה' },
  ];

  const categories = { ...(JSON.parse(DEFAULT_CATEGORY_CONFIG_JSON) as Record<string, unknown>), custom_qa_car: { label: '🚗 רכב', baseType: 'fixed', defaultDayOfMonth: 15 } };

  const settings = {
    theme: 'system',
    primaryColor: 'green',
    fontSize: 'medium',
    pinHash: null,
    pinEnabled: false,
    autoLockMinutes: null,
    currentBalance: null,
    anchorBalance: null,
    anchorDate: null,
    projectedBalanceOpeningAmount: 9800,
    projectedBalanceOpeningDate: d(-10),
    projectedBalanceOpeningIncludedWithdrawalIds: [],
    notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: true },
    experimentalFlags: {},
    creditCardSettlementUpdatedAt: d(-2),
  };

  const stamp = new Date(now.getTime() - 86_400_000).toISOString();
  const goals = [
    { id: 'goal_qa_1', title: 'ביטוח רכב שנתי', dueDate: d(150), targetAmount: 3000, savedAmount: 500, components: [], isArchived: false, createdAt: stamp, updatedAt: stamp, confirmedTransfers: [] },
    {
      id: 'goal_qa_2',
      title: 'חופשה משפחתית',
      dueDate: d(180),
      targetAmount: 6500,
      savedAmount: 1000,
      components: [
        { id: 'comp_qa_1', name: 'טיסות', amount: 4000, dueDate: d(90) },
        { id: 'comp_qa_2', name: 'מלון', amount: 2500, dueDate: null },
      ],
      isArchived: false,
      createdAt: stamp,
      updatedAt: stamp,
      confirmedTransfers: [],
    },
    { id: 'goal_qa_3', title: 'מתנת יום הולדת', dueDate: d(-20), targetAmount: 800, savedAmount: 200, components: [], isArchived: false, createdAt: stamp, updatedAt: stamp, confirmedTransfers: [] },
  ];

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowTimestampStr(now),
    data: {
      [FF_KEYS.data]: JSON.stringify(items),
      [FF_KEYS.categoryConfig]: JSON.stringify(categories),
      [FF_KEYS.settings]: JSON.stringify(settings),
      [FF_KEYS.goals]: JSON.stringify(goals),
      [FF_KEYS.activityLog]: JSON.stringify([{ ts: nowTimestampStr(now), action: 'backup', detail: 'נתוני בדיקה סינתטיים' }]),
      [FF_KEYS.loanBalanceView]: JSON.stringify('total'),
    },
  };
}
