import { useEffect, useRef, useState } from 'react';

import { bootstrap, type BootState } from './bootstrap.ts';

/** Runs the composition root once per mounted root layout (StrictMode-safe). */
export function useBoot(): BootState {
  const [state, setState] = useState<BootState>({ status: 'booting' });
  const started = useRef<Promise<BootState> | null>(null);

  useEffect(() => {
    let active = true;
    if (started.current === null) started.current = bootstrap();
    void started.current.then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
