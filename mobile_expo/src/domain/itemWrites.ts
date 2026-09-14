// Item write flows — app.js addPreviewItem(), savePreviewInlineEdit(),
// saveHomeAtmRow()/saveHomeAtmEdit(), archivePreviewItem(),
// unarchivePreviewItem() and deletePreviewItem(), as pure functions over the
// RAW items array.
//
// Stored field types are exactly the Web's: amount/originalAmount are numbers
// (parseFloat); day/total/interest/start are the input strings;
// bimonthlyStartMonth is a number or null; bimonthly a boolean. An edit copies
// the stored object and overwrites only the fields the Web form writes, so
// unknown fields and key order survive. Messages are the Web's own texts.
//
// Deliberately safer than the Web app, with no change in meaning:
//   - every check runs before anything changes (the Web assigns title/amount
//     and only then validates the card digits, leaving a half-edited item in
//     memory on failure);
//   - an entered day-of-month must be a whole 1–31 (see checkDayInput);
//   - an entered date must be a real calendar date;
//   - new ids never collide (nextItemId).

import type { ActivityEntryInput } from './activityLog.ts';
import type { CategoryConfig } from './categoryConfig.ts';
import { cashflowDateOnly, isValidDateStr, parseLocalDateStr, todayStr } from './dates.ts';
import { checkDayInput, numberInputValue, parseAmountInput, sanitizePositiveAmount } from './formInput.ts';
import { nextItemId } from './ids.ts';
import { isPlainObject, type RawItem } from './raw.ts';
import {
  isBuiltinCreditCardSettlement,
  LOAN_PAYROLL_WHERE,
  resolveEffectiveDay,
  resolveEffectiveWhere,
  resolveFixedBimonthlyStartMonth,
  resolveFixedIsBimonthly,
  resolveLoanSource,
  resolveVariablePaymentMethod,
} from './resolvers.ts';
import type { OpeningBalanceConfig } from './settings.ts';

export type ItemFormKind = 'income' | 'fixed' | 'variable' | 'loan' | 'dated' | 'cashWithdrawal';
export type FixedFrequency = 'monthly' | 'bimonthly' | 'annual';

/** The loan form's bank option — the exact Hebrew string the Web stores. */
export const LOAN_BANK_WHERE = 'חשבון בנק';

export const CASH_WITHDRAWAL_TITLE = 'משיכת מזומן';

export type ItemFormValues = {
  readonly title: string;
  readonly amount: string;
  readonly day: string;
  /** fixed/variable/dated: 'bank' | 'credit' ('' = legacy variable, must be chosen); loan: LOAN_BANK_WHERE | LOAN_PAYROLL_WHERE. */
  readonly where: string;
  readonly cardLast4: string;
  readonly notes: string;
  readonly frequency: FixedFrequency;
  /** '1'..'12' */
  readonly bimonthlyStartMonth: string;
  readonly originalAmount: string;
  readonly total: string;
  /** '' or 'YYYY-MM-DD' (dated: charge date; cashWithdrawal: withdrawal date; loan/variable: start date). */
  readonly start: string;
  readonly interest: string;
};

export type ItemFormField = keyof ItemFormValues;

