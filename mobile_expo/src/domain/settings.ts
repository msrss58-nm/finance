// family_finance_settings — ported from app.js getDefaultAppSettings() /
// loadAppSettings() / getProjectedBalanceOpeningConfig() /
// saveProjectedBalanceOpening().
//
// The merged view below is exactly what the Web app computes in memory. The
// stored raw value is kept separately by the repository and is never
// re-serialised from this view (the Web app's save would drop unknown top-level
// keys; Expo preserves them — see familyFinanceRepository.ts).

import { isValidDateStr } from './dates.ts';
import { round2 } from './numbers.ts';
import { isPlainObject, type RawItem } from './raw.ts';

export type NotificationFlags = { upcomingPayment: boolean; upcomingIncome: boolean; completedObligation: boolean };

export type AppSettingsView = {
  theme: unknown;
  primaryColor: unknown;
  fontSize: unknown;
  /** Legacy Web PIN hash — inert data. Never read for authentication. */
  pinHash: unknown;
  pinEnabled: unknown;
  autoLockMinutes: unknown;
  /** Retired, read-only placeholders — never used in any calculation. */
  currentBalance: unknown;
  anchorBalance: unknown;
  anchorDate: unknown;
  projectedBalanceOpeningAmount: unknown;
  projectedBalanceOpeningDate: unknown;
  /** null = never captured (legacy); [] = captured, zero withdrawals. Distinct on purpose. */
  projectedBalanceOpeningIncludedWithdrawalIds: unknown;
  notifications: NotificationFlags;
  experimentalFlags: unknown;
  creditCardSettlementUpdatedAt: unknown;
};

export function getDefaultAppSettings(): AppSettingsView {
  return {
    theme: 'system',
    primaryColor: 'green',
    fontSize: 'medium',
    pinHash: null,
    pinEnabled: false,
    autoLockMinutes: null,
    currentBalance: null,
    anchorBalance: null,
    anchorDate: null,
    projectedBalanceOpeningAmount: null,
    projectedBalanceOpeningDate: null,
    projectedBalanceOpeningIncludedWithdrawalIds: null,
    notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: true },
    experimentalFlags: {},
    creditCardSettlementUpdatedAt: null,
  };
}

/** app.js loadAppSettings() (without the storage read). */
export function mergeAppSettings(raw: string | null): AppSettingsView {
  const defaults = getDefaultAppSettings();
  if (!raw) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
  const source = parsed as Record<string, unknown>;
  const merged = getDefaultAppSettings() as unknown as Record<string, unknown>;
  for (const k in merged) {
    if (k === 'notifications' || k === 'experimentalFlags') continue;
    if (source[k] !== undefined && source[k] !== null) merged[k] = source[k];
  }
  const notifications = (merged as unknown as AppSettingsView).notifications as unknown as Record<string, boolean>;
  if (source.notifications && typeof source.notifications === 'object') {
    const incoming = source.notifications as Record<string, unknown>;
    for (const nk in notifications) {
      if (incoming[nk] !== undefined) notifications[nk] = !!incoming[nk];
    }
  }
  if (isPlainObject(source.experimentalFlags)) merged.experimentalFlags = source.experimentalFlags;
  return merged as unknown as AppSettingsView;
}

export type OpeningBalanceConfig = {
  readonly amount: number;
  readonly dateStr: string;
  readonly includedWithdrawalIds: readonly number[] | null;
};

/**
 * app.js getProjectedBalanceOpeningConfig(): strict, all-or-nothing. A
 * malformed amount/date is "unconfigured" (null) — never coerced, never 0.
 */
export function getProjectedBalanceOpeningConfig(
  settings: Pick<AppSettingsView, 'projectedBalanceOpeningAmount' | 'projectedBalanceOpeningDate' | 'projectedBalanceOpeningIncludedWithdrawalIds'>,
): OpeningBalanceConfig | null {
  const amt = settings.projectedBalanceOpeningAmount;
  const dateStr = settings.projectedBalanceOpeningDate;
  if (typeof amt !== 'number' || !isFinite(amt)) return null;
  if (!isValidDateStr(dateStr)) return null;
  const rawIncluded = settings.projectedBalanceOpeningIncludedWithdrawalIds;
  let includedWithdrawalIds: number[] | null = null;
  if (Array.isArray(rawIncluded)) {
    includedWithdrawalIds = rawIncluded.filter((x): x is number => typeof x === 'number' && isFinite(x));
  }
  return { amount: round2(amt), dateStr: dateStr as string, includedWithdrawalIds };
}

export type OpeningBalanceWrite = {
  readonly projectedBalanceOpeningAmount: number;
  readonly projectedBalanceOpeningDate: string;
  readonly projectedBalanceOpeningIncludedWithdrawalIds: unknown[];
};

/**
 * The pure half of app.js saveProjectedBalanceOpening(): the three fields are
 * always written together, and the withdrawal snapshot is rebuilt fresh from
 * every non-archived cash withdrawal dated exactly on `dateStr`. null = invalid input.
 */
export function computeOpeningBalanceWrite(amount: number, dateStr: string, items: readonly RawItem[]): OpeningBalanceWrite | null {
  if (typeof amount !== 'number' || !isFinite(amount)) return null;
  if (!isValidDateStr(dateStr)) return null;
  const includedIds: unknown[] = [];
  for (const it of items) {
    if (it.type === 'cashWithdrawal' && it.start === dateStr && !it.isArchived) includedIds.push(it.id);
  }
  return {
    projectedBalanceOpeningAmount: round2(amount),
    projectedBalanceOpeningDate: dateStr,
    projectedBalanceOpeningIncludedWithdrawalIds: includedIds,
  };
}
