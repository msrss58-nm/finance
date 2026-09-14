// SqlDriver over Node's built-in node:sqlite — a real SQLite engine for the
// persistence tests. Supports fault injection by SQL text.

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SqlDriver, SqlExecutor, SqlParam } from '../../src/data/sql.ts';

export type FaultPlan = { readonly failWhen?: (sql: string) => boolean };

export class InjectedDriverFailure extends Error {
  constructor() {
    super('injected driver failure: secret-value-must-not-leak');
    this.name = 'InjectedDriverFailure';
  }
}

export function createNodeSqliteDriver(path: string = ':memory:', faults: FaultPlan = {}): SqlDriver {
  const db = new DatabaseSync(path);
  const check = (sql: string): void => {
    if (faults.failWhen?.(sql)) throw new InjectedDriverFailure();
  };
  const bind = (params: readonly SqlParam[]): SQLInputValue[] => [...params];

  const executor: SqlExecutor = {
    async getFirst<Row>(sql: string, params: readonly SqlParam[]): Promise<Row | null> {
      check(sql);
      return (db.prepare(sql).get(...bind(params)) ?? null) as Row | null;
    },
    async getAll<Row>(sql: string, params: readonly SqlParam[]): Promise<Row[]> {
      check(sql);
      return db.prepare(sql).all(...bind(params)) as Row[];
    },
    async run(sql: string, params: readonly SqlParam[]): Promise<void> {
      check(sql);
      db.prepare(sql).run(...bind(params));
    },
  };

  let queue: Promise<unknown> = Promise.resolve();

  return {
    ...executor,
    async exec(sql: string): Promise<void> {
      check(sql);
      db.exec(sql);
    },
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        check('BEGIN');
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await work(executor);
          check('COMMIT');
          db.exec('COMMIT');
          return result;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
