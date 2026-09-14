// Stage 3 item write flows: the Web's stored shape, messages and semantics.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { getProjectedBalanceToday } from '../../src/domain/forecast.ts';
import { DAY_INPUT_MESSAGE } from '../../src/domain/formInput.ts';
import { getHomePeriodOutflows } from '../../src/domain/homeTotals.ts';
import {
  archiveItem,
  createFormDefaults,
  createItem,
  deleteItem,
  editFormValues,
  editItem,
  ITEM_MESSAGES,
  LOAN_BANK_WHERE,
  unarchiveItem,
  withdrawalBeforeOpeningMessage,
  type ItemFormKind,
  type ItemFormValues,
} from '../../src/domain/itemWrites.ts';
import type { RawItem } from '../../src/domain/raw.ts';
import type { OpeningBalanceConfig } from '../../src/domain/settings.ts';

const cfg = resolveCategoryConfig(null);
const now = new Date(2026, 8, 14, 10, 0);
const NOW_MS = now.getTime();
const blank: ItemFormValues = {
  title: '',
  amount: '',
  day: '',
  where: '',
  cardLast4: '',
  notes: '',
  frequency: 'monthly',
  bimonthlyStartMonth: '1',
  originalAmount: '',
  total: '',
  start: '',
  interest: '',
};
const v = (patch: Partial<ItemFormValues>): ItemFormValues => ({ ...blank, ...patch });
const create = (
  kind: ItemFormKind,
  categoryKey: string | null,
  values: ItemFormValues,
  items: RawItem[] = [],
  opening: OpeningBalanceConfig | null = null,
  categoryConfig: Record<string, unknown> = cfg,
) => createItem({ items, kind, categoryKey, values, categoryConfig, opening, now });

test('income is stored exactly like the Web (number amount, string day, key order)', () => {
  const r = create('income', 'income', v({ title: ' משכורת ', amount: '12000', day: '10' }));
  assert.ok(r.ok);
  assert.equal(
    JSON.stringify(r.item),
    JSON.stringify({ id: NOW_MS, type: 'income', isArchived: false, displayCategory: 'income', title: 'משכורת', amount: 12000, day: '10' }),
  );
  assert.equal(r.settingsPatch, null);
});

test('fixed: credit digits, bimonthly and annual frequency stored like the Web', () => {
  const bi = create('fixed', 'fixed', v({ title: 'ארנונה', amount: '780.5', day: '6', where: 'credit', cardLast4: '1234', notes: 'n', frequency: 'bimonthly', bimonthlyStartMonth: '9' }));
  assert.ok(bi.ok);
  assert.equal(
    JSON.stringify(bi.item),
    JSON.stringify({
      id: NOW_MS,
      type: 'fixed',
      isArchived: false,
      displayCategory: 'fixed',
      title: 'ארנונה',
      amount: 780.5,
      day: '6',
      where: 'credit',
      notes: 'n',
      cardLast4: '1234',
      bimonthly: true,
      bimonthlyStartMonth: 9,
      period: 'חודשי',
    }),
  );
  const annual = create('fixed', 'fixed', v({ title: 'ביטוח', amount: '2400', day: '1', where: 'bank', frequency: 'annual' }));
  assert.ok(annual.ok);
  assert.deepEqual([annual.item.cardLast4, annual.item.bimonthly, annual.item.bimonthlyStartMonth, annual.item.period], ['', false, null, 'שנתי']);
});