export const ITEM_MESSAGES = {
  incomeRequired: 'מלא שם וסכום',
  loanRequired: 'מלא שם וסכום החזר',
  variableRequired: 'מלא שם ועלות חודשית',
  fixedRequired: 'מלא שם וסכום',
  datedRequired: 'מלא שם, תאריך וסכום',
  cardLast4: 'נא להזין בדיוק 4 ספרות עבור כרטיס האשראי',
  settlementCardLast4: 'נא להזין בדיוק 4 ספרות אחרונות של הכרטיס עבור חיוב האשראי',
  bimonthlyStart: 'נא לבחור חודש התחלה תקין',
  paymentMethod: 'יש לבחור אמצעי תשלום (חשבון בנק או כרטיס אשראי)',
  loanSource: 'יש לבחור היכן יורד ההחזר',
  withdrawalAmount: 'נא להזין סכום תקין (גדול מאפס)',
  withdrawalDate: 'נא להזין תאריך תקין',
  editDatedRequired: 'נא להזין שם, תאריך וסכום תקינים',
  editWithdrawalRequired: 'נא להזין תאריך וסכום תקינים (סכום גדול מאפס)',
  editRequired: 'נא להזין שם וסכום תקינים',
  invalidDate: 'תאריך לא תקין.',
  unknownCategory: 'הקטגוריה אינה קיימת',
  notFound: 'התנועה לא נמצאה',
  archivedNotEditable: 'תנועה בארכיון אינה ניתנת לעריכה — יש לשחזר אותה תחילה',
} as const;

export function withdrawalBeforeOpeningMessage(openingDateStr: string): string {
  return 'לא ניתן להזין משיכת מזומן בתאריך שלפני יתרת ההתחלה (' + openingDateStr + ').';
}

export type ItemWriteSuccess = {
  readonly ok: true;
  readonly items: RawItem[];
  readonly item: RawItem;
  /** Settings fields that belong to the same commit (the settlement tile's "עודכן:" date). */
  readonly settingsPatch: Readonly<Record<string, unknown>> | null;
  readonly activity: readonly ActivityEntryInput[];
};
export type ItemWriteFailure = { readonly ok: false; readonly field: ItemFormField | null; readonly message: string };
export type ItemWriteResult = ItemWriteSuccess | ItemWriteFailure;

const fail = (field: ItemFormField | null, message: string): ItemWriteFailure => ({ ok: false, field, message });
const CARD_LAST4 = /^\d{4}$/;

const KINDS: readonly ItemFormKind[] = ['income', 'fixed', 'variable', 'loan', 'dated', 'cashWithdrawal'];

/** The edit form an item gets: its own type, or — like the Web's default branch — the income layout. */
export function formKindForItem(item: RawItem): ItemFormKind {
  return (KINDS as readonly unknown[]).includes(item.type) ? (item.type as ItemFormKind) : 'income';
}

export function findItemIndex(items: readonly RawItem[], id: unknown): number {
  return items.findIndex((it) => isPlainObject(it) && it.id === id);
}

