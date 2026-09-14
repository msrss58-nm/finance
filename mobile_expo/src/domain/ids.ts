// Identifiers for new records.

import type { RawItem } from './raw.ts';

/**
 * app.js generateCashWithdrawalId(): Date.now(), incremented past every
 * existing item id (of any type). Used here for EVERY new item: the Web keeps
 * plain Date.now() for the other types, so a same-millisecond double submit
 * could collide there. Same numeric shape, never a collision.
 */
export function nextItemId(items: readonly RawItem[], nowMs: number): number {
  const taken = new Set<unknown>();
  for (const it of items) if (it && typeof it === 'object') taken.add(it.id);
  let id = Math.floor(nowMs);
  while (taken.has(id)) id++;
  return id;
}

export type GoalIdPrefix = 'goal' | 'comp' | 'ct';

/**
 * app.js generateGoalsId(prefix): `${prefix}_${Date.now()}_${counter}`. One
 * generator per app run (owned by the composition root); `taken` makes a
 * collision with an existing id impossible even across restarts.
 */
export class GoalIdGenerator {
  #counter = 0;

  next(prefix: GoalIdPrefix, nowMs: number, taken: ReadonlySet<string> = new Set()): string {
    let id: string;
    do {
      this.#counter += 1;
      id = `${prefix}_${Math.floor(nowMs)}_${this.#counter}`;
    } while (taken.has(id));
    return id;
  }
}
