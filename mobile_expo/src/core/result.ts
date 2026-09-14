// Typed success/failure values for every platform boundary.
//
// Rule shared by every failure type in this app (inherited from the Flutter
// security/file/notification layers): a failure carries a fixed `kind` and at
// most the *type name* (or a fixed ERR_ code) of an underlying exception —
// never its message. Native-module messages are not under our control and are
// not guaranteed to be free of secrets, file paths or user data.

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

const ERROR_CODE = /^ERR_[A-Z0-9_]{1,64}$/;

/**
 * Secret-free description of a thrown value: its constructor/name, plus an
 * Expo `ERR_*` code when present (codes are fixed identifiers, not free text).
 */
export function causeTypeOf(e: unknown): string {
  if (e instanceof Error) {
    const code: unknown = (e as { code?: unknown }).code;
    const name = e.name || 'Error';
    return typeof code === 'string' && ERROR_CODE.test(code) ? `${name}:${code}` : name;
  }
  if (e === null) return 'null';
  return typeof e;
}
