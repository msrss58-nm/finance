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

## REVIEW AGAIN BEFORE STAGE 3 / EAS UPDATE

⚠ These answers describe the app **without** `expo-updates`. Stage 3 will add EAS Update, and from
that moment the app will contact Expo's update infrastructure on launch. Update requests carry
technical data — platform, runtime version, channel and update identifiers, and inherently the IP
address — processed by Expo as the update provider.

Before any binary with `expo-updates` is uploaded to Play:
1. Re-answer the Data Safety form: decide whether this counts as collection of "App info and
   performance" / "Device or other IDs", and whether "encrypted in transit" must be answered Yes.
2. Update `privacy/index.html` with a section about update checks — the policy must not describe EAS
   Update as active before it is.
3. Re-verify that financial data itself is still never transmitted (EAS Update only downloads JS
   bundles; it does not upload app data).
4. Record the decision in `CURRENT_STATUS.md` and in this file.
