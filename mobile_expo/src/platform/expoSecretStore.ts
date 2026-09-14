// SecretStore bound to expo-secure-store (Android Keystore-backed
// SharedPreferences / iOS Keychain).
//
// KNOWN PLATFORM LIMIT (read from SecureStoreModule.kt, expo-secure-store
// 57.0.4): on Android a KeyPermanentlyInvalidatedException or a
// BadPaddingException during getItemAsync is reported as `null` (and in the
// BadPadding case the entry is deleted). This adapter cannot tell that apart
// from "absent"; the security layer compensates with the non-secret marker
// (src/security/securityMarker.ts) and fails closed with `secretMissing`.

import * as SecureStore from 'expo-secure-store';

import { causeTypeOf, err, ok } from '../core/result.ts';
import type { SecretStore } from '../security/secretStore.ts';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Never synced to iCloud Keychain, never restored to another device.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

async function available(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export const expoSecretStore: SecretStore = {
  async read(key) {
    if (!(await available())) return err({ kind: 'unavailable' });
    try {
      const value = await SecureStore.getItemAsync(key, OPTIONS);
      return ok(value === null ? { status: 'absent' as const } : { status: 'present' as const, value });
    } catch (e) {
      return err({ kind: 'read', causeType: causeTypeOf(e) });
    }
  },
  async write(key, value) {
    if (!(await available())) return err({ kind: 'unavailable' });
    try {
      await SecureStore.setItemAsync(key, value, OPTIONS);
      return ok(undefined);
    } catch (e) {
      return err({ kind: 'write', causeType: causeTypeOf(e) });
    }
  },
  async delete(key) {
    if (!(await available())) return err({ kind: 'unavailable' });
    try {
      await SecureStore.deleteItemAsync(key, OPTIONS);
      return ok(undefined);
    } catch (e) {
      return err({ kind: 'delete', causeType: causeTypeOf(e) });
    }
  },
};
