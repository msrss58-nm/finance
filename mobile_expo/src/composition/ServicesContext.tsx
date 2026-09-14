import { createContext, useContext, type ReactNode } from 'react';

import type { AppServices, BootState } from './bootstrap.ts';

const BootContext = createContext<BootState>({ status: 'booting' });

export function BootProvider({ boot, children }: { boot: BootState; children: ReactNode }) {
  return <BootContext.Provider value={boot}>{children}</BootContext.Provider>;
}

export function useBootState(): BootState {
  return useContext(BootContext);
}

/**
 * Services for screens behind the security gate. Those screens only exist
 * once boot succeeded (the gate requires a resolved security state), so a
 * missing service here is a programming error, not a runtime condition.
 */
export function useServices(): AppServices {
  const boot = useContext(BootContext);
  if (boot.status !== 'ready') throw new Error('App services are not ready');
  return boot.services;
}
