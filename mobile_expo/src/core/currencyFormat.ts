// Presentation-only currency strings, matching the Web app's two display
// formatters (the authoritative reference; also ported by the Flutter oracle
// in lib/app/format/currency_format.dart):
//   unsigned: "₪12,345" / "-₪500"   (balances, totals)
//   signed:   "+₪12,345" / "-₪500"  (directional cash-flow events)
//
// Rounding uses JavaScript Math.round, exactly like app.js. (Dart's
// num.round() rounds .5 away from zero, so the oracle differs from the Web for
// negative half values such as -2.5; the Web is authoritative.)
//
// The returned string is wrapped in an LTR isolate so it renders correctly
// inside Hebrew text; use stripIsolates() to compare raw text.

import { ltr } from './bidi.ts';

function groupThousands(n: number): string {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

function roundedParts(n: number): { negative: boolean; grouped: string } {
  const rounded = Math.round(n);
  return { negative: rounded < 0, grouped: groupThousands(Math.abs(rounded)) };
}

export function formatAmount(n: number): string {
  const { negative, grouped } = roundedParts(n);
  return ltr(negative ? `-₪${grouped}` : `₪${grouped}`);
}

export function formatSignedAmount(n: number): string {
  const { negative, grouped } = roundedParts(n);
  return ltr(negative ? `-₪${grouped}` : `+₪${grouped}`);
}
