// Notification tap -> deferred navigation intent (pure).

import { isTabScreen } from '../navigation/routes.ts';
import type { NavigationIntent, PendingNavigation } from '../navigation/pendingNavigation.ts';
import type { NotificationTap } from './notificationGateway.ts';

/**
 * Whitelist parse of notification data. Anything unexpected — including data
 * from a notification this app did not create — navigates nowhere.
 */
export function intentFromNotificationData(data: unknown): NavigationIntent | null {
  if (typeof data !== 'object' || data === null) return null;
  const route = (data as Record<string, unknown>).ffRoute;
  return isTabScreen(route) ? { screen: route, source: 'notification' } : null;
}

/**
 * Routes taps into PendingNavigation, once per tap. On a cold start the same
 * tap can arrive twice (launch response + listener); the key de-duplicates.
 */
export class NotificationTapRouter {
  readonly #navigation: PendingNavigation;
  readonly #seen = new Set<string>();

  constructor(navigation: PendingNavigation) {
    this.#navigation = navigation;
  }

  handle(tap: NotificationTap): boolean {
    if (this.#seen.has(tap.key)) return false;
    this.#seen.add(tap.key);
    const intent = intentFromNotificationData(tap.data);
    if (intent === null) return false;
    this.#navigation.offer(intent);
    return true;
  }
}
