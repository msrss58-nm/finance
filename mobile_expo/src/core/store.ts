// Minimal observable value. Stores are created and owned by the composition
// root (src/composition/bootstrap.ts) — there are no module-level singletons — and
// React reads them through useSyncExternalStore (src/ui/useStore.ts).

export type Listener = () => void;

export interface ReadableStore<T> {
  get(): T;
  subscribe(listener: Listener): () => void;
}

export interface Store<T> extends ReadableStore<T> {
  set(next: T): void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A store that never changes — used before services exist. */
export function constantStore<T>(value: T): ReadableStore<T> {
  return { get: () => value, subscribe: () => () => undefined };
}
