// Deferred navigation intents (notification taps, "return to Settings" after a
// file operation). They are parked here — outside every screen — and only
// taken by the tab shell, which exists only while the security gate allows
// sensitive content. So an intent that arrives while locked waits for the
// unlock, and is consumed exactly once.

import { createStore, type ReadableStore } from '../core/store.ts';
import type { TabScreen } from './routes.ts';

export type NavigationIntentSource = 'notification' | 'fileOperation';
export type NavigationIntent = { readonly screen: TabScreen; readonly source: NavigationIntentSource };

/** A file operation the user is actively waiting on outranks a notification tap. */
const PRIORITY: Record<NavigationIntentSource, number> = { notification: 1, fileOperation: 2 };

export class PendingNavigation {
  readonly #pending = createStore<NavigationIntent | null>(null);

  get pending(): ReadableStore<NavigationIntent | null> {
    return this.#pending;
  }

  offer(intent: NavigationIntent): void {
    const current = this.#pending.get();
    if (current === null || PRIORITY[intent.source] >= PRIORITY[current.source]) this.#pending.set(intent);
  }

  /** Takes (and clears) the intent — only when sensitive content is allowed. */
  take(allowed: boolean): NavigationIntent | null {
    if (!allowed) return null;
    const intent = this.#pending.get();
    this.#pending.set(null);
    return intent;
  }
}
