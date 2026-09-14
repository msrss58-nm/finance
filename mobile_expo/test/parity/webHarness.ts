// Read-only Node VM harness around the UNMODIFIED Web app.js (approved
// decision H). app.js is loaded as-is into an isolated vm context with:
//   - a deterministic clock (Date subclass: `new Date()` / Date.now() = fixed),
//   - an in-memory localStorage seeded with synthetic fixtures only,
//   - a permissive DOM stub (every property/call resolves to a harmless stub),
//   - no timers, no network, no real DOM.
// Its top-level code then runs exactly as in a browser (load, auto-archive
// sweep, renders), and its global functions are called directly.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP_JS_URL = new URL('../../../app.js', import.meta.url);
let appScript: InstanceType<typeof vm.Script> | null = null;

function script(): InstanceType<typeof vm.Script> {
  if (appScript === null) appScript = new vm.Script(readFileSync(APP_JS_URL, 'utf8'), { filename: 'app.js' });
  return appScript;
}

export function appJsSource(): string {
  return readFileSync(APP_JS_URL, 'utf8');
}

export class MemoryStorage {
  readonly #map = new Map<string, string>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [k, v] of Object.entries(initial)) this.#map.set(k, v);
  }
  get length(): number {
    return this.#map.size;
  }
  key(i: number): string | null {
    return [...this.#map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    const key = String(k);
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.#map.set(String(k), String(v));
  }
  removeItem(k: string): void {
    this.#map.delete(String(k));
  }
  clear(): void {
    this.#map.clear();
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.#map);
  }
}

/** A stub that absorbs any property access, assignment, call or construction. */
function stub(): unknown {
  const store = new Map<PropertyKey, unknown>();
  const target = function stubTarget(): void {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return (hint: string) => (hint === 'number' ? 0 : '');
      if (prop === Symbol.iterator) return function* empty(): Generator<never> {};
      if (prop === 'then') return undefined;
      if (prop === 'length') return 0;
      if (store.has(prop)) return store.get(prop);
      const child = stub();
      store.set(prop, child);
      return child;
    },
    set(_t, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply() {
      return proxy;
    },
    construct() {
      return proxy as object;
    },
  });
  return proxy;
}

export type WebWorld = {
  /** The vm global: every app.js top-level `var`/function lives here. */
  readonly g: Record<string, unknown>;
  readonly storage: MemoryStorage;
  call(name: string, ...args: unknown[]): unknown;
  /** A Date created inside the vm realm (so app.js `instanceof Date` holds). */
  date(y: number, m: number, d?: number, h?: number, mi?: number): Date;
  /** Deep-copies a host value into the vm realm. */
  toVm(value: unknown): unknown;
  /** Evaluates an expression inside the vm realm (for intrinsics such as Math). */
  evaluate(expression: string): unknown;
  readonly alerts: string[];
  readonly reloads: { count: number };
};

export type LoadOptions = {
  readonly nowMs: number;
  readonly storage: Readonly<Record<string, string>>;
  /** The restore dialog's "also delete goals" checkbox (absent unless present:true). */
  readonly restoreCheckbox?: { readonly present: boolean; readonly checked: boolean };
};

export function loadWebApp(options: LoadOptions): WebWorld {
  const storage = new MemoryStorage(options.storage);
  const alerts: string[] = [];
  const reloads = { count: 0 };
  const checkbox = options.restoreCheckbox;
  const noop = (): void => undefined;

  const document = new Proxy(
    {
      getElementById(id: string): unknown {
        if (id === 'restore-delete-goals-checkbox') return checkbox && checkbox.present ? { checked: checkbox.checked } : null;
        return stub();
      },
    } as Record<string | symbol, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        const child = stub();
        target[prop] = child;
        return child;
      },
    },
  );

  const sandbox: Record<string, unknown> = {
    document,
    localStorage: storage,
    navigator: { standalone: false, userAgent: 'parity-harness' },
    history: { pushState: noop, replaceState: noop, back: noop, state: null },
    location: { reload: () => (reloads.count += 1), hash: '', href: 'about:blank' },
    console: { log: noop, warn: noop, error: noop, info: noop },
    alert: (msg: unknown) => alerts.push(String(msg)),
    confirm: () => false,
    prompt: () => null,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    getComputedStyle: () => stub(),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    Blob: function BlobStub(): void {},
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: noop },
    FileReader: function FileReaderStub(): void {},
    TextEncoder,
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) }, getRandomValues: (a: unknown) => a },
  };
  const context = vm.createContext(sandbox);
  sandbox.window = context;
  sandbox.self = context;

  // Deterministic clock, defined INSIDE the vm realm.
  new vm.Script(
    `(function (FIXED) {
      var RealDate = Date;
      class FakeDate extends RealDate {
        constructor(...args) { if (args.length === 0) { super(FIXED); } else { super(...args); } }
        static now() { return FIXED; }
      }
      globalThis.Date = FakeDate;
    })(${JSON.stringify(options.nowMs)});`,
    { filename: 'fake-date.js' },
  ).runInContext(context);

  script().runInContext(context);

  const g = context as Record<string, unknown>;
  const evaluate = (expression: string): unknown => new vm.Script(expression, { filename: 'harness-eval.js' }).runInContext(context);
  const vmJson = evaluate('JSON') as { parse(s: string): unknown };
  return {
    g,
    storage,
    alerts,
    reloads,
    call(name: string, ...args: unknown[]): unknown {
      const fn = g[name];
      if (typeof fn !== 'function') throw new Error(`app.js has no function ${name}`);
      return (fn as (...a: unknown[]) => unknown)(...args);
    },
    date(y: number, m: number, d = 1, h = 0, mi = 0): Date {
      const VmDate = g.Date as unknown as new (...a: number[]) => Date;
      return new VmDate(y, m, d, h, mi);
    },
    toVm(value: unknown): unknown {
      return value === undefined ? undefined : vmJson.parse(JSON.stringify(value));
    },
    evaluate,
  };
}

/** Canonical, realm-independent form for deep comparison (Dates -> {$date: ms}). */
export function canon(value: unknown): unknown {
  if (Object.prototype.toString.call(value) === '[object Date]') return { $date: (value as Date).getTime() };
  // Array.from (host realm), never value.map: a vm array's own map would build a vm-realm array.
  if (Array.isArray(value)) return Array.from(value as unknown[], canon);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) out[k] = canon((value as Record<string, unknown>)[k]);
    return out;
  }
  if (typeof value === 'function') return '[function]';
  return value;
}
