// Strict UTF-8 / UTF-16 helpers. Pure — no platform APIs, so the same code
// runs under Hermes and under Node's test runner.

/**
 * Decodes UTF-8 strictly. Returns `null` for any malformed input (overlong
 * forms, surrogate code points, truncated sequences, bytes > U+10FFFF) —
 * never silently substitutes U+FFFD. Mirrors the Flutter oracle's
 * `utf8.decode` rejection behavior for imported files.
 */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  const parts: string[] = [];
  const units: number[] = [];
  const n = bytes.length;
  const at = (i: number): number => (i < n ? (bytes[i] ?? -1) : -1);
  const cont = (b: number): boolean => b >= 0x80 && b <= 0xbf;
  let i = 0;
  while (i < n) {
    const b0 = at(i);
    if (b0 < 0x80) {
      units.push(b0);
      i += 1;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      const b1 = at(i + 1);
      if (!cont(b1)) return null;
      units.push(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      const b1 = at(i + 1);
      const b2 = at(i + 2);
      const lo = b0 === 0xe0 ? 0xa0 : 0x80;
      const hi = b0 === 0xed ? 0x9f : 0xbf;
      if (b1 < lo || b1 > hi || !cont(b2)) return null;
      units.push(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      const b1 = at(i + 1);
      const b2 = at(i + 2);
      const b3 = at(i + 3);
      const lo = b0 === 0xf0 ? 0x90 : 0x80;
      const hi = b0 === 0xf4 ? 0x8f : 0xbf;
      if (b1 < lo || b1 > hi || !cont(b2) || !cont(b3)) return null;
      const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      const v = cp - 0x10000;
      units.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
      i += 4;
    } else {
      return null;
    }
    if (units.length >= 8192) {
      parts.push(String.fromCharCode(...units));
      units.length = 0;
    }
  }
  if (units.length > 0) parts.push(String.fromCharCode(...units));
  return parts.join('');
}

/** Strips exactly one leading U+FEFF — ordinary text decoding, not repair. */
export function stripLeadingBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * True when the string contains no unpaired UTF-16 surrogate. SQLite TEXT is
 * stored as UTF-8, which cannot represent a lone surrogate, so persistence
 * refuses such values instead of silently altering them.
 */
export function isWellFormedUtf16(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** UTF-8 byte length of a well-formed string. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}
