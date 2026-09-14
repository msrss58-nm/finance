// Persistence self-test, runnable against ANY KeyValueStore: the unit tests
// run it on node:sqlite, the diagnostics screen runs it on the device's real
// expo-sqlite database. It only touches its own ff_selftest_* keys (never a
// family_finance_* key) and removes them when it finishes.

import type { KeyValueStore } from './keyValueStore.ts';

export type SelfTestCheck = { readonly name: string; readonly pass: boolean };

const P = 'ff_selftest_';

/** Raw values whose exact text a JSON round trip would NOT preserve. */
export const RAW_STRING_FIXTURES: readonly string[] = [
  '{"amount":1.0}',
  '{"big":1e21}',
  '{"b":2,"a":1}',
  '{ "spaced" :\n\t[ 1 , 2 ] }',
  '{"unsafe":9007199254740993}',
  '{"he":"שלום ₪","mixed":"abc 123 אבג","emoji":"💰"}',
  '',
  'not json at all',
];

class InjectedFailure extends Error {
  constructor() {
    super('injected self-test failure');
    this.name = 'InjectedFailure';
  }
}

async function cleanup(store: KeyValueStore): Promise<void> {
  for (const key of await store.keys()) {
    if (key.startsWith(P)) await store.remove(key);
  }
}

export async function runPersistenceSelfTest(store: KeyValueStore): Promise<SelfTestCheck[]> {
  const checks: SelfTestCheck[] = [];
  const check = (name: string, pass: boolean): void => {
    checks.push({ name, pass });
  };

  await cleanup(store);
  try {
    // Raw-string exactness.
    await store.transaction(async (tx) => {
      for (const [i, v] of RAW_STRING_FIXTURES.entries()) await tx.set(`${P}raw_${i}`, v);
    });
    let exact = true;
    for (const [i, v] of RAW_STRING_FIXTURES.entries()) {
      if ((await store.get(`${P}raw_${i}`)) !== v) exact = false;
    }
    check('raw strings byte-exact', exact);

    // Commit.
    await store.transaction(async (tx) => {
      await tx.set(`${P}c1`, 'one');
      await tx.set(`${P}c2`, 'two');
    });
    check('transaction commit', (await store.get(`${P}c1`)) === 'one' && (await store.get(`${P}c2`)) === 'two');

    // Rollback: a failure after two writes leaves nothing partial behind.
    await store.set(`${P}rb`, 'before');
    let threw = false;
    try {
      await store.transaction(async (tx) => {
        await tx.set(`${P}rb`, 'during');
        await tx.set(`${P}rb_new`, 'partial');
        throw new InjectedFailure();
      });
    } catch (e) {
      threw = e instanceof InjectedFailure;
    }
    check(
      'transaction rollback',
      threw && (await store.get(`${P}rb`)) === 'before' && (await store.get(`${P}rb_new`)) === null,
    );

    // Deterministic enumeration.
    const a = (await store.keys()).filter((k) => k.startsWith(P));
    const b = (await store.keys()).filter((k) => k.startsWith(P));
    check('deterministic enumeration', a.length > 0 && a.join('\n') === b.join('\n'));

    // Remove.
    await store.remove(`${P}c1`);
    check('remove', (await store.get(`${P}c1`)) === null);
  } finally {
    await cleanup(store);
  }
  check('cleanup', (await store.keys()).every((k) => !k.startsWith(P)));
  return checks;
}