test('validation uses the Web messages and never half-writes', () => {
  assert.deepEqual(create('fixed', 'fixed', v({ amount: '5', where: 'bank' })), { ok: false, field: 'title', message: ITEM_MESSAGES.fixedRequired });
  assert.deepEqual(create('fixed', 'fixed', v({ title: 'x', amount: '5', where: 'credit', cardLast4: '12a4' })), {
    ok: false,
    field: 'cardLast4',
    message: ITEM_MESSAGES.cardLast4,
  });
  assert.deepEqual(create('income', 'income', v({ title: 'x', amount: '1,5' })), { ok: false, field: 'amount', message: ITEM_MESSAGES.incomeRequired }, 'no silent 1');
  assert.deepEqual(create('income', 'income', v({ title: 'x', amount: '12abc' })), { ok: false, field: 'amount', message: ITEM_MESSAGES.incomeRequired });
  assert.deepEqual(create('income', 'income', v({ title: 'x', amount: '5', day: '32' })), { ok: false, field: 'day', message: DAY_INPUT_MESSAGE });
  assert.deepEqual(create('fixed', 'fixed', v({ title: 'x', amount: '5', where: 'bank', frequency: 'bimonthly', bimonthlyStartMonth: '13' })), {
    ok: false,
    field: 'bimonthlyStartMonth',
    message: ITEM_MESSAGES.bimonthlyStart,
  });
  assert.deepEqual(create('variable', 'variable', v({ title: 'x', amount: '5', where: '' })), { ok: false, field: 'where', message: ITEM_MESSAGES.paymentMethod });
  assert.deepEqual(create('fixed', 'income', v({ title: 'x', amount: '5', where: 'bank' })), { ok: false, field: null, message: ITEM_MESSAGES.unknownCategory });
  assert.deepEqual(create('fixed', 'nope', v({ title: 'x', amount: '5', where: 'bank' })), { ok: false, field: null, message: ITEM_MESSAGES.unknownCategory });
});

test('loan: payroll sentinel, string interest/total/start, numeric original amount', () => {
  const r = create('loan', 'loan', v({ title: 'רכב', originalAmount: '36000', amount: '1100', where: 'דרך תלוש השכר', interest: '4.5', day: '5', total: '36', start: '2025-09-01' }));
  assert.ok(r.ok);
  assert.equal(
    JSON.stringify(r.item),
    JSON.stringify({
      id: NOW_MS,
      type: 'loan',
      isArchived: false,
      displayCategory: 'loan',
      title: 'רכב',
      originalAmount: 36000,
      amount: 1100,
      where: 'דרך תלוש השכר',
      interest: '4.5',
      day: '5',
      total: '36',
      start: '2025-09-01',
    }),
  );
  const noOriginal = create('loan', 'loan', v({ title: 'x', amount: '10', where: LOAN_BANK_WHERE }));
  assert.ok(noOriginal.ok);
  assert.equal(noOriginal.item.originalAmount, 0, 'parseFloat(..) || 0, as on the Web');
});

test('variable: bank/credit are explicit; stored key order matches the Web', () => {
  const r = create('variable', 'variable', v({ title: 'מקרר', originalAmount: '5000', amount: '500', day: '7', total: '10', start: '2026-06-01', where: 'bank' }));
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.item), ['id', 'type', 'isArchived', 'displayCategory', 'title', 'originalAmount', 'amount', 'day', 'total', 'start', 'where', 'cardLast4']);
  assert.equal(r.item.cardLast4, '');
});

test('built-in credit-card settlement: always bank, 4 digits required, "עודכן" date in the same commit', () => {
  const missing = create('dated', 'dated', v({ title: 'ויזה', amount: '2150', start: '2026-09-25' }));
  assert.deepEqual(missing, { ok: false, field: 'cardLast4', message: ITEM_MESSAGES.settlementCardLast4 });
  const r = create('dated', 'dated', v({ title: 'ויזה', amount: '2150', start: '2026-09-25', where: 'credit', cardLast4: '4580', notes: 'x' }));
  assert.ok(r.ok);
  assert.equal(r.item.where, 'bank', 'the settlement is a bank outflow whatever the form says');
  assert.deepEqual(r.settingsPatch, { creditCardSettlementUpdatedAt: '2026-09-14' });
  const custom = create(
    'dated',
    'custom_card',
    v({ title: 'חד פעמי', amount: '99', start: '2026-09-20', where: 'credit', cardLast4: '1111' }),
    [],
    null,
    { ...cfg, custom_card: { label: '💳 כרטיס', baseType: 'dated' } },
  );
  assert.ok(custom.ok);
  assert.equal(custom.settingsPatch, null, 'only the built-in settlement bumps the date');
  assert.equal(custom.item.where, 'credit');
});