const EMPTY_VALUES: ItemFormValues = {
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

/** Initial add-form values (app.js buildPreviewAddFormHtml()). */
export function createFormDefaults(kind: ItemFormKind, categoryKey: string | null, categoryConfig: CategoryConfig, now: Date): ItemFormValues {
  const defaultDay = String(resolveEffectiveDay({ displayCategory: categoryKey }, categoryConfig));
  switch (kind) {
    case 'income':
      return { ...EMPTY_VALUES, day: defaultDay };
    case 'loan':
      return { ...EMPTY_VALUES, day: defaultDay, where: LOAN_BANK_WHERE };
    case 'variable':
      return { ...EMPTY_VALUES, day: defaultDay, where: 'bank' };
    case 'fixed':
      return { ...EMPTY_VALUES, day: defaultDay, where: 'bank', bimonthlyStartMonth: String(now.getMonth() + 1) };
    case 'dated':
      return { ...EMPTY_VALUES, where: 'bank', start: todayStr(now) };
    case 'cashWithdrawal':
      return { ...EMPTY_VALUES, start: todayStr(now) };
  }
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** app.js resolveFixedFrequency(). */
export function resolveFixedFrequency(item: RawItem): FixedFrequency {
  if (resolveFixedIsBimonthly(item)) return 'bimonthly';
  return item && item.period === 'שנתי' ? 'annual' : 'monthly';
}

/** Initial edit-form values (app.js buildPreviewEditFormHtml()). */
export function editFormValues(item: RawItem, categoryConfig: CategoryConfig): ItemFormValues {
  const kind = formKindForItem(item);
  const base: ItemFormValues = {
    ...EMPTY_VALUES,
    title: text(item.title),
    amount: text(item.amount),
    cardLast4: text(item.cardLast4),
    notes: text(item.notes),
    start: text(item.start),
  };
  switch (kind) {
    case 'dated':
      return { ...base, where: resolveEffectiveWhere(item) };
    case 'cashWithdrawal':
      return base;
    case 'fixed':
      return {
        ...base,
        day: String(resolveEffectiveDay(item, categoryConfig)),
        where: item.where === 'credit' ? 'credit' : 'bank',
        frequency: resolveFixedFrequency(item),
        bimonthlyStartMonth: String(resolveFixedBimonthlyStartMonth(item)),
      };
    case 'variable':
      return {
        ...base,
        day: String(resolveEffectiveDay(item, categoryConfig)),
        where: resolveVariablePaymentMethod(item) ?? '',
        originalAmount: text(item.originalAmount || ''),
        total: text(item.total || ''),
      };
    case 'loan':
      return {
        ...base,
        day: String(resolveEffectiveDay(item, categoryConfig)),
        where: resolveLoanSource(item) === 'payroll' ? LOAN_PAYROLL_WHERE : LOAN_BANK_WHERE,
        originalAmount: text(item.originalAmount || ''),
        total: text(item.total || ''),
        interest: text(item.interest || ''),
      };
    case 'income':
      return { ...base, day: String(resolveEffectiveDay(item, categoryConfig)) };
  }
}

function isBeforeOpening(dateStr: string, opening: OpeningBalanceConfig | null): boolean {
  if (!opening) return false;
  return cashflowDateOnly(parseLocalDateStr(dateStr) as Date) < cashflowDateOnly(parseLocalDateStr(opening.dateStr) as Date);
}

function checkOptionalDate(value: string): { ok: true; value: string } | { ok: false } {
  const t = value.trim();
  if (t === '') return { ok: true, value: '' };
  return isValidDateStr(t) ? { ok: true, value: t } : { ok: false };
}

/** Card digits for a bank/credit choice: required exactly when 'credit', '' otherwise. */
function cardDigits(where: string, raw: string, message: string): { ok: true; value: string } | ItemWriteFailure {
  if (where !== 'credit') return { ok: true, value: '' };
  const last4 = raw.trim();
  return CARD_LAST4.test(last4) ? { ok: true, value: last4 } : fail('cardLast4', message);
}

type Frequency = { bimonthly: boolean; bimonthlyStartMonth: number | null; period: string };

function fixedFrequency(v: ItemFormValues): { ok: true; value: Frequency } | ItemWriteFailure {
  if (v.frequency === 'bimonthly') {
    const m = parseInt(v.bimonthlyStartMonth, 10);
    if (!isFinite(m) || m < 1 || m > 12) return fail('bimonthlyStartMonth', ITEM_MESSAGES.bimonthlyStart);
    return { ok: true, value: { bimonthly: true, bimonthlyStartMonth: m, period: 'חודשי' } };
  }
  return { ok: true, value: { bimonthly: false, bimonthlyStartMonth: null, period: v.frequency === 'annual' ? 'שנתי' : 'חודשי' } };
}

export type CreateItemInput = {
  readonly items: readonly RawItem[];
  readonly kind: ItemFormKind;
  /** The category the add form was opened for; null only for a cash withdrawal (never categorized). */
  readonly categoryKey: string | null;
  readonly values: ItemFormValues;
  readonly categoryConfig: CategoryConfig;
  readonly opening: OpeningBalanceConfig | null;
  readonly now: Date;
};

/** app.js addPreviewItem() (and saveHomeAtmRow() for a cash withdrawal). */
export function createItem(input: CreateItemInput): ItemWriteResult {
  const { items, kind, values: v, categoryConfig, opening, now } = input;
  const catKey = input.categoryKey;
  if (kind !== 'cashWithdrawal') {
    const cfg = catKey === null ? undefined : categoryConfig[catKey];
    if (catKey === null || !isPlainObject(cfg) || cfg.baseType !== kind) return fail(null, ITEM_MESSAGES.unknownCategory);
  }

  const obj: Record<string, unknown> = { id: nextItemId(items, now.getTime()), type: kind, isArchived: false };
  if (kind !== 'cashWithdrawal') obj.displayCategory = catKey;
  let settingsPatch: Record<string, unknown> | null = null;

  const title = v.title.trim();
  const amount = parseAmountInput(v.amount);

  switch (kind) {
    case 'income': {
      if (!title) return fail('title', ITEM_MESSAGES.incomeRequired);
      if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.incomeRequired);
      const day = checkDayInput(v.day);
      if (!day.ok) return fail('day', day.message);
      obj.title = title;
      obj.amount = amount;
      obj.day = day.value;
      break;
    }
    case 'loan': {
      if (!title) return fail('title', ITEM_MESSAGES.loanRequired);
      if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.loanRequired);
      if (v.where !== LOAN_BANK_WHERE && v.where !== LOAN_PAYROLL_WHERE) return fail('where', ITEM_MESSAGES.loanSource);
      const day = checkDayInput(v.day);
      if (!day.ok) return fail('day', day.message);
      const start = checkOptionalDate(v.start);
      if (!start.ok) return fail('start', ITEM_MESSAGES.invalidDate);
      obj.title = title;
      obj.originalAmount = parseAmountInput(v.originalAmount) || 0;
      obj.amount = amount;
      obj.where = v.where;
      obj.interest = numberInputValue(v.interest);
      obj.day = day.value;
      obj.total = numberInputValue(v.total);
      obj.start = start.value;
      break;
    }
    case 'variable': {
      if (!title) return fail('title', ITEM_MESSAGES.variableRequired);
      if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.variableRequired);
      if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
      const day = checkDayInput(v.day);
      if (!day.ok) return fail('day', day.message);
      const start = checkOptionalDate(v.start);
      if (!start.ok) return fail('start', ITEM_MESSAGES.invalidDate);
      const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
      if (!card.ok) return card;
      obj.title = title;
      obj.originalAmount = parseAmountInput(v.originalAmount) || 0;
      obj.amount = amount;
      obj.day = day.value;
      obj.total = numberInputValue(v.total);
      obj.start = start.value;
      obj.where = v.where;
      obj.cardLast4 = card.value;
      break;
    }
    case 'fixed': {
      if (!title) return fail('title', ITEM_MESSAGES.fixedRequired);
      if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.fixedRequired);
      if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
      const day = checkDayInput(v.day);
      if (!day.ok) return fail('day', day.message);
      const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
      if (!card.ok) return card;
      const freq = fixedFrequency(v);
      if (!freq.ok) return freq;
      obj.title = title;
      obj.amount = amount;
      obj.day = day.value;
      obj.where = v.where;
      obj.notes = v.notes;
      obj.cardLast4 = card.value;
      obj.bimonthly = freq.value.bimonthly;
      obj.bimonthlyStartMonth = freq.value.bimonthlyStartMonth;
      obj.period = freq.value.period;
      break;
    }
    case 'dated': {
      const start = v.start.trim();
      if (!title) return fail('title', ITEM_MESSAGES.datedRequired);
      if (!start || !isValidDateStr(start)) return fail('start', ITEM_MESSAGES.datedRequired);
      if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.datedRequired);
      if (catKey === 'dated') {
        const card = cardDigits('credit', v.cardLast4, ITEM_MESSAGES.settlementCardLast4);
        if (!card.ok) return card;
        obj.title = title;
        obj.start = start;
        obj.amount = amount;
        obj.where = 'bank';
        obj.cardLast4 = card.value;
        obj.notes = v.notes;
        settingsPatch = { creditCardSettlementUpdatedAt: todayStr(now) };
      } else {
        if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
        const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
        if (!card.ok) return card;
        obj.title = title;
        obj.start = start;
        obj.amount = amount;
        obj.where = v.where;
        obj.cardLast4 = card.value;
      }
      break;
    }
    case 'cashWithdrawal': {
      const wdAmount = sanitizePositiveAmount(v.amount);
      const dateStr = v.start.trim();
      if (wdAmount === null) return fail('amount', ITEM_MESSAGES.withdrawalAmount);
      if (!isValidDateStr(dateStr)) return fail('start', ITEM_MESSAGES.withdrawalDate);
      if (isBeforeOpening(dateStr, opening)) return fail('start', withdrawalBeforeOpeningMessage((opening as OpeningBalanceConfig).dateStr));
      obj.title = CASH_WITHDRAWAL_TITLE;
      obj.amount = wdAmount;
      obj.start = dateStr;
      obj.notes = v.notes.trim();
      break;
    }
  }
  return { ok: true, items: [...items, obj], item: obj, settingsPatch, activity: [] };
}

