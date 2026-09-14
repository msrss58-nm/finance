// Composition root. Creates every long-lived service exactly once per app
// run and wires the platform adapters into the pure layers. Owned by the root
// layout (app/_layout.tsx), which is never unmounted by the lock gate — the
// equivalent of the Flutter oracle's _AppBootstrapState. No singletons.

import { FileOperationCoordinator } from '../backup/fileOperationCoordinator.ts';
import { causeTypeOf, type Result } from '../core/result.ts';
import { PersistenceError, type KeyValueStore } from '../data/keyValueStore.ts';
import { openKeyValueStore } from '../data/sqliteKeyValueStore.ts';
import { PendingNavigation } from '../navigation/pendingNavigation.ts';
import type { NotificationFailure, NotificationGateway } from '../notifications/notificationGateway.ts';
import { NotificationTapRouter } from '../notifications/notificationRouting.ts';
import { createExpoFileGateway } from '../platform/expoFileGateway.ts';
import { createExpoNotificationGateway } from '../platform/expoNotificationGateway.ts';
import { expoScreenPrivacy } from '../platform/expoScreenPrivacy.ts';
import { expoSecretStore } from '../platform/expoSecretStore.ts';
import { openExpoSqliteDriver } from '../platform/expoSqliteDriver.ts';
import { AuthController } from '../security/authController.ts';
import { foundationPlaceholderVerifier } from '../security/lockVerifier.ts';
import { createKvSecurityMarker } from '../security/securityMarker.ts';

export const DATABASE_NAME = 'familyfinance.db';

export type AppServices = {
  readonly kv: KeyValueStore;
  readonly auth: AuthController;
  readonly navigation: PendingNavigation;
  readonly files: FileOperationCoordinator;
  readonly notifications: NotificationGateway;
  readonly notificationInit: Result<void, NotificationFailure>;
};

export type BootState =
  | { readonly status: 'booting' }
  | { readonly status: 'ready'; readonly services: AppServices }
  /** Nothing sensitive is ever shown in this state. */
  | { readonly status: 'failed'; readonly reason: 'storage' | 'unexpected'; readonly causeType: string };

function describe(e: unknown): string {
  return e instanceof PersistenceError ? `PersistenceError:${e.kind}` : causeTypeOf(e);
}

export async function bootstrap(): Promise<BootState> {
  let kv: KeyValueStore;
  try {
    kv = await openKeyValueStore(await openExpoSqliteDriver(DATABASE_NAME));
  } catch (e) {
    return { status: 'failed', reason: 'storage', causeType: describe(e) };
  }

  try {
    const navigation = new PendingNavigation();
    const auth = new AuthController({
      secrets: expoSecretStore,
      marker: createKvSecurityMarker(kv),
      verifier: foundationPlaceholderVerifier,
      privacy: expoScreenPrivacy,
      now: Date.now,
    });
    const notifications = createExpoNotificationGateway();
    const tapRouter = new NotificationTapRouter(navigation);
    const files = new FileOperationCoordinator(createExpoFileGateway(), navigation);

    // Taps are only ever parked in PendingNavigation; consumption is gated.
    notifications.onTap((tap) => tapRouter.handle(tap));
    const [notificationInit] = await Promise.all([notifications.initialize(), auth.initialize()]);
    const launchTap = await notifications.launchTap();
    if (launchTap !== null) tapRouter.handle(launchTap);

    return { status: 'ready', services: { kv, auth, navigation, files, notifications, notificationInit } };
  } catch (e) {
    return { status: 'failed', reason: 'unexpected', causeType: describe(e) };
  }
}
