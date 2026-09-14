// The narrow SQL seam the persistence layer is written against. Production
// binds it to expo-sqlite (src/platform/expoSqliteDriver.ts); the test suite
// binds it to Node's built-in node:sqlite, so the real SQL runs against a real
// SQLite engine in tests.

export type SqlParam = string | number | null;

export interface SqlExecutor {
  getFirst<Row>(sql: string, params: readonly SqlParam[]): Promise<Row | null>;
  getAll<Row>(sql: string, params: readonly SqlParam[]): Promise<Row[]>;
  run(sql: string, params: readonly SqlParam[]): Promise<void>;
}

export interface SqlDriver extends SqlExecutor {
  exec(sql: string): Promise<void>;
  /**
   * Runs `work` inside one exclusive SQLite transaction: COMMIT when it
   * resolves, ROLLBACK when it rejects (the rejection is re-thrown). Only
   * the executor handed to `work` participates in the transaction.
   */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
