// A public, synthetic known-answer vector for the PIN KDF — not a secret and
// not anyone's PIN. The expected verifier was computed independently with
// Node's PBKDF2 (HMAC-SHA256, 100,000 iterations, 32 bytes). The development
// diagnostics screen checks the native module against it; the tests check the
// Node oracle against it.

export const KDF_KNOWN_ANSWER = {
  pin: '2580',
  saltB64: 'AAECAwQFBgcICQoLDA0ODw==',
  iterations: 100_000,
  verifierB64: '7nQetAup1b2gwayKDsL/hZYg6frI829KroVjnQVnR2o=',
} as const;