export type EditItemInput = {
  readonly items: readonly RawItem[];
  readonly id: unknown;
  readonly values: ItemFormValues;
  readonly categoryConfig: CategoryConfig;
  readonly opening: OpeningBalanceConfig | null;
  readonly now: Date;
};

/** app.js savePreviewInlineEdit() (and saveHomeAtmEdit() for a cash withdrawal). */
export function editItem(input: EditItemInput): ItemWriteResult {
  const { items, values: v, opening, now } = input;
  const idx = findItemIndex(items, input.id);
  if (idx === -1) return fail(null, ITEM_MESSAGES.notFound);
  const raw = items[idx] as RawItem;
  if (raw.isArchived) return fail(null, ITEM_MESSAGES.archivedNotEditable);

  const next: Record<string, unknown> = { ...raw };
  let settingsPatch: Record<string, unknown> | null = null;
  const title = v.title.trim();
  const amount = parseAmountInput(v.amount);

  if (raw.type === 'dated') {
    const start = v.start.trim();
    if (!title) return fail('title', ITEM_MESSAGES.editDatedRequired);
    if (!start || !isValidDateStr(start)) return fail('start', ITEM_MESSAGES.editDatedRequired);
    if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.editDatedRequired);
    if (isBuiltinCreditCardSettlement(raw)) {
      const card = cardDigits('credit', v.cardLast4, ITEM_MESSAGES.settlementCardLast4);
      if (!card.ok) return card;
      next.where = 'bank';
      next.cardLast4 = card.value;
      next.notes = v.notes;
      settingsPatch = { creditCardSettlementUpdatedAt: todayStr(now) };
    } else {
      if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
      const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
      if (!card.ok) return card;
      next.cardLast4 = card.value;
      next.where = v.where;
    }
    next.title = title;
    next.start = start;
    next.amount = amount;
  } else if (raw.type === 'cashWithdrawal') {
    const wdAmount = sanitizePositiveAmount(v.amount);
    const dateStr = v.start.trim();
    if (wdAmount === null) return fail('amount', ITEM_MESSAGES.editWithdrawalRequired);
    if (!isValidDateStr(dateStr)) return fail('start', ITEM_MESSAGES.editWithdrawalRequired);
    if (isBeforeOpening(dateStr, opening)) return fail('start', withdrawalBeforeOpeningMessage((opening as OpeningBalanceConfig).dateStr));
    next.amount = wdAmount;
    next.start = dateStr;
    next.notes = v.notes.trim();
  } else {
    if (!title) return fail('title', ITEM_MESSAGES.editRequired);
    if (isNaN(amount)) return fail('amount', ITEM_MESSAGES.editRequired);
    const day = checkDayInput(v.day);
    if (!day.ok) return fail('day', day.message);

    if (raw.type === 'fixed') {
      if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
      const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
      if (!card.ok) return card;
      const freq = fixedFrequency(v);
      if (!freq.ok) return freq;
      next.title = title;
      next.amount = amount;
      next.cardLast4 = card.value;
      next.day = day.value;
      next.where = v.where;
      next.notes = v.notes;
      next.bimonthly = freq.value.bimonthly;
      next.bimonthlyStartMonth = freq.value.bimonthlyStartMonth;
      next.period = freq.value.period;
    } else if (raw.type === 'variable') {
      if (v.where !== 'bank' && v.where !== 'credit') return fail('where', ITEM_MESSAGES.paymentMethod);
      const card = cardDigits(v.where, v.cardLast4, ITEM_MESSAGES.cardLast4);
      if (!card.ok) return card;
      const start = checkOptionalDate(v.start);
      if (!start.ok) return fail('start', ITEM_MESSAGES.invalidDate);
      next.title = title;
      next.amount = amount;
      next.originalAmount = parseAmountInput(v.originalAmount) || 0;
      next.day = day.value;
      next.total = numberInputValue(v.total);
      next.start = start.value;
      next.where = v.where;
      next.cardLast4 = card.value;
    } else if (raw.type === 'loan') {
      if (v.where !== LOAN_BANK_WHERE && v.where !== LOAN_PAYROLL_WHERE) return fail('where', ITEM_MESSAGES.loanSource);
      const start = checkOptionalDate(v.start);
      if (!start.ok) return fail('start', ITEM_MESSAGES.invalidDate);
      next.title = title;
      next.amount = amount;
      next.originalAmount = parseAmountInput(v.originalAmount) || 0;
      next.where = v.where;
      next.interest = numberInputValue(v.interest);
      next.day = day.value;
      next.total = numberInputValue(v.total);
      next.start = start.value;
    } else {
      next.title = title;
      next.amount = amount;
      next.day = day.value;
    }
  }

  const nextItems = items.slice();
  nextItems[idx] = next;
  return { ok: true, items: nextItems, item: next, settingsPatch, activity: [] };
}

