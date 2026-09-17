# FamilyFinance PRO — Expo app (`mobile_expo/`)

The future FamilyFinance mobile app (Android + iOS), built with Expo SDK 57 /
React Native 0.86 / TypeScript strict / Expo Router.

**Status: Stage 1 — Platform Foundation.** This is infrastructure only: no
business rules, no financial screens, no real PIN. The Web app remains
Production and `mobile_flutter/` remains the frozen reference (oracle) until an
explicitly approved cutover. Project status lives in the repository root
(`CURRENT_STATUS.md`, `TODO.md`, `CHANGELOG.md`), not here.

## Structure

```
app/                    Expo Router routes (thin: wiring + presentation)
  _layout.tsx           composition root + security gate (Stack.Protected)
  lock.tsx              the only route while content is not allowed
  (tabs)/               the five primary screens (placeholders)
  diagnostics.tsx       foundation diagnostics — development builds only
src/
  core/                 pure helpers: Result, observable store, strict UTF-8, bidi, currency display
  domain/               Stage 2 business/data logic — a line-by-line TypeScript port of the Web
                        app.js (cash-flow engine, Opening Balance, Forecast, loans, Home totals,
                        in-app alerts, "מה צפוי לרדת", Goals/FIFO, backup contract). Raw stored
                        objects stay authoritative; "today" is always an explicit parameter.
  data/                 KeyValueStore contract + SQLite implementation, storage key registry,
                        FamilyFinanceRepository (raw-preserving reads/writes, atomic restore)
  security/             auth state machine, controller, secret-store contract, privacy policy
  navigation/           tab registry, deferred navigation intents
  notifications/        local-notification contract, tap routing
  backup/               native file contract, file-operation coordinator
  platform/             the ONLY place that touches native modules (expo-* adapters)
  composition/          bootstrap (service wiring), React context, synthetic fixtures
  ui/                   React Native primitives and presentation helpers
plugins/                config plugins (CNG) — withLocalOnlyNotifications.js
scripts/                android-local-build.ps1 (ASCII-path local Android build)
test/                   Node test runner suites (+ node:sqlite driver, fakes)
  parity/               read-only Node VM harness around the UNMODIFIED ../app.js: seeded
                        scenarios compared Web ↔ Expo (Asia/Jerusalem + America/New_York)
  oracle/               vectors ported from the frozen Flutter oracle's tests
```

Import boundaries (enforced by ESLint): `core`, `data`, `security`,
`navigation`, `notifications` and `backup` import no React, React Native or
Expo module. They run unchanged under Node's test runner. Native access is
confined to `src/platform/*`.

There are no module-level singletons: `src/composition/bootstrap.ts` creates
every long-lived service once, owned by the root layout, which the lock gate
never unmounts.

Never create a `src/app/` directory: Expo Router treats `src/app` as the
routes root when it exists, and would silently ignore `app/`.

## Commands

```sh
npm ci            # install exactly from package-lock.json
npm start         # Metro for the development client
npm run typecheck # tsc (app) + tsc (tests)
npm run lint      # expo lint (ESLint 9 flat config)
npm test          # node --test (Node >= 24; built-in type stripping + node:sqlite)
npm run verify    # all three
```

Relative imports carry explicit `.ts` / `.tsx` extensions so the same files
run under Node's type stripping and Metro.

`.npmrc` sets `legacy-peer-deps=true`: expo-router lists
`react-native-reanimated` / gesture-handler as peers of features this app does
not use, and npm would otherwise auto-install those third-party native modules.
This keeps the native surface to approved first-party Expo modules.

## Builds

**Primary: EAS Build** (`eas.json`): `development` (development client,
internal distribution, Android APK), `preview` (internal), `production`
(store-ready placeholder — nothing is submitted). EAS requires an Expo account
and, for iOS devices, an Apple Developer Program membership. See root
`CURRENT_STATUS.md` for the current state.

