import assert from 'node:assert/strict';
import test from 'node:test';

import { BIDI, isolate, ltr, rtl, stripIsolates } from '../src/core/bidi.ts';
import { formatAmount, formatSignedAmount } from '../src/core/currencyFormat.ts';
import { decodeUtf8Strict, isWellFormedUtf16, stripLeadingBom, utf8ByteLength } from '../src/core/utf8.ts';
import { seededRandom } from './support/fakes.ts';

const BOM = String.fromCharCode(0xfeff);
const LONE_HIGH = String.fromCharCode(0xd800);
const LONE_LOW = String.fromCharCode(0xdc00);

function referenceDecode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

test('strict UTF-8 decoder matches the WHATWG fatal decoder on valid text', () => {
  const samples = ['', 'abc', 'שלום עולם', '₪12,345', 'mixed עברית English 123', '💰🏦', `${BOM}bom`, 'x'.repeat(20_000) + 'ש'];
  const enc = new TextEncoder();
  for (const s of samples) assert.equal(decodeUtf8Strict(enc.encode(s)), s);
});

test('strict UTF-8 decoder agrees with the WHATWG fatal decoder on 20,000 random byte strings', () => {
  const rand = seededRandom(20260913);
  const biased = [0x00, 0x41, 0x7f, 0x80, 0xbf, 0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xed, 0xef, 0xf0, 0xf4, 0xf5, 0xff, 0xa0, 0x9f, 0x90, 0x8f];
  for (let n = 0; n < 20_000; n++) {
    const len = Math.floor(rand() * 8);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = rand() < 0.6 ? (biased[Math.floor(rand() * biased.length)] ?? 0) : Math.floor(rand() * 256);
    }
    assert.equal(decodeUtf8Strict(bytes), referenceDecode(bytes), `bytes=${[...bytes].join(',')}`);
  }
});

test('BOM: exactly one leading BOM is stripped', () => {
  assert.equal(stripLeadingBom(`${BOM}{}`), '{}');
  assert.equal(stripLeadingBom(`${BOM}${BOM}{}`), `${BOM}{}`);
  assert.equal(stripLeadingBom(`{}${BOM}`), `{}${BOM}`);
});

test('UTF-16 well-formedness and UTF-8 byte length', () => {
  assert.equal(isWellFormedUtf16('💰 ok'), true);
  assert.equal(isWellFormedUtf16(LONE_HIGH), false);
  assert.equal(isWellFormedUtf16(`a${LONE_LOW}`), false);
  assert.equal(isWellFormedUtf16(`${LONE_HIGH}${LONE_LOW}`), true);
  const enc = new TextEncoder();
  for (const s of ['', 'a', 'ש', '₪', '💰', 'שלום ₪ 💰 abc']) assert.equal(utf8ByteLength(s), enc.encode(s).length, s);
});

test('bidi isolates wrap and strip cleanly', () => {
  assert.deepEqual([BIDI.LRI, BIDI.RLI, BIDI.FSI, BIDI.PDI].map((c) => c.charCodeAt(0)), [0x2066, 0x2067, 0x2068, 0x2069]);
  assert.equal(ltr('-₪500'), `${BIDI.LRI}-₪500${BIDI.PDI}`);
  assert.equal(rtl('שלום'), `${BIDI.RLI}שלום${BIDI.PDI}`);
  assert.equal(isolate('x'), `${BIDI.FSI}x${BIDI.PDI}`);
  assert.equal(stripIsolates(`סכום ${ltr('-₪500')} ${isolate('abc')}`), 'סכום -₪500 abc');
});

test('currency display matches the Web formatters (Math.round, grouping, sign)', () => {
  const plain = (n: number) => stripIsolates(formatAmount(n));
  const signed = (n: number) => stripIsolates(formatSignedAmount(n));
  assert.equal(plain(12345.6), '₪12,346');
  assert.equal(plain(-500), '-₪500');
  assert.equal(plain(0), '₪0');
  assert.equal(plain(-0.4), '₪0');
  assert.equal(plain(999.5), '₪1,000');
  assert.equal(plain(-2.5), '-₪2', 'Math.round(-2.5) = -2 (Web behavior)');
  assert.equal(plain(1234567), '₪1,234,567');
  assert.equal(plain(100), '₪100');
  assert.equal(signed(5), '+₪5');
  assert.equal(signed(-5), '-₪5');
  assert.equal(signed(0), '+₪0');
  assert.ok(formatAmount(1).startsWith(BIDI.LRI) && formatAmount(1).endsWith(BIDI.PDI), 'amounts are LTR-isolated');
});
