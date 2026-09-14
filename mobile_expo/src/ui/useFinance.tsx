// Screen-side access to the finance state: a gate that renders loading /
// failure states (never a fabricated figure), a write helper that prevents
// double submission, and a push that ignores rapid repeat taps (no duplicate
// history entries).

import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useServices } from '../composition/ServicesContext.tsx';
import type { FinanceSnapshot, WriteOutcome } from '../state/financeController.ts';
import { AppText, Btn } from './kit.tsx';
import { useTheme } from './theme.ts';
import { useStore } from './useStore.ts';

export function WithFinance({ children }: { children: (snapshot: FinanceSnapshot) => ReactNode }) {
  const { finance } = useServices();
  const state = useStore(finance.state);
  const t = useTheme();
  useFocusEffect(
    useCallback(() => {
      finance.tick();
    }, [finance]),
  );
  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg }} testID="finance-loading">
        <ActivityIndicator color={t.c.primary} />
      </View>
    );
  }
  if (state.status === 'failed') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: t.c.bg }} testID="finance-failed">
        <AppText tone="danger" center>
          {state.message}
        </AppText>
        <Btn label="ניסיון חוזר" onPress={() => void finance.refresh()} />
      </View>
    );
  }
  return <>{children(state)}</>;
}

export type FailedOutcome = Extract<WriteOutcome, { ok: false }>;

/** Runs one write at a time; exposes busy + the last failure. */
export function useWrite() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailedOutcome | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(async (action: () => Promise<WriteOutcome>): Promise<WriteOutcome | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const outcome = await action();
      if (!outcome.ok) setFailure(outcome);
      return outcome;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, failure, setFailure, run };
}

/** router.push that ignores a second tap within 700 ms (a double tap never stacks the same route twice). */
export function useSafePush(): (href: Href) => void {
  const router = useRouter();
  const last = useRef(0);
  return useCallback(
    (href: Href) => {
      const now = Date.now();
      if (now - last.current < 700) return;
      last.current = now;
      router.push(href);
    },
    [router],
  );
}

/** A single field error for a failed validation outcome (or null). */
export function fieldError(failure: FailedOutcome | null, field: string): string | null {
  if (!failure || failure.kind !== 'validation') return null;
  if (failure.fields[field]) return failure.fields[field] as string;
  return failure.field === field ? failure.message : null;
}