test('cash withdrawal: positive amount, real date, never before the opening balance, no category', () => {
  const opening: OpeningBalanceConfig = { amount: 1000, dateStr: '2026-09-10', includedWithdrawalIds: [] };
  assert.deepEqual(create('cashWithdrawal', null, v({ amount: '0', start: '2026-09-12' })), { ok: false, field: 'amount', message: ITEM_MESSAGES.withdrawalAmount });
  assert.deepEqual(create('cashWithdrawal', null, v({ amount: '10', start: '2026-02-30' })), { ok: false, field: 'start', message: ITEM_MESSAGES.withdrawalDate });
  assert.deepEqual(create('cashWithdrawal', null, v({ amount: '10', start: '2026-09-09' }), [], opening), {
    ok: false,
    field: 'start',
    message: withdrawalBeforeOpeningMessage('2026-09-10'),
  });
  const r = create('cashWithdrawal', null, v({ amount: '300', start: '2026-09-10', notes: '  כספומט  ' }), [], opening);
  assert.ok(r.ok);
  assert.equal(
    JSON.stringify(r.item),
    JSON.stringify({ id: NOW_MS, type: 'cashWithdrawal', isArchived: false, title: 'משיכת מזומן', amount: 300, start: '2026-09-10', notes: 'כספומט' }),
  );
});

test('a cash withdrawal reduces the balance but never enters expenses (correction A)', () => {
  const opening: OpeningBalanceConfig = { amount: 1000, dateStr: '2026-09-10', includedWithdrawalIds: [] };
  const r = create('cashWithdrawal', null, v({ amount: '300', start: '2026-09-12' }), [], opening);
  assert.ok(r.ok);
  const out = getHomePeriodOutflows(r.items, now, cfg);
  assert.deepEqual(out, { expenses: 0, withdrawals: 300, totalOutflow: 300 });
  const today = getProjectedBalanceToday(r.items, now, opening, cfg);
  assert.deepEqual(today, { configured: true, state: 'available', projectedBalance: 700, isOpeningDay: false });
});

test('new ids never collide with any existing id', () => {
  const r = create('income', 'income', v({ title: 'x', amount: '1' }), [
    { id: NOW_MS, type: 'income' },
    { id: NOW_MS + 1, type: 'fixed' },
  ]);
  assert.ok(r.ok);
  assert.equal(r.item.id, NOW_MS + 2);
});

test('edit keeps unknown fields and key order; the stored object is never mutated', () => {
  const stored = { id: 7, type: 'fixed', title: 'old', amount: 10, customFields: { a: 1 }, where: 'bank', futureX: [null], day: '3', displayCategory: 'fixed' };
  const before = JSON.stringify(stored);
  const values = { ...editFormValues(stored, cfg), title: 'new', amount: '20' };
  const r = editItem({ items: [stored], id: 7, values, categoryConfig: cfg, opening: null, now });
  assert.ok(r.ok);
  assert.equal(
    JSON.stringify(r.item),
    '{"id":7,"type":"fixed","title":"new","amount":20,"customFields":{"a":1},"where":"bank","futureX":[null],"day":"3","displayCategory":"fixed","cardLast4":"","notes":"","bimonthly":false,"bimonthlyStartMonth":null,"period":"חודשי"}',
  );
  assert.equal(JSON.stringify(stored), before);
});

