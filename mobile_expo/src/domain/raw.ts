// Raw data model (Stage 2).
//
// The Web app never stores typed records: family_finance_data is an array of
// flat JS objects, differentiated only by `type` at read time, and every
// calculation reads `item.foo` with plain JavaScript semantics. The Expo domain
// therefore keeps the RAW parsed objects as the single source of truth and
// never rewrites them: unknown fields, legacy numeric-string values, legacy ids,
// null vs [] and key order all survive by construction. Typed views are
// computed on demand (describeItem) and are never written back.

export type RawItem = Readonly<Record<string, unknown>>;
export type RawObject = Record<string, unknown>;

export const ITEM_TYPES = ['income', 'fixed', 'variable', 'loan', 'dated', 'cashWithdrawal'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export function isKnownItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && (ITEM_TYPES as readonly string[]).includes(value);
}

export function isPlainObject(value: unknown): value is RawObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * app.js loadPreviewItems(): anything that is not a JSON array (missing key,
 * corrupt JSON, wrong type) becomes []; array entries are returned untouched.
 */
export function parseItemsRaw(raw: string | null): RawItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw as string);
  } catch {
    parsed = null;
  }
  return Array.isArray(parsed) ? (parsed as RawItem[]) : [];
}

/** The fields each Web item type actually uses. Anything else is an unknown field. */
const COMMON_KEYS = ['id', 'type', 'isArchived', 'archiveReason', 'archivedAt', 'displayCategory', 'title'];
const TYPE_KEYS: Record<ItemType, readonly string[]> = {
  income: [...COMMON_KEYS, 'amount', 'day'],
  fixed: [...COMMON_KEYS, 'amount', 'day', 'where', 'cardLast4', 'notes', 'period', 'bimonthly', 'bimonthlyStartMonth'],
  variable: [...COMMON_KEYS, 'amount', 'originalAmount', 'day', 'total', 'start', 'where', 'cardLast4'],
  loan: [...COMMON_KEYS, 'amount', 'originalAmount', 'where', 'interest', 'day', 'total', 'start'],
  dated: [...COMMON_KEYS, 'amount', 'start', 'where', 'cardLast4', 'notes'],
  cashWithdrawal: ['id', 'type', 'isArchived', 'archiveReason', 'archivedAt', 'title', 'amount', 'start', 'notes'],
};

export type ItemView = {
  /** The untouched stored object. */
  readonly raw: RawItem;
  readonly type: ItemType | null;
  readonly id: unknown;
  readonly title: string;
  /** Numeric amount when the stored value is a finite number; null otherwise (never coerced). */
  readonly amount: number | null;
  readonly isArchived: boolean;
  /** Stored keys this type does not model — preserved in raw, listed for diagnostics. */
  readonly unknownFields: readonly string[];
  readonly issues: readonly string[];
};

/** Read-only typed projection of one raw item. Never mutates or normalizes the raw value. */
export function describeItem(raw: unknown): ItemView {
  const obj: RawItem = isPlainObject(raw) ? raw : {};
  const issues: string[] = [];
  if (!isPlainObject(raw)) issues.push('not an object');
  const type = isKnownItemType(obj.type) ? obj.type : null;
  if (type === null) issues.push('unknown type');
  const amount = typeof obj.amount === 'number' && isFinite(obj.amount) ? obj.amount : null;
  if (amount === null) issues.push('non-numeric amount');
  if (obj.id === undefined || obj.id === null) issues.push('missing id');
  const known = type === null ? COMMON_KEYS : TYPE_KEYS[type];
  return {
    raw: obj,
    type,
    id: obj.id,
    title: typeof obj.title === 'string' ? obj.title : '',
    amount,
    isArchived: obj.isArchived === true,
    unknownFields: Object.keys(obj).filter((k) => !known.includes(k)),
    issues,
  };
}
