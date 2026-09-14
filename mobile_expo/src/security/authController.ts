// The single owner of lock state. Screens never decide whether the app is
// locked; they read `state` and call these methods.
//
// Two lock records exist: the real PIN (ff_pin_v1, verified by the native KDF —
// pinRecord.ts / pinKdf.ts) and the Stage 1 foundation placeholder
// (development diagnostics only — lockVerifier.ts). PIN management follows the
// Flutter oracle's PinService: set refuses to overwrite, change and remove
// verify the current PIN first, and there is no path that removes a PIN
// without verifying it.

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import { createStore, type ReadableStore } from '../core/store.ts';
import { INITIAL_AUTH_STATE, reduceAuth, type AuthEvent, type AuthState } from './authMachine.ts';
import { shouldLockOnAppState } from './lifecycle.ts';
import { FOUNDATION_LOCK_RECORD, type LockVerifier } from './lockVerifier.ts';
import type { PinKdf } from './pinKdf.ts';
import { decodePinRecord, encodePinRecord, isValidPinFormat, PIN_KDF_ITERATIONS } from './pinRecord.ts';
import { privacyModeFor, type PrivacyMode, type ScreenPrivacy } from './privacyPolicy.ts';
import { SECRET_KEYS, type SecretStore, type SecretStoreFailure } from './secretStore.ts';
import type { SecurityMarkerStore } from './securityMarker.ts';
import type { SecurityFailure } from './securityTypes.ts';

export type AuthControllerDeps = {
  readonly secrets: SecretStore;
  readonly marker: SecurityMarkerStore;
  /** Verifies the Stage 1 foundation placeholder record (development diagnostics only). */
  readonly verifier: LockVerifier;
  /** The native PIN KDF. Absent: every PIN operation fails and a stored PIN fails closed. */
  readonly kdf?: PinKdf;
  readonly privacy: ScreenPrivacy;
  readonly now: () => number;
};

export type PrivacyStatus = { readonly mode: PrivacyMode | null; readonly lastApplyFailed: boolean };

export type LockSource = 'pin' | 'foundation';

type ConfiguredLock = { readonly configured: true; readonly source: LockSource; readonly record: string };
type Configuration = { readonly configured: false } | ConfiguredLock;

const INVALID_STATE: SecurityFailure = { kind: 'unexpected', causeType: 'InvalidState' };

function fromSecretFailure(f: SecretStoreFailure): SecurityFailure {
  const kind =
    f.kind === 'unavailable'
      ? 'secretStoreUnavailable'
      : f.kind === 'read'
        ? 'secretRead'
        : f.kind === 'write'
          ? 'secretWrite'
          : 'secretDelete';
  return f.causeType === undefined ? { kind } : { kind, causeType: f.causeType };
}

export class AuthController {
  readonly #deps: AuthControllerDeps;
  readonly #state = createStore<AuthState>(INITIAL_AUTH_STATE);
  readonly #privacy = createStore<PrivacyStatus>({ mode: null, lastApplyFailed: false });
  readonly #source = createStore<LockSource | null>(null);
  #verifying = false;
  #configuring = false;
  #privacyChain: Promise<void> = Promise.resolve();

  constructor(deps: AuthControllerDeps) {
    this.#deps = deps;
  }

  get state(): ReadableStore<AuthState> {
    return this.#state;
  }

  get privacyStatus(): ReadableStore<PrivacyStatus> {
    return this.#privacy;
  }

  /** Which lock is configured (null: none, or not known yet). */
  get lockSource(): ReadableStore<LockSource | null> {
    return this.#source;
  }

  /** Reads the configuration and leaves `initializing`. Must complete before any sensitive UI. */
  async initialize(): Promise<void> {
    try {
      const config = await this.#readConfiguration();
      if (!config.ok) this.#dispatch({ type: 'failed', failure: config.error });
      else {
        this.#source.set(config.value.configured ? config.value.source : null);
        this.#dispatch({ type: 'configResolved', configured: config.value.configured });
      }
    } catch (e) {
      this.#dispatch({ type: 'failed', failure: { kind: 'unexpected', causeType: causeTypeOf(e) } });
    }
    await this.#privacyChain;
  }

  /** Feed every AppState change here. */
  handleAppState(status: string): void {
    if (shouldLockOnAppState(status)) this.#dispatch({ type: 'backgrounded' });
  }

