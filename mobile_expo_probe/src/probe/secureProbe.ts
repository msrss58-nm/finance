// Stage 0 secure-storage probe. SYNTHETIC ONLY: this is not a PIN
// implementation (no KDF, no salt). It proves the storage channel: Android
// Keystore-backed / iOS Keychain storage, separate from SQLite, restart-safe.
import * as SecureStore from 'expo-secure-store';

export const PIN_RECORD_KEY = 'ff_pin_v1';

/** Probe unlock code. Clearly synthetic — never a real credential. */
export const SYNTHETIC_UNLOCK_CODE = '2468';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Never synced to iCloud Keychain, never migrated to another device.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readPinRecordPresent(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(PIN_RECORD_KEY, OPTIONS);
  return raw !== null;
}

export async function writeSyntheticPinRecord(): Promise<void> {
  const record = JSON.stringify({ v: 1, kdf: 'synthetic-probe-only', verifier: 'not-a-real-verifier' });
  await SecureStore.setItemAsync(PIN_RECORD_KEY, record, OPTIONS);
}

export async function deletePinRecord(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_RECORD_KEY, OPTIONS);
}

/** Constant-time comparison of the synthetic code (shape only). */
export function checkSyntheticCode(input: string): boolean {
  const a = input;
  const b = SYNTHETIC_UNLOCK_CODE;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
