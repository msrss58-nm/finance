// Stage 3 category management: Web key format, labels, default day, deletion rules.
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import {
  addCategory,
  CATEGORY_MESSAGES,
  deleteCategory,
  editCategory,
  pickEmojiForCategory,
  translateBaseType,
} from '../../src/domain/categoryWrites.ts';
import { DAY_INPUT_MESSAGE } from '../../src/domain/formInput.ts';

const cfg = resolveCategoryConfig(null);

test('add: custom_<ts> key, emoji + title label, optional default day, activity line', () => {
  const r = addCategory(cfg, ' רכב ', 'fixed', '15', 1000);
  assert.ok(r.ok);
  assert.equal(r.key, 'custom_1000');
  assert.deepEqual(r.categoryConfig.custom_1000, { label: '🚗 רכב', baseType: 'fixed', defaultDayOfMonth: 15 });
  assert.deepEqual(r.activity, [{ action: 'category_created', detail: '🚗 רכב' }]);
  assert.deepEqual(Object.keys(r.categoryConfig), ['income', 'fixed', 'variable', 'loan', 'dated', 'custom_1000']);
  const again = addCategory(r.categoryConfig, 'עוד', 'income', '', 1000);
  assert.ok(again.ok);
  assert.equal(again.key, 'custom_1000_1', 'a same-millisecond key never overwrites');
  assert.deepEqual(again.categoryConfig.custom_1000_1, { label: '💰 עוד', baseType: 'income' });
});

test('add: dated has no default day; loan is not an allowed custom type; bad input refused', () => {
  const dated = addCategory(cfg, 'כרטיס נוסף', 'dated', '5', 1);
  assert.ok(dated.ok);
  assert.deepEqual(dated.categoryConfig.custom_1, { label: '💳 כרטיס נוסף', baseType: 'dated' });
  assert.deepEqual(addCategory(cfg, 'x', 'loan', '', 1), { ok: false, field: 'baseType', message: CATEGORY_MESSAGES.invalidType });
  assert.deepEqual(addCategory(cfg, '  ', 'fixed', '', 1), { ok: false, field: 'title', message: CATEGORY_MESSAGES.titleRequired });
  assert.deepEqual(addCategory(cfg, 'x', 'fixed', '40', 1), { ok: false, field: 'day', message: DAY_INPUT_MESSAGE });
});

test('edit: rename built-in or custom; set / clear the default day with activity lines', () => {
  const added = addCategory(cfg, 'רכב', 'fixed', '15', 1000);
  assert.ok(added.ok);
  const cleared = editCategory(added.categoryConfig, 'custom_1000', 'רכב משפחתי', '');
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.categoryConfig.custom_1000, { label: 'רכב משפחתי', baseType: 'fixed' });
  assert.deepEqual(cleared.activity, [
    { action: 'category_renamed', detail: 'custom_1000 → רכב משפחתי' },
    { action: 'default_day_changed', detail: 'custom_1000 → ללא' },
  ]);
  const income = editCategory(cfg, 'income', '💰 הכנסות הבית', '25');
  assert.ok(income.ok);
  assert.deepEqual(income.categoryConfig.income, { label: '💰 הכנסות הבית', baseType: 'income', defaultDayOfMonth: 25 });
  const dated = editCategory(cfg, 'dated', 'ויזה', '5');
  assert.ok(dated.ok);
  assert.deepEqual(dated.categoryConfig.dated, { label: 'ויזה', baseType: 'dated' }, 'no default day for dated');
  assert.deepEqual(editCategory(cfg, 'fixed', ' ', null), { ok: false, field: 'title', message: CATEGORY_MESSAGES.titleRequired });
  assert.deepEqual(editCategory(cfg, 'nope', 'x', null), { ok: false, field: null, message: CATEGORY_MESSAGES.notFound });
});

test('delete: built-ins protected, a category with items (even archived) kept, legacy dated gap preserved', () => {
  assert.deepEqual(deleteCategory(cfg, [], 'fixed'), { ok: false, reason: 'builtIn', message: CATEGORY_MESSAGES.builtIn });
  const added = addCategory(cfg, 'רכב', 'fixed', '', 7);
  assert.ok(added.ok);
  assert.deepEqual(deleteCategory(added.categoryConfig, [{ id: 1, displayCategory: 'custom_7', isArchived: true }], 'custom_7'), {
    ok: false,
    reason: 'hasItems',
    message: CATEGORY_MESSAGES.hasItems,
  });
  const ok = deleteCategory(added.categoryConfig, [], 'custom_7');
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.categoryConfig), ['income', 'fixed', 'variable', 'loan', 'dated']);
  assert.deepEqual(ok.activity, [{ action: 'category_deleted', detail: '🚗 רכב' }]);
  // Approved decision E: the built-in 'dated' category is NOT deletion-protected on the Web.
  const dated = deleteCategory(cfg, [], 'dated');
  assert.ok(dated.ok, 'legacy gap preserved, not fixed');
  assert.deepEqual(deleteCategory(cfg, [], 'nope'), { ok: false, reason: 'notFound', message: CATEGORY_MESSAGES.notFound });
});

test('emoji and type labels are the Web rules', () => {
  assert.equal(pickEmojiForCategory('ביטוח דירה', 'fixed'), '🏠');
  assert.equal(pickEmojiForCategory('קפה', 'fixed'), '☕');
  assert.equal(pickEmojiForCategory('שונות', 'variable'), '🛍️');
  assert.equal(pickEmojiForCategory('שונות', 'fixed'), '🏷️');
  assert.deepEqual(['income', 'fixed', 'variable', 'dated', 'loan'].map(translateBaseType), ['הכנסה', 'קבוע', 'תשלומים', 'חיוב חד-פעמי', '']);
});
