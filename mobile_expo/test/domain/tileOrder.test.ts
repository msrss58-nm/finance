// Home tile order + label display, incl. an exhaustive check of the
// hand-written Extended_Pictographic table against the Web's regex.
// Invisible code points are built with String.fromCodePoint (never typed literally).
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CATEGORY_CONFIG_JSON, resolveCategoryConfig } from '../../src/domain/categoryConfig.ts';
import { pickEmojiForCategory } from '../../src/domain/categoryWrites.ts';
import { homeTileDisplayLabel, isExtendedPictographic, moveTileKey, reconcileTileOrder, stripLeadingEmoji } from '../../src/domain/tileOrder.ts';

const cfg = resolveCategoryConfig(null);
const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f);

test('reconcile: stored order first (first occurrence, existing keys), then new keys; income never a tile', () => {
  assert.deepEqual(reconcileTileOrder('["loan","gone","fixed","loan",7]', cfg), ['loan', 'fixed', 'variable', 'dated']);
  assert.deepEqual(reconcileTileOrder('corrupt', cfg), ['fixed', 'variable', 'loan', 'dated']);
  assert.deepEqual(reconcileTileOrder(null, cfg), ['fixed', 'variable', 'loan', 'dated']);
});

test('move one step; edges and unknown keys leave the order unchanged', () => {
  const o = ['a', 'b', 'c'];
  assert.deepEqual(moveTileKey(o, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveTileKey(o, 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(moveTileKey(o, 'a', -1), o);
  assert.deepEqual(moveTileKey(o, 'z', 1), o);
});

test('the pictographic table equals /\\p{Extended_Pictographic}/u on every code point', () => {
  const re = /\p{Extended_Pictographic}/u;
  const mismatches: string[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (isExtendedPictographic(cp) !== re.test(String.fromCodePoint(cp))) mismatches.push(cp.toString(16));
  }
  assert.deepEqual(mismatches.slice(0, 20), []);
});

test('leading-emoji strip matches the Web regex on every built-in and generated label', () => {
  const web = new RegExp('^[\\p{Extended_Pictographic}' + ZWJ + VS16 + ']+\\s*', 'u');
  const labels = Object.values(JSON.parse(DEFAULT_CATEGORY_CONFIG_JSON) as Record<string, { label: string }>).map((c) => c.label);
  for (const title of ['רכב', 'קפה', 'ביטוח', 'חופשה', 'ספורט', 'אחר', 'Netflix']) {
    for (const bt of ['fixed', 'variable', 'income', 'dated', 'loan']) labels.push(pickEmojiForCategory(title, bt) + ' ' + title);
  }
  const family = String.fromCodePoint(0x1f468) + ZWJ + String.fromCodePoint(0x1f469) + ZWJ + String.fromCodePoint(0x1f467);
  const flag = String.fromCodePoint(0x1f1ee, 0x1f1f1);
  const keycap = '1' + VS16 + String.fromCodePoint(0x20e3);
  labels.push('רכב', '', '  x', flag + ' דגל', family + ' משפחה', keycap + ' one', String.fromCodePoint(0xa9) + '  copyright', String.fromCodePoint(0x2708) + VS16 + ' טיול');
  for (const label of labels) assert.equal(stripLeadingEmoji(label), label.replace(web, ''), JSON.stringify(label));
  assert.equal(stripLeadingEmoji(family + ' משפחה'), 'משפחה');
  assert.equal(stripLeadingEmoji(flag + ' דגל'), flag + ' דגל', 'regional indicators are not pictographic');
});

test('Home tile labels: Web display overrides, emoji stripped, key fallback', () => {
  assert.equal(homeTileDisplayLabel('variable', cfg), 'תשלומים החודש');
  assert.equal(homeTileDisplayLabel('loan', cfg), 'תשלומי הלוואות החודש');
  assert.equal(homeTileDisplayLabel('fixed', cfg), 'הוצאות קבועות');
  assert.equal(homeTileDisplayLabel('dated', cfg), 'חיוב כרטיס אשראי');
  assert.equal(homeTileDisplayLabel('ghost', { ghost: { label: '' } }), 'ghost');
});
