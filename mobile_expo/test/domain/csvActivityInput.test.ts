// CSV export, activity-log append and form-input parsing.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { activityActionLabel, appendActivityEntries } from '../../src/domain/activityLog.ts';
import { buildTransactionsCsv, CSV_COLUMNS, csvEscapeField, transactionsCsvFileName } from '../../src/domain/csvExport.ts';
import { checkDayInput, numberInputValue, sanitizeFiniteAmount, sanitizeNonNegativeAmount, sanitizePositiveAmount } from '../../src/domain/formInput.ts';

const now = new Date(2026, 8, 14, 10, 5);

test('CSV: Web quoting, BOM, CRLF, fixed columns, customFields as JSON', () => {
  assert.equal(csvEscapeField(null), '');
  assert.equal(csvEscapeField(undefined), '');
  assert.equal(csvEscapeField('a,b'), '"a,b"');
  assert.equal(csvEscapeField('q"x'), '"q""x"');
  assert.equal(csvEscapeField('two\nlines'), '"two\nlines"');
  assert.equal(csvEscapeField(5), '5');
  assert.equal(csvEscapeField(false), 'false');
  const csv = buildTransactionsCsv([{ id: 1, type: 'fixed', title: 'שכירות, דירה', amount: 4200, customFields: { a: 1 }, isArchived: false }]);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'UTF-8 BOM for spreadsheet apps');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines[1], '1,fixed,,"שכירות, דירה",4200,,,,,,,,,,false,,,"{""a"":1}"');
  assert.equal(transactionsCsvFileName(now), 'familyfinance-transactions-2026-09-14.csv');
});

test('activity log: append with the Web timestamp, cap 200, never overwrite an unreadable log', () => {
  const one = appendActivityEntries(null, [{ action: 'backup', detail: 'x' }], now);
  assert.equal(one, '[{"ts":"2026-09-14 10:05","action":"backup","detail":"x"}]');
  assert.equal(appendActivityEntries('corrupt', [{ action: 'backup', detail: 'x' }], now), null);
  assert.equal(appendActivityEntries('{"not":"array"}', [{ action: 'backup', detail: 'x' }], now), null);
  assert.equal(appendActivityEntries('[]', [], now), null);
  const long = JSON.stringify(Array.from({ length: 205 }, (_, i) => ({ ts: 't', action: 'a', detail: String(i) })));
  const capped = JSON.parse(appendActivityEntries(long, [{ action: 'restore', detail: 'new' }], now) as string) as { detail: string }[];
  assert.equal(capped.length, 200);
  assert.equal(capped[0]?.detail, '6', 'oldest dropped first');
  assert.equal(capped[199]?.detail, 'new');
  assert.equal(activityActionLabel('manual_archive'), 'ארכוב ידני');
  assert.equal(activityActionLabel('toString'), 'toString', 'no prototype lookups');
  assert.equal(activityActionLabel('future_action'), 'future_action');
});

test('number inputs behave like <input type=number>: invalid text is empty, never a partial number', () => {
  assert.equal(numberInputValue(' 12.5 '), '12.5');
  assert.equal(numberInputValue('-1500'), '-1500');
  assert.equal(numberInputValue('1,5'), '');
  assert.equal(numberInputValue('12abc'), '');
  assert.equal(numberInputValue('.5'), '.5');
  assert.equal(sanitizeFiniteAmount(''), null, 'empty is not 0');
  assert.equal(sanitizeFiniteAmount('0'), 0);
  assert.equal(sanitizeFiniteAmount('-1500.555'), -1500.55, 'app.js round2: Math.round rounds -.5 toward +Infinity');
  assert.equal(sanitizePositiveAmount('0'), null);
  assert.equal(sanitizeNonNegativeAmount('0'), 0);
  assert.equal(sanitizeFiniteAmount('1e400'), null);
  assert.deepEqual(checkDayInput(''), { ok: true, value: '', day: null });
  assert.deepEqual(checkDayInput('07'), { ok: true, value: '7', day: 7 });
  assert.equal(checkDayInput('0').ok, false);
  assert.equal(checkDayInput('5.5').ok, false);
});
