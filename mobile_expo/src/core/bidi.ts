// Bidirectional-text helpers for a Hebrew-first RTL UI.
//
// Amounts, dates and Latin fragments embedded in Hebrew text must be wrapped
// in a Unicode *isolate* so the surrounding RTL paragraph cannot reorder
// their neutral characters (the minus sign, "+", "," and "₪"). Without an
// isolate "-₪500" can render as "₪500-" inside an RTL line. Isolates
// (U+2066..U+2069) are supported by Android's and iOS's text stacks.
//
// The control characters are built from code points on purpose: invisible
// characters must never appear literally in source files.

export const BIDI = {
  /** U+2066 LEFT-TO-RIGHT ISOLATE */
  LRI: String.fromCharCode(0x2066),
  /** U+2067 RIGHT-TO-LEFT ISOLATE */
  RLI: String.fromCharCode(0x2067),
  /** U+2068 FIRST STRONG ISOLATE */
  FSI: String.fromCharCode(0x2068),
  /** U+2069 POP DIRECTIONAL ISOLATE */
  PDI: String.fromCharCode(0x2069),
} as const;

const ISOLATE_CONTROLS = new RegExp(`[${BIDI.LRI}${BIDI.RLI}${BIDI.FSI}${BIDI.PDI}]`, 'g');

/** Left-to-right isolate: numbers, amounts, dates, codes. */
export function ltr(text: string): string {
  return BIDI.LRI + text + BIDI.PDI;
}

/** Right-to-left isolate: Hebrew fragments inside LTR text. */
export function rtl(text: string): string {
  return BIDI.RLI + text + BIDI.PDI;
}

/** First-strong isolate: user-provided text of unknown direction. */
export function isolate(text: string): string {
  return BIDI.FSI + text + BIDI.PDI;
}

/** Removes isolate controls (for comparisons and accessibility labels). */
export function stripIsolates(text: string): string {
  return text.replace(ISOLATE_CONTROLS, '');
}
