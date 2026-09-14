// Local-notification boundary (Stage 1 foundation). Knows about scheduling,
// permission and taps — nothing about Goals, finance or security state.
// LOCAL ONLY: there is no push token, no FCM/APNs registration, no server.

import type { Result } from '../core/result.ts';
import type { TabScreen } from '../navigation/routes.ts';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export type NotificationFailureKind = 'init' | 'permission' | 'schedule' | 'cancel' | 'query';
export type NotificationFailure = { readonly kind: NotificationFailureKind; readonly causeType?: string };

/** Every notification id this app may create or cancel. Nothing else is ever touched. */
export const OWNED_NOTIFICATION_IDS = {
  foundationTest: 'ff-foundation-test',
} as const;
export type OwnedNotificationId = (typeof OWNED_NOTIFICATION_IDS)[keyof typeof OWNED_NOTIFICATION_IDS];
export const ALL_OWNED_NOTIFICATION_IDS: readonly OwnedNotificationId[] = Object.values(OWNED_NOTIFICATION_IDS);

/** The only data a notification carries: where to go after unlock. No financial data. */
export type NotificationPayload = { readonly ffRoute: TabScreen };

export type LocalNotificationRequest = {
  readonly id: OwnedNotificationId;
  /** Generic text only — it is visible on the lock screen. */
  readonly title: string;
  readonly body: string;
  readonly at: Date;
  readonly payload: NotificationPayload;
};

/** A tap on one of our notifications; `key` identifies the tap for de-duplication. */
export type NotificationTap = { readonly key: string; readonly data: unknown };

export interface NotificationGateway {
  initialize(): Promise<Result<void, NotificationFailure>>;
  permissionStatus(): Promise<Result<NotificationPermission, NotificationFailure>>;
  /** Prompts. Call only from an explicit user action. */
  requestPermission(): Promise<Result<NotificationPermission, NotificationFailure>>;
  /** Scheduling an id that is already pending replaces it. */
  schedule(request: LocalNotificationRequest): Promise<Result<void, NotificationFailure>>;
  cancel(id: OwnedNotificationId): Promise<Result<void, NotificationFailure>>;
  pendingOwnedIds(): Promise<Result<OwnedNotificationId[], NotificationFailure>>;
  /** The tap that cold-started the app, if any. */
  launchTap(): Promise<NotificationTap | null>;
  onTap(listener: (tap: NotificationTap) => void): () => void;
}