export type ItemMutation = { readonly items: RawItem[]; readonly activity: readonly ActivityEntryInput[] };

/** app.js archivePreviewItem(): records archiveReason 'manual' + archivedAt. null when the id is unknown. */
export function archiveItem(items: readonly RawItem[], id: unknown, now: Date): ItemMutation | null {
  const idx = findItemIndex(items, id);
  if (idx === -1) return null;
  const raw = items[idx] as RawItem;
  const next: Record<string, unknown> = { ...raw };
  next.isArchived = true;
  next.archiveReason = 'manual';
  next.archivedAt = todayStr(now);
  const nextItems = items.slice();
  nextItems[idx] = next;
  return { items: nextItems, activity: [{ action: 'manual_archive', detail: text(raw.title || '') }] };
}

/** app.js unarchivePreviewItem(): clears archiveReason/archivedAt along with isArchived. */
export function unarchiveItem(items: readonly RawItem[], id: unknown): ItemMutation | null {
  const idx = findItemIndex(items, id);
  if (idx === -1) return null;
  const raw = items[idx] as RawItem;
  const next: Record<string, unknown> = { ...raw };
  next.isArchived = false;
  delete next.archiveReason;
  delete next.archivedAt;
  const nextItems = items.slice();
  nextItems[idx] = next;
  return { items: nextItems, activity: [{ action: 'restore', detail: text(raw.title || '') }] };
}

/** app.js deletePreviewItem(): permanent removal (no activity line, like the Web). */
export function deleteItem(items: readonly RawItem[], id: unknown): ItemMutation | null {
  const idx = findItemIndex(items, id);
  if (idx === -1) return null;
  const nextItems = items.slice();
  nextItems.splice(idx, 1);
  return { items: nextItems, activity: [] };
}
