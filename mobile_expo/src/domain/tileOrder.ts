// Home category tiles — app.js loadCategoryTileOrder(),
// reconcileCategoryTileOrder(), getHomeTileDisplayLabel().
//
// The order lives in family_finance_category_tile_order. Reconciliation is
// deterministic from (stored order, category config), so Expo computes it on
// read and persists an order only when the user actually reorders — the Web
// also rewrites the reconciled order during render, which changes nothing on
// screen.

import type { CategoryConfig } from './categoryConfig.ts';
import { isPlainObject } from './raw.ts';

/** app.js loadCategoryTileOrder(): anything but a JSON array is []. */
export function parseTileOrder(raw: string | null): unknown[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * app.js reconcileCategoryTileOrder(): stored keys that still exist (first
 * occurrence only), then any config key not yet placed, in config order.
 * 'income' never gets a Home tile (the snapshot cards already show income).
 */
export function reconcileTileOrder(storedRaw: string | null, categoryConfig: CategoryConfig): string[] {
  const stored = parseTileOrder(storedRaw);
  const validKeys = Object.keys(categoryConfig).filter((k) => k !== 'income');
  const valid = new Set(validKeys);
  const seen = new Set<string>();
  const reconciled: string[] = [];
  for (const k of stored) {
    if (typeof k === 'string' && valid.has(k) && !seen.has(k)) {
      reconciled.push(k);
      seen.add(k);
    }
  }
  for (const k of validKeys) {
    if (!seen.has(k)) {
      reconciled.push(k);
      seen.add(k);
    }
  }
  return reconciled;
}

/** Moves `key` one step (delta -1 = earlier, +1 = later). Unknown key or edge: unchanged copy. */
export function moveTileKey(order: readonly string[], key: string, delta: -1 | 1): string[] {
  const out = order.slice();
  const from = out.indexOf(key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= out.length) return out;
  out.splice(from, 1);
  out.splice(to, 0, key);
  return out;
}

/**
 * Unicode Extended_Pictographic (Unicode 17.0), as ranges. Hand-written
 * instead of the Web's /\p{Extended_Pictographic}/u because the app's JS
 * engine is not guaranteed to support Unicode property escapes;
 * test/domain/tileOrder.test.ts compares this table with the regex over every
 * code point. Every emoji the app itself puts in a label (the built-in
 * categories and pickEmojiForCategory()) is pictographic in every Unicode
 * version, so older browser data cannot change a displayed label.
 */
const PICTOGRAPHIC_RANGES: readonly (readonly [number, number])[] = [
  [0xa9, 0xa9], [0xae, 0xae], [0x203c, 0x203c], [0x2049, 0x2049], [0x2122, 0x2122], [0x2139, 0x2139], [0x2194, 0x2199],
  [0x21a9, 0x21aa], [0x231a, 0x231b], [0x2328, 0x2328], [0x23cf, 0x23cf], [0x23e9, 0x23f3], [0x23f8, 0x23fa], [0x24c2, 0x24c2],
  [0x25aa, 0x25ab], [0x25b6, 0x25b6], [0x25c0, 0x25c0], [0x25fb, 0x25fe], [0x2600, 0x2604], [0x260e, 0x260e], [0x2611, 0x2611],
  [0x2614, 0x2615], [0x2618, 0x2618], [0x261d, 0x261d], [0x2620, 0x2620], [0x2622, 0x2623], [0x2626, 0x2626], [0x262a, 0x262a],
  [0x262e, 0x262f], [0x2638, 0x263a], [0x2640, 0x2640], [0x2642, 0x2642], [0x2648, 0x2653], [0x265f, 0x2660], [0x2663, 0x2663],
  [0x2665, 0x2666], [0x2668, 0x2668], [0x267b, 0x267b], [0x267e, 0x267f], [0x2692, 0x2697], [0x2699, 0x2699], [0x269b, 0x269c],
  [0x26a0, 0x26a1], [0x26a7, 0x26a7], [0x26aa, 0x26ab], [0x26b0, 0x26b1], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26c8, 0x26c8],
  [0x26ce, 0x26cf], [0x26d1, 0x26d1], [0x26d3, 0x26d4], [0x26e9, 0x26ea], [0x26f0, 0x26f5], [0x26f7, 0x26fa], [0x26fd, 0x26fd],
  [0x2702, 0x2702], [0x2705, 0x2705], [0x2708, 0x270d], [0x270f, 0x270f], [0x2712, 0x2712], [0x2714, 0x2714], [0x2716, 0x2716],
  [0x271d, 0x271d], [0x2721, 0x2721], [0x2728, 0x2728], [0x2733, 0x2734], [0x2744, 0x2744], [0x2747, 0x2747], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2763, 0x2764], [0x2795, 0x2797], [0x27a1, 0x27a1], [0x27b0, 0x27b0],
  [0x27bf, 0x27bf], [0x2934, 0x2935], [0x2b05, 0x2b07], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x3030, 0x3030],
  [0x303d, 0x303d], [0x3297, 0x3297], [0x3299, 0x3299], [0x1f004, 0x1f004], [0x1f02c, 0x1f02f], [0x1f094, 0x1f09f], [0x1f0af, 0x1f0b0],
  [0x1f0c0, 0x1f0c0], [0x1f0cf, 0x1f0d0], [0x1f0f6, 0x1f0ff], [0x1f170, 0x1f171], [0x1f17e, 0x1f17f], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a],
  [0x1f1ae, 0x1f1e5], [0x1f201, 0x1f20f], [0x1f21a, 0x1f21a], [0x1f22f, 0x1f22f], [0x1f232, 0x1f23a], [0x1f23c, 0x1f23f], [0x1f249, 0x1f25f],
  [0x1f266, 0x1f321], [0x1f324, 0x1f393], [0x1f396, 0x1f397], [0x1f399, 0x1f39b], [0x1f39e, 0x1f3f0], [0x1f3f3, 0x1f3f5], [0x1f3f7, 0x1f3fa],
  [0x1f400, 0x1f4fd], [0x1f4ff, 0x1f53d], [0x1f549, 0x1f54e], [0x1f550, 0x1f567], [0x1f56f, 0x1f570], [0x1f573, 0x1f57a], [0x1f587, 0x1f587],
  [0x1f58a, 0x1f58d], [0x1f590, 0x1f590], [0x1f595, 0x1f596], [0x1f5a4, 0x1f5a5], [0x1f5a8, 0x1f5a8], [0x1f5b1, 0x1f5b2], [0x1f5bc, 0x1f5bc],
  [0x1f5c2, 0x1f5c4], [0x1f5d1, 0x1f5d3], [0x1f5dc, 0x1f5de], [0x1f5e1, 0x1f5e1], [0x1f5e3, 0x1f5e3], [0x1f5e8, 0x1f5e8], [0x1f5ef, 0x1f5ef],
  [0x1f5f3, 0x1f5f3], [0x1f5fa, 0x1f64f], [0x1f680, 0x1f6c5], [0x1f6cb, 0x1f6d2], [0x1f6d5, 0x1f6e5], [0x1f6e9, 0x1f6e9], [0x1f6eb, 0x1f6f0],
  [0x1f6f3, 0x1f6ff], [0x1f7da, 0x1f7ff], [0x1f80c, 0x1f80f], [0x1f848, 0x1f84f], [0x1f85a, 0x1f85f], [0x1f888, 0x1f88f], [0x1f8ae, 0x1f8af],
  [0x1f8bc, 0x1f8bf], [0x1f8c2, 0x1f8cf], [0x1f8d9, 0x1f8ff], [0x1f90c, 0x1f93a], [0x1f93c, 0x1f945], [0x1f947, 0x1f9ff], [0x1fa58, 0x1fa5f],
  [0x1fa6e, 0x1faff], [0x1fc00, 0x1fffd],
];