test('edit: a legacy variable must pick a payment method; a legacy loan source reopens as bank', () => {
  const legacyVar = { id: 1, type: 'variable', title: 'v', amount: 5, total: '3', start: '2026-01-01' };
  const vf = editFormValues(legacyVar, cfg);
  assert.equal(vf.where, '', 'never silently defaulted to bank');
  assert.deepEqual(editItem({ items: [legacyVar], id: 1, values: vf, categoryConfig: cfg, opening: null, now }), {
    ok: false,
    field: 'where',
    message: ITEM_MESSAGES.paymentMethod,
  });
  const legacyLoan = { id: 2, type: 'loan', title: 'l', amount: 5, where: 'לאומי', day: '4', total: '10', start: '2026-01-01' };
  const lf = editFormValues(legacyLoan, cfg);
  assert.equal(lf.where, LOAN_BANK_WHERE);
  const r = editItem({ items: [legacyLoan], id: 2, values: lf, categoryConfig: cfg, opening: null, now });
  assert.ok(r.ok);
  assert.equal(r.item.where, 'חשבון בנק');
});

test('edit: archived items are not editable; unknown id is not found; settlement edit bumps the date', () => {
  assert.deepEqual(editItem({ items: [{ id: 1, type: 'income', isArchived: true }], id: 1, values: blank, categoryConfig: cfg, opening: null, now }), {
    ok: false,
    field: null,
    message: ITEM_MESSAGES.archivedNotEditable,
  });
  assert.deepEqual(editItem({ items: [], id: 1, values: blank, categoryConfig: cfg, opening: null, now }), { ok: false, field: null, message: ITEM_MESSAGES.notFound });
  const s = { id: 3, type: 'dated', displayCategory: 'dated', title: 'ויזה', amount: 100, start: '2026-09-01', where: 'credit', cardLast4: '1234' };
  const r = editItem({ items: [s], id: 3, values: { ...editFormValues(s, cfg), amount: '150' }, categoryConfig: cfg, opening: null, now });
  assert.ok(r.ok);
  assert.equal(r.item.where, 'bank');
  assert.deepEqual(r.settingsPatch, { creditCardSettlementUpdatedAt: '2026-09-14' });
});

test('create form defaults follow the category default day, today for dated/withdrawal', () => {
  const c = { ...cfg, custom_car: { label: '🚗 רכב', baseType: 'fixed', defaultDayOfMonth: 15 } };
  assert.equal(createFormDefaults('fixed', 'custom_car', c, now).day, '15');
  assert.equal(createFormDefaults('income', 'income', c, now).day, '1');
  assert.equal(createFormDefaults('dated', 'dated', c, now).start, '2026-09-14');
  assert.equal(createFormDefaults('cashWithdrawal', null, c, now).start, '2026-09-14');
  assert.equal(createFormDefaults('loan', 'loan', c, now).where, LOAN_BANK_WHERE);
});

test('archive / restore / delete (Web bookkeeping fields and activity lines)', () => {
  const items: RawItem[] = [
    { id: 1, type: 'fixed', title: 'A', isArchived: false },
    { id: 2, type: 'income', title: 'B' },
  ];
  const a = archiveItem(items, 1, now);
  assert.ok(a);
  assert.equal(JSON.stringify(a.items[0]), '{"id":1,"type":"fixed","title":"A","isArchived":true,"archiveReason":"manual","archivedAt":"2026-09-14"}');
  assert.deepEqual(a.activity, [{ action: 'manual_archive', detail: 'A' }]);
  const u = unarchiveItem(a.items, 1);
  assert.ok(u);
  assert.equal(JSON.stringify(u.items[0]), '{"id":1,"type":"fixed","title":"A","isArchived":false}');
  assert.deepEqual(u.activity, [{ action: 'restore', detail: 'A' }]);
  const d = deleteItem(items, 2);
  assert.ok(d);
  assert.equal(d.items.length, 1);
  assert.deepEqual(d.activity, []);
  assert.equal(archiveItem(items, 99, now), null);
  assert.equal(items[0]?.isArchived, false, 'inputs never mutated');
});
