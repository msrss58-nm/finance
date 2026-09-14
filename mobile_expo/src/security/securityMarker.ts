// Non-secret "a lock is configured" marker, stored in SQLite as a
// device-local key (never in a backup: no family_finance_ prefix).
//
// Why it exists: on Android, expo-secure-store returns null — and deletes the
// entry — when a Keystore key is invalidated or cannot decrypt
// (KeyPermanentlyInvalidatedException / BadPaddingException in
// SecureStoreModule.kt). Without a second witness, a lost secret would look
// exactly like "no lock configured" and silently open the app. With the
// marker, "marker present + secret absent" fails closed (secretMissing).

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import type { KeyValueWriter } from '../data/keyValueStore.ts';
import { DEVICE_LOCAL_KEYS } from '../data/storageKeys.ts';
import type { SecurityFailure } from './securityTypes.ts';

export interface SecurityMarkerStore {
  read(): Promise<Result<boolean, SecurityFailure>>;
  write(configured: boolean): Promise<Result<void, SecurityFailure>>;
}

const MARKER_VALUE = '{"v":1,"lockConfigured":true}';

export function createKvSecurityMarker(kv: KeyValueWriter): SecurityMarkerStore {
  const key = DEVICE_LOCAL_KEYS.securityMarker;
  return {
    async read() {
      try {
        const raw = await kv.get(key);
        if (raw === null) return ok(false);
        // Anything other than the exact marker is unexpected: fail closed.
        return raw === MARKER_VALUE ? ok(true) : err({ kind: 'markerRead', causeType: 'MalformedMarker' });
      } catch (e) {
        return err({ kind: 'markerRead', causeType: causeTypeOf(e) });
      }
    },
    async write(configured) {
      try {
        if (configured) await kv.set(key, MARKER_VALUE);
        else await kv.remove(key);
        return ok(undefined);
      } catch (e) {
        return err({ kind: 'markerWrite', causeType: causeTypeOf(e) });
      }
    },
  };
}