export function isExtendedPictographic(cp: number): boolean {
  for (const [lo, hi] of PICTOGRAPHIC_RANGES) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

/** JavaScript's \s set. */
function isJsWhitespace(cp: number): boolean {
  return (
    cp === 0x09 || cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x0d || cp === 0x20 || cp === 0xa0 || cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x2029 || cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0xfeff
  );
}

/** app.js HOME_TILE_LEADING_EMOJI_RE replace: a leading pictographic/ZWJ/VS16 run, then its trailing whitespace. */
export function stripLeadingEmoji(label: string): string {
  let i = 0;
  while (i < label.length) {
    const cp = label.codePointAt(i) as number;
    if (!(isExtendedPictographic(cp) || cp === 0x200d || cp === 0xfe0f)) break;
    i += cp > 0xffff ? 2 : 1;
  }
  if (i === 0) return label;
  while (i < label.length && isJsWhitespace(label.charCodeAt(i))) i++;
  return label.slice(i);
}

/** app.js HOME_TILE_LABEL_OVERRIDE_BY_KEY (display text only). */
export const HOME_TILE_LABEL_OVERRIDE_BY_KEY: Readonly<Record<string, string>> = {
  variable: 'תשלומים החודש',
  loan: 'תשלומי הלוואות החודש',
};

/** app.js getHomeTileDisplayLabel(). */
export function homeTileDisplayLabel(key: string, categoryConfig: CategoryConfig): string {
  const override = HOME_TILE_LABEL_OVERRIDE_BY_KEY[key];
  if (override) return override;
  const cfg = categoryConfig[key];
  const label = isPlainObject(cfg) && typeof cfg.label === 'string' && cfg.label ? cfg.label : key;
  return stripLeadingEmoji(label);
}
