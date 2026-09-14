// Synthetic Stage 1 export content. NOT the backup format (the backup
// contract — schemaVersion 2 envelope — is ported in a later stage). Fixed
// text, so an import can be compared byte-for-byte with what was exported.

export const FOUNDATION_EXPORT_TEXT = `${JSON.stringify(
  {
    kind: 'familyfinance-foundation-test',
    synthetic: true,
    sample: 'שלום עולם ₪1,234 abc 123 💰',
    numbers: 'raw text 1.0 and 1e21 must survive',
  },
  null,
  2,
)}\n`;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function foundationExportFileName(now: Date): string {
  return `familyfinance-foundation-test-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