**Local, Windows:** Metro, TypeScript, lint and tests run directly from the
repository. A local native Android build does **not** work from a non-ASCII
user-profile path (the React Native Gradle plugin and CMake/prefab mangle it).
Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\android-local-build.ps1 -Task debug -Install
```

The script mirrors the sources into an ASCII directory (default `C:\ffbuild`),
installs from the lockfile there, runs `expo prebuild`, and builds with an ASCII
JDK copy and `GRADLE_USER_HOME`. The repository itself is never moved. iOS
cannot be built on Windows: use EAS.

`android/` and `ios/` are generated (Continuous Native Generation) and never
committed.

## Identifiers

Android release identity (approved in Stage 4A): display name
"FamilyFinance PRO", application id `com.familyfinance.pro`, URL scheme
`familyfinance`, version 1.0.0 / versionCode 1, EAS project
`@vr47252/familyfinance-pro`. The production signing key is managed by EAS;
it never enters this repository.

`com.familyfinance.pro` is a different Android application from the earlier
development id `com.familyfinance.expo.dev`: data moves between them only
through the JSON backup (Settings ▸ Data). The iOS bundle identifier is still
the development one and is decided with iOS (Stage 4B).

## Security notes

- The PIN is verified by the real KDF: `modules/ff-pin-kdf` (PBKDF2-HMAC-SHA256,
  100,000 iterations, 16-byte salt, 32-byte verifier — the Flutter oracle's
  `ff_pin_v1` record), reached through `src/platform/expoPinKdf.ts` and wired in
  `src/composition/bootstrap.ts`. `src/security/lockVerifier.ts` is only the
  Stage 1 synthetic foundation lock, used when no `ff_pin_v1` record exists; it
  protects nothing. The PIN remains a privacy lock, not encryption of the data.
- Secrets live only in expo-secure-store, never in SQLite, so they can never
  enter a backup sweep. Every secure-storage failure fails closed.
- Screen/recents privacy (`expo-screen-capture`) is active while a lock is
  configured.
- Notifications are local only. `plugins/withLocalOnlyNotifications.js`
  strips the FCM manifest entry points (Android) and the `aps-environment`
  entitlement (iOS).

## Release rules (Play signing, versioning, OTA)

Approved 18/09/2026. Google Play Data Safety answers live in
`GOOGLE_PLAY_DATA_SAFETY.md`; the public privacy policy is `privacy/index.html`
at the repository root (served at
https://msrss58-nm.github.io/finance/privacy/).

**Play signing**

- The current EAS-managed key (certificate SHA-256 `512fed74…90710b`) stays the
  key and becomes the Google Play **upload key**. It never enters this
  repository.
- Google Play App Signing signs the binaries Play distributes, so a
  Play-installed build and a sideloaded EAS build carry **different**
  signatures.
- Two sideloaded builds signed by the EAS key update each other in place
  (`adb install -r`) and keep the app data.
- Moving the A54 from the sideloaded build to the Play build therefore needs:
  backup (Settings ▸ Data) → uninstall → install from Play → restore.
- Never rotate or migrate signing without explicit approval.

**Versioning**

- Keep `cli.appVersionSource: "local"` in `eas.json`; versions are visible in
  Git, not managed remotely.
- `android.versionCode` — increment by 1 for every binary uploaded to Play,
  including a re-upload of the same version. Play rejects a reused value.
- `version` (versionName) — change for a product or native release that users
  should see.
- An OTA-only release changes neither.
- versionCode is deliberately still `1`: nothing has been uploaded to Play yet.

**OTA vs native build (EAS Update, configured 18/09/2026)**

`expo-updates` is installed and `app.json` carries
`updates.url = https://u.expo.dev/<projectId>` with `runtimeVersion` policy
`appVersion`, so `version` is the OTA compatibility key: changing it stops OTA
delivery to every binary built from the previous version. Channels in
`eas.json`: `preview` → **staging**, `production` → **production**
(`production-apk` inherits `production`; `development` has no channel). The QA
binary for the A54 is therefore the **preview** profile, which is on staging and
is signed with the same key, so `adb install -r` keeps the data.

⚠ No binary contains `expo-updates` yet. The first OTA-capable binary is Stage 3B
(planned for 01/10/2026, when the build quota resets).

OTA-safe (no new binary):

- JS/TS logic, including domain and presentation code;
- React Native UI, layout and styles;
- texts and copy;
- assets already compatible with the shipped binary;
- tests.

New binary required:

- Expo SDK upgrade, or any native module added/removed/changed;
- Android permissions;
- `app.json` / config-plugin changes that alter the generated binary (backup
  rules, icons, scheme, RTL, notifications surface);
- signing or package changes;
- `version` / `versionCode` changes;
- anything else that makes the runtime incompatible.

If it is unclear which side a change falls on, treat it as needing review before
any OTA publication.

Workflow — never publish straight to production:

```
IMPLEMENT → npm test → typecheck + lint → publish to STAGING
         → physical QA on the A54 → promote that exact update to PRODUCTION
```

EAS Build stays a limited resource: batch approved changes, state why a physical
build is required before running one, and never rebuild identical source.
