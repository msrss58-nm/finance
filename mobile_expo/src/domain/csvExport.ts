// Transactions CSV export — app.js csvEscapeField() + exportTransactionsCsv(),
// verbatim: fixed columns, RFC-4180 quoting, CRLF lines, and a UTF-8 BOM so
// spreadsheet apps read the Hebrew text correctly.

import { todayStr } from './dates.ts';
import type { RawItem } from './raw.ts';

export const CSV_COLUMNS = [
  'id', 'type', 'displayCategory', 'title', 'amount', 'originalAmount', 'start', 'day', 'total', 'interest',
  'where', 'cardLast4', 'period', 'notes', 'isArchived', 'archiveReason', 'archivedAt', 'customFields',
] as const;

const BOM = String.fromCharCode(0xfeff);

export function csvEscapeField(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildTransactionsCsv(items: readonly RawItem[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const it of items) {
    const row = CSV_COLUMNS.map((col) => {
      const item = (it ?? {}) as RawItem;
      if (col === 'customFields') return csvEscapeField(item.customFields ? JSON.stringify(item.customFields) : '');
      return csvEscapeField(item[col]);
    });
    lines.push(row.join(','));
  }
  return BOM + lines.join('\r\n');
}

export function transactionsCsvFileName(now: Date): string {
  return 'familyfinance-transactions-' + todayStr(now) + '.csv';
}
