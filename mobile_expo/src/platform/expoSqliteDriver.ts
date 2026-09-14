// SqlDriver bound to expo-sqlite.

import * as SQLite from 'expo-sqlite';

import type { SqlDriver, SqlExecutor, SqlParam } from '../data/sql.ts';

type Queryable = Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

function executor(db: Queryable): SqlExecutor {
  return {
    getFirst<Row>(sql: string, params: readonly SqlParam[]): Promise<Row | null> {
      return db.getFirstAsync<Row>(sql, [...params]);
    },
    getAll<Row>(sql: string, params: readonly SqlParam[]): Promise<Row[]> {
      return db.getAllAsync<Row>(sql, [...params]);
    },
    async run(sql: string, params: readonly SqlParam[]): Promise<void> {
      await db.runAsync(sql, [...params]);
    },
  };
}

export async function openExpoSqliteDriver(databaseName: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await db.execAsync('PRAGMA journal_mode = WAL');
  return {
    ...executor(db),
    exec: (sql: string) => db.execAsync(sql),
    async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      // withExclusiveTransactionAsync: only queries made through `txn` belong
      // to the transaction; it commits when the task resolves and rolls back
      // when it rejects.
      const holder: { done: boolean; value: T | undefined } = { done: false, value: undefined };
      await db.withExclusiveTransactionAsync(async (txn) => {
        holder.value = await work(executor(txn));
        holder.done = true;
      });
      if (!holder.done) throw new Error('transaction completed without a result');
      return holder.value as T;
    },
    close: () => db.closeAsync(),
  };
}
