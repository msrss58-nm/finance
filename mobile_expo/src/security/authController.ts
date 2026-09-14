// The single owner of lock state. Screens never decide whether the app is
// locked; they read `state` and call these methods.

import { causeTypeOf, err, ok, type Result } from '../core/result.ts';
import { createStore, type ReadableStore } from '../core/store.ts';
import { INITIAL_AUTH_STATE, reduceAuth, type AuthEvent, type AuthState } from './authMachine.ts';
import { shouldLockOnAppState } from './lifecycle.ts';
import { FOUNDATION_LOCK_RECORD, type LockVerifier } from './lockVerifier.ts';
import { privacyModeFor, type PrivacyMode, type ScreenPrivacy } from './privacyPolicy.ts';
import { SECRET_KEYS, type SecretStore, type SecretStoreFailure } from './secretStore.ts';
import type { SecurityMarkerStore } from './securityMarker.ts';
import type { SecurityFailure } from './securityTypes.ts';

export type AuthControllerDeps = {
  readonly secrets: SecretStore;
  readonly marker: SecurityMarkerStore;
  readonly verifier: LockVerifier;
  readonly privacy: ScreenPrivacy;
  readonly now: () => number;
};

export type PrivacyStatus = { readonly mode: PrivacyMode | null; readonly lastApplyFailed: boolean };

type Configuration = { readonly configured: false } | { readonly configured: true; readonly record: string };

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

  /** Reads the configuration and leaves `initializing`. Must complete before any sensitive UI. */
  async initialize(): Promise<void> {
    try {
      const config = await this.#readConfiguration();
      if (!config.ok) this.#dispatch({ type: 'failed', failure: config.error });
      else this.#dispatch({ type: 'configResolved', configured: config.value.configured });
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
      const verdict = await this.#deps.verifier.verify(code, config.value.record);
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
   * FOUNDATION PLACEHOLDER: configures the synthetic lock (see
   * lockVerifier.ts). Secret first, then marker; a failed marker write rolls
   * the secret back so the two witnesses never disagree in the unsafe way.
   */
  async configureFoundationLock(): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'notConfigured' || this.#configuring) return err({ kind: 'unexpected', causeType: 'InvalidState' });
    this.#configuring = true;
    try {
      const wrote = await this.#deps.secrets.write(SECRET_KEYS.foundationLock, FOUNDATION_LOCK_RECORD);
      if (!wrote.ok) return err(fromSecretFailure(wrote.error));
      const marked = await this.#deps.marker.write(true);
      if (!marked.ok) {
        await this.#deps.secrets.delete(SECRET_KEYS.foundationLock);
        return err(marked.error);
      }
      this.#dispatch({ type: 'lockConfigured' });
      await this.#privacyChain;
      return ok(undefined);
    } finally {
      this.#configuring = false;
    }
  }

  /**
   * Removes the lock. Marker first, then secret: if the secret delete fails
   * the marker is restored, and "secret present" alone still means
   * configured — a failed removal can never leave the app unprotected while
   * the user believes the lock is on, and never reports success.
   */
  async removeLock(): Promise<Result<void, SecurityFailure>> {
    if (this.#state.get().kind !== 'unlocked' || this.#configuring) return err({ kind: 'unexpected', causeType: 'InvalidState' });
    this.#configuring = true;
    try {
      const unmarked = await this.#deps.marker.write(false);
      if (!unmarked.ok) return err(unmarked.error);
      const deleted = await this.#deps.secrets.delete(SECRET_KEYS.foundationLock);
      if (!deleted.ok) {
        await this.#deps.marker.write(true);
        return err(fromSecretFailure(deleted.error));
      }
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
    // ff_pin_v1 cannot be verified until the KDF is approved: fail closed.
    if (pin.value.status === 'present') return err({ kind: 'unsupportedRecord' });

    const lock = await this.#deps.secrets.read(SECRET_KEYS.foundationLock);
    if (!lock.ok) return err(fromSecretFailure(lock.error));
    const marker = await this.#deps.marker.read();
    if (!marker.ok) return err(marker.error);

    if (lock.value.status === 'present') return ok({ configured: true, record: lock.value.value });
    if (marker.value) return err({ kind: 'secretMissing' });
    return ok({ configured: false });
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
