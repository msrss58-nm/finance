# Google Play Data Safety — draft answers (internal)

Status: **draft, not submitted.** Nothing in this file has been entered into Play Console.
Last verified against the code: 18/09/2026, commit `318f59d` (see "Evidence" for each claim).

Public privacy policy: `privacy/index.html` in this repository →
https://msrss58-nm.github.io/finance/privacy/

## Summary answers (current app, Android, `com.familyfinance.pro`)

| Play question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | Not applicable — no user data is transmitted |
| Do you provide a way for users to request that their data be deleted? | Not applicable — no account and no server; deletion happens on the device |

### Per category
- **Financial info** — the app stores financial items, balances, goals, settings and an activity log,
  but only in the app's private storage on the device. Not collected, not shared, never transmitted.
- **Personal info / Contacts / Location / Photos & videos / Files & docs / Messages / Calendar /
  Health / Web browsing** — not accessed and not collected.
- **App activity / App info and performance / Device or other IDs** — no analytics, no crash
  reporting, no telemetry, no advertising ID, no attribution SDK.

### Supporting statements
- No user data is collected by the developer.
- No user data is shared with third parties.
- No analytics, no advertising, no tracking.
- No account system, no authentication backend, no cloud storage.
- No server transmission of financial data.
- Backup/export (JSON, CSV) happens only when the user initiates it and chooses the destination.
- Notifications are local only; no push token and no notification server.
- Data deletion: in-app reset ("איפוס כל הנתונים") or uninstalling the app.

## Evidence (verified in code)

| Claim | Where it is proven |
|---|---|
| No network calls in the app | No `fetch` / `XMLHttpRequest` / `WebSocket` anywhere in `src/` or `app/` |
| Local storage only | `src/data/familyFinanceRepository.ts` + `src/data/*` over SQLite (`expo-sqlite`) |
| PIN never exported, held in secure storage | `src/platform/expoSecretStore.ts` (`expo-secure-store`), `src/security/authController.ts`; the key `ff_pin_v1` has no `family_finance_` prefix, and the backup contract only takes that prefix (`src/domain/backup.ts`) |
| Export/import is user-driven | `src/platform/expoFileGateway.ts` (document picker, share sheet, SAF folder), `src/state/backupController.ts` |
| No push surface | `plugins/withLocalOnlyNotifications.js` strips the FCM services/receivers that `expo-notifications` brings |
| No Android Auto Backup / device transfer | `plugins/withNoAndroidBackup.js` — `allowBackup=false`, plus full-backup and data-extraction rules excluding every domain |
| No storage permissions | `app.json` `android.permissions: []` and the `blockedPermissions` list; the shipped APK requests only INTERNET, VIBRATE, RECEIVE_BOOT_COMPLETED, POST_NOTIFICATIONS, DETECT_SCREEN_CAPTURE, ACCESS_NETWORK_STATE, WAKE_LOCK |
| Screens protected while locked | `src/platform/expoScreenPrivacy.ts` (`expo-screen-capture`, FLAG_SECURE) |
| Deletion path exists | `src/state/backupController.ts` `resetAllData()` (requires typing "איפוס") |

Note: INTERNET and ACCESS_NETWORK_STATE are defaults of the React Native / Expo runtime. The app
itself makes no network request today.

## EAS Update — re-evaluated in Stage 3A (18/09/2026)

`expo-updates` (~57.0.22) is now a dependency and the config carries `updates.url`
(`https://u.expo.dev/08a355db-3469-4264-b2e3-0a1fc6af212d`) with `runtimeVersion` policy
`appVersion`. **No binary contains it yet** — the installed A54 build predates it, so today nothing
in the field performs update checks. The first OTA-capable binary is Stage 3B.

What the update mechanism transmits, once such a binary exists:

| Direction | Data | Notes |
|---|---|---|
| App → Expo (EAS Update) | app/project id, channel, runtime version, update id, platform, SDK/library versions, and the IP address inherent to any HTTPS connection | Sent only to check for and download an update |
| Expo → App | the JS bundle and its assets | Code only |
| App → anywhere | **nothing from the user's data** | Financial items, balances, goals, settings and the activity log are never uploaded |

### Effect on the Data Safety answers: none of the user-data answers change

- "Does your app collect or share any of the required user data types?" — still **No**. The update
  request carries technical delivery metadata, not user data collected by the developer; Expo acts as
  the update-delivery provider and the developer receives no user data from it.
- "Financial info" — still not collected and not shared. Verified: the update client only downloads
  code; nothing reads the SQLite store or the secure store on that path.
- "Device or other IDs" — no advertising ID and no device identifier is collected by the app. The
  update request's technical identifiers are scoped to update delivery.
- "App info and performance" — no crash log or performance data is collected. `expo-updates` does not
  bring analytics or crash reporting with it.
- "Encrypted in transit" — update traffic is HTTPS. Because nothing is declared as collected, the
  question stays not applicable; if Play's form requires an answer for any declared category in the
  future, the answer is Yes.

Recorded in `privacy/index.html` (section "עדכוני אפליקציה") before any OTA-capable binary ships.

## REVIEW AGAIN BEFORE THE FIRST PLAY UPLOAD

1. Re-read this file against the shipped binary's dependency list (did anything new join that talks to
   a server?).
2. Confirm `privacy/index.html` still matches actual behavior, and refresh its "last updated" date.
3. Confirm no analytics/crash-reporting package entered through a transitive dependency.
4. Record the final answers here after they are entered in Play Console.
