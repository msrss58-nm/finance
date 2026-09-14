// Number semantics ported verbatim from app.js. This is JavaScript on both
// sides, so Math.round (half rounds toward +Infinity: 2.5 -> 3, -2.5 -> -2,
// -0.5 -> -0) and IEEE-754 float arithmetic are identical by construction.

/** app.js round2(): 2-decimal rounding with the Number.EPSILON nudge. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type LoanSplitDisplay = { readonly bank: number; readonly payroll: number; readonly total: number };

/**
 * app.js roundLoanSplitForDisplay(): largest-remainder apportionment so the two
 * displayed integers always sum to Math.round(bank + payroll). Display only.
 */
export function roundLoanSplitForDisplay(bank: number, payroll: number): LoanSplitDisplay {
  const floorBank = Math.floor(bank);
  const floorPayroll = Math.floor(payroll);
  const roundedTotal = Math.round(bank + payroll);
  const remainder = roundedTotal - (floorBank + floorPayroll);
  const candidates = [
    { key: 'bank', frac: bank - floorBank },
    { key: 'payroll', frac: payroll - floorPayroll },
  ];
  candidates.sort((x, y) => y.frac - x.frac);
  let displayBank = floorBank;
  let displayPayroll = floorPayroll;
  for (let i = 0; i < candidates.length && i < remainder; i++) {
    if (candidates[i]?.key === 'bank') displayBank++;
    else displayPayroll++;
  }
  return { bank: displayBank, payroll: displayPayroll, total: roundedTotal };
}
