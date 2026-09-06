/// Presentation-only formatting matching app.js's two currency formatters
/// exactly (Milestone 6 Web-reference spec, app.js:2923/3311) — pure display
/// string construction, no rounding/business decision beyond the same
/// `Math.round` already used for on-screen display in the Web app.
///
/// [formatHomeCurrency]: unsigned "₪12,345" / "-₪500" — used for plain
/// balances/totals (hero, snapshot, tiles).
/// [formatSignedCurrency]: always-signed "+₪12,345" / "-₪500" — used only
/// for directional cash-flow events, so a positive amount is never
/// ambiguous with a plain balance.
library;

String formatHomeCurrency(num n) {
  final rounded = n.round();
  final grouped = _groupThousands(rounded.abs());
  return rounded < 0 ? '-₪$grouped' : '₪$grouped';
}

String formatSignedCurrency(num n) {
  final rounded = n.round();
  final grouped = _groupThousands(rounded.abs());
  return rounded < 0 ? '-₪$grouped' : '+₪$grouped';
}

String _groupThousands(int n) {
  final digits = n.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}
