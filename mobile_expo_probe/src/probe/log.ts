// Stage 0 probe logger. Every line goes to the JS console (visible in
// `adb logcat -s ReactNativeJS` on Android) with a stable "[PROBE]" prefix so
// evidence can be collected without screenshots. Never log secrets.

export type ProbeResult = {
  area: string;
  name: string;
  ok: boolean;
  detail: string;
  at: string;
};

let snapshot: readonly ProbeResult[] = [];
const listeners = new Set<() => void>();

export function record(area: string, name: string, ok: boolean, detail = ''): void {
  const r: ProbeResult = { area, name, ok, detail, at: new Date().toISOString() };
  snapshot = [...snapshot.slice(-199), r];
  console.log(`[PROBE] ${ok ? 'PASS' : 'FAIL'} ${area}/${name} ${detail}`);
  listeners.forEach((l) => l());
}

export function note(area: string, message: string): void {
  console.log(`[PROBE] INFO ${area} ${message}`);
}

export function getResultsSnapshot(): readonly ProbeResult[] {
  return snapshot;
}

export function subscribeResults(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