  /** Attempts to unlock. True only on a real successful verification. */
  async submit(code: string): Promise<boolean> {
    const current = this.#state.get();
    if (current.kind !== 'locked' || this.#verifying) return false;
    if (current.retryAllowedAt !== null && this.#deps.now() < current.retryAllowedAt) return false;

    this.#verifying = true;
    this.#dispatch({ type: 'unlockStarted' });
    try {
      const config = await this.#readConfiguration();
      if (!config.ok) {
        this.#dispatch({ type: 'failed', failure: config.error });
        return false;
      }
      if (!config.value.configured) {
        this.#dispatch({ type: 'lockRemoved' });
        return false;
      }
      const verdict = await this.#verify(code, config.value);
      if (!verdict.ok) {
        this.#dispatch({ type: 'failed', failure: verdict.error });
        return false;
      }
      this.#dispatch({ type: 'unlockResolved', matched: verdict.value, now: this.#deps.now() });
      return verdict.value && this.#state.get().kind === 'unlocked';
    } catch (e) {
      // Never leave the machine parked in `unlocking`.
      this.#dispatch({ type: 'failed', failure: { kind: 'unexpected', causeType: causeTypeOf(e) } });
      return false;
    } finally {
      this.#verifying = false;
    }
  }

  /**
   * Configures a PIN for the first time (Flutter PinService.setPin). Refuses
   * to overwrite an existing record — replacing one requires changePin, which
   * verifies the current PIN first. Record first, then marker; a failed marker
   * write removes the record again.
   */
  async setPin(pin: string, confirm: string): Promise<Result<void, SecurityFailure>> {
    if (this.#configuring) return err(INVALID_STATE);
    if (this.#state.get().kind !== 'notConfigured') return err({ kind: 'alreadyConfigured' });
    // Cheap validation first: an invalid input never costs a derivation.
    if (!isValidPinFormat(pin)) return err({ kind: 'invalidPinFormat' });
    if (pin !== confirm) return err({ kind: 'pinMismatch' });
    this.#configuring = true;
    try {
      const existing = await this.#deps.secrets.read(SECRET_KEYS.pinRecord);
      if (!existing.ok) return err(fromSecretFailure(existing.error));
      if (existing.value.status === 'present') return err({ kind: 'alreadyConfigured' });
      const record = await this.#newRecord(pin);
      if (!record.ok) return err(record.error);
      const wrote = await this.#deps.secrets.write(SECRET_KEYS.pinRecord, record.value);
      if (!wrote.ok) return err(fromSecretFailure(wrote.error));
      const marked = await this.#deps.marker.write(true);
      if (!marked.ok) {
        await this.#deps.secrets.delete(SECRET_KEYS.pinRecord);
        return err(marked.error);
      }
      this.#source.set('pin');
      this.#dispatch({ type: 'lockConfigured' });
      await this.#privacyChain;
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  /** Verifies the current PIN, then replaces the record (new salt + verifier) in ONE write. */
  async changePin(currentPin: string, newPin: string, confirm: string): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'unlocked' || this.#configuring) return err(INVALID_STATE);
    if (!isValidPinFormat(newPin)) return err({ kind: 'invalidPinFormat' });
    if (newPin !== confirm) return err({ kind: 'pinMismatch' });
    this.#configuring = true;
    try {
      const current = await this.#checkCurrentPin(currentPin);
      if (!current.ok) return current;
      const record = await this.#newRecord(newPin);
      if (!record.ok) return err(record.error);
      const wrote = await this.#deps.secrets.write(SECRET_KEYS.pinRecord, record.value);
      if (!wrote.ok) return err(fromSecretFailure(wrote.error));
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  /**
   * Verifies the current PIN, then removes it. Marker first, then record: if
   * the delete fails the marker is restored, so a failed removal never leaves
   * the app unprotected and is never reported as success.
   */
  async removePin(currentPin: string): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'unlocked' || this.#configuring) return err(INVALID_STATE);
    this.#configuring = true;
    try {
      const current = await this.#checkCurrentPin(currentPin);
      if (!current.ok) return current;
      const unmarked = await this.#deps.marker.write(false);
      if (!unmarked.ok) return err(unmarked.error);
      const deleted = await this.#deps.secrets.delete(SECRET_KEYS.pinRecord);
      if (!deleted.ok) {
        await this.#deps.marker.write(true);
        return err(fromSecretFailure(deleted.error));
      }
      this.#source.set(null);
      this.#dispatch({ type: 'lockRemoved' });
      await this.#privacyChain;
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  /**
   * FOUNDATION PLACEHOLDER (development diagnostics only): configures the
   * synthetic lock (see lockVerifier.ts). Secret first, then marker; a failed
   * marker write rolls the secret back so the two witnesses never disagree in
   * the unsafe way.
   */
  async configureFoundationLock(): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'notConfigured' || this.#configuring) return err(INVALID_STATE);
    this.#configuring = true;
    try {
      const wrote = await this.#deps.secrets.write(SECRET_KEYS.foundationLock, FOUNDATION_LOCK_RECORD);
      if (!wrote.ok) return err(fromSecretFailure(wrote.error));
      const marked = await this.#deps.marker.write(true);
      if (!marked.ok) {
        await this.#deps.secrets.delete(SECRET_KEYS.foundationLock);
        return err(marked.error);
      }
      this.#source.set('foundation');
      this.#dispatch({ type: 'lockConfigured' });
      await this.#privacyChain;
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  /**
   * Removes the foundation placeholder lock (never a real PIN — that needs
   * removePin and the current PIN). Marker first, then secret: if the secret
   * delete fails the marker is restored.
   */
  async removeLock(): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'unlocked' || this.#configuring || this.#source.get() !== 'foundation') return err(INVALID_STATE);
    this.#configuring = true;
    try {
      const unmarked = await this.#deps.marker.write(false);
      if (!unmarked.ok) return err(unmarked.error);
      const deleted = await this.#deps.secrets.delete(SECRET_KEYS.foundationLock);
      if (!deleted.ok) {
        await this.#deps.marker.write(true);
        return err(fromSecretFailure(deleted.error));
      }
      this.#source.set(null);
      this.#dispatch({ type: 'lockRemoved' });
      await this.#privacyChain;
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  async #readConfiguration(): Promise<Result<Configuration, SecurityFailure>> {
    const pin = await this.#deps.secrets.read(SECRET_KEYS.pinRecord);
    if (!pin.ok) return err(fromSecretFailure(pin.error));
    if (pin.value.status === 'present') {
      // A record this build cannot trust keeps the app locked: never "no PIN".
      const parsed = decodePinRecord(pin.value.value);
      if (!parsed.ok) return err(parsed.error);
      return ok({ configured: true, source: 'pin', record: pin.value.value });
    }

    const lock = await this.#deps.secrets.read(SECRET_KEYS.foundationLock);
    if (!lock.ok) return err(fromSecretFailure(lock.error));
    const marker = await this.#deps.marker.read();
    if (!marker.ok) return err(marker.error);

    if (lock.value.status === 'present') return ok({ configured: true, source: 'foundation', record: lock.value.value });
    if (marker.value) return err({ kind: 'secretMissing' });
    return ok({ configured: false });
  }

  async #verify(code: string, config: ConfiguredLock): Promise<Result<boolean, SecurityFailure>> {
    if (config.source === 'foundation') return this.#deps.verifier.verify(code, config.record);
    const kdf = this.#deps.kdf;
    if (kdf === undefined) return err({ kind: 'kdfUnavailable' });
    const record = decodePinRecord(config.record);
    if (!record.ok) return err(record.error);
    return kdf.verifyPin(code, record.value.saltB64, record.value.iterations, record.value.verifierB64);
  }

  async #checkCurrentPin(currentPin: string): Promise<Result<void, SecurityFailure>> {
    const config = await this.#readConfiguration();
    if (!config.ok) return err(config.error);
    if (!config.value.configured || config.value.source !== 'pin') return err(INVALID_STATE);
    const verdict = await this.#verify(currentPin, config.value);
    if (!verdict.ok) return err(verdict.error);
    return verdict.value ? ok(undefined) : err({ kind: 'wrongCurrentPin' });
  }

  /** A fresh salt + verifier record, checked to be readable by this build before it is ever stored. */
  async #newRecord(pin: string): Promise<Result<string, SecurityFailure>> {
    const kdf = this.#deps.kdf;
    if (kdf === undefined) return err({ kind: 'kdfUnavailable' });
    const salt = await kdf.generateSalt();
    if (!salt.ok) return err(salt.error);
    const verifier = await kdf.deriveVerifier(pin, salt.value, PIN_KDF_ITERATIONS);
    if (!verifier.ok) return err(verifier.error);
    const record = encodePinRecord(salt.value, verifier.value);
    return decodePinRecord(record).ok ? ok(record) : err({ kind: 'kdfFailed', causeType: 'InvalidRecord' });
  }

  #dispatch(event: AuthEvent): void {
    const prev = this.#state.get();
    const next = reduceAuth(prev, event);
    if (next === prev) return;
    this.#state.set(next);
    const mode = privacyModeFor(next);
    if (mode !== null && mode !== this.#privacy.get().mode) this.#applyPrivacy(mode);
  }

  #applyPrivacy(mode: PrivacyMode): void {
    // Serialized so rapid transitions apply in order. A failure never blocks
    // locking/unlocking (defence in depth), but it is surfaced.
    this.#privacyChain = this.#privacyChain.then(async () => {
      try {
        await this.#deps.privacy.apply(mode);
        this.#privacy.set({ mode, lastApplyFailed: false });
      } catch {
        this.#privacy.set({ mode, lastApplyFailed: true });
      }
    });
  }
}
