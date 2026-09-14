// Minimal type declarations for the Node built-ins the test suite uses, so
// tests are type-checked (npm run typecheck) without adding @types/node.
// Only the members actually used are declared.

declare module 'node:test' {
  type TestFn = () => void | Promise<void>;
  function test(name: string, fn: TestFn): Promise<void>;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(value: string, pattern: RegExp, message?: string): void;
    doesNotMatch(value: string, pattern: RegExp, message?: string): void;
    rejects(block: Promise<unknown> | (() => Promise<unknown>), error?: unknown, message?: string): Promise<void>;
    throws(block: () => unknown, error?: unknown, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export interface StatementSync {
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined;
    all(...params: SQLInputValue[]): Record<string, unknown>[];
    run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:module' {
  export function createRequire(url: string): (id: string) => unknown;
}

declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}
