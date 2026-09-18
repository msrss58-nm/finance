# Google Play release playbook (internal)

Status: **preparation only.** Nothing in this file has been entered into Play Console, no binary has
been built from it, and no store asset has been created yet.

Prepared in Stage 4A, 18/09/2026, against commit `754bafc` (app version 1.0.0, versionCode 1,
`com.familyfinance.pro`). Data Safety answers live in `GOOGLE_PLAY_DATA_SAFETY.md`; the public
privacy policy is `privacy/index.html` at the repository root, served at
https://msrss58-nm.github.io/finance/privacy/ . Signing, versioning and OTA rules are in `README.md`
("Release rules"); this file does not repeat them, it applies them.

Every product claim below was verified in the source at that commit. Anything not verified is marked
UNKNOWN and must be answered by the account owner in the live Console.

---

## 1. Store listing draft

Default listing language: **Hebrew (he-IL)** — the app forces RTL and has no language switch
(`app.json`, `expo-localization` with `forcesRTL: true`). English (en-US) is optional and secondary.

### App name — 17 / 30 characters

```
FamilyFinance PRO
```

Matches `app.json` `expo.name` and the launcher name, so the store entry, the icon label and the
in-app header agree.

### Short description (Hebrew) — 67 / 80 characters

```
ניהול תקציב משפחתי במכשיר בלבד: תחזית יתרה, הלוואות, תשלומים ויעדים
```

### Full description (Hebrew) — 2070 / 4000 characters

```
FamilyFinance PRO היא אפליקציה לניהול תקציב משפחתי שפועלת במכשיר שלכם בלבד. אין חשבון משתמש, אין שרת, אין חיבור לבנק ואין סנכרון לענן — הנתונים הכספיים שאתם מזינים נשמרים באחסון הפרטי של האפליקציה במכשיר.

יתרה ותחזית
• יתרת התחלה שאתם קובעים, עם תאריך, כנקודת הפתיחה לחישוב.
• "יתרה צפויה להיום" — מחושבת מיתרת ההתחלה ומהתנועות המתוכננות באפליקציה. זו הערכה, ולא יתרת בנק מאומתת.
• גרף יתרה יומית צפויה ופירוט יומי לכל יום במחזור, עם האירועים של כל יום.
• כרטיס "האירוע הכספי הבא", סיכום חיובי כרטיס האשראי החודש, ויתרת ההלוואות שנותרה.

תנועות שאפשר לנהל
• הכנסות, עם יום כניסה חודשי.
• הוצאות קבועות — חודשי, דו-חודשי או שנתי, מהבנק או בכרטיס אשראי.
• תשלומים שונים (עסקאות בתשלומים) — סכום, מספר תשלומים, תאריך התחלה ומעקב אחר מה שנותר.
• הלוואות — החזר חודשי, ריבית, מספר תשלומים, מהבנק או דרך תלוש השכר.
• חיוב חד-פעמי בתאריך, חיוב כרטיס אשראי חודשי, ומשיכות מזומן.
• קטגוריות מובנות ומותאמות אישית, עמוד נפרד לכל קטגוריה, ארכיון, וארכוב אוטומטי להתחייבויות שהסתיימו.

יעדים
• יעדי חיסכון עם סכום יעד, תאריך יעד והתקדמות.
• פירוק יעד לרכיבים, סימון מה כבר נחסך, וארכיון ליעדים שהושלמו.
• האפליקציה אינה מעבירה כסף — היא רושמת את מה שדיווחתם.

התראות
• התראות בתוך האפליקציה: תשלום שצפוי לרדת מחר, והתחייבות שהסתיימה.
• תזכורת חודשית ליעדים כהתראה מקומית — כבויה כברירת מחדל וניתנת להפעלה. אין התראות Push ואין שרת התראות.

פרטיות ונתונים
• נעילת PIN — אמצעי פרטיות וגישה למסכים. היא אינה הצפנה של הנתונים במכשיר.
• גיבוי לקובץ JSON, שחזור מקובץ שאתם בוחרים, וייצוא תנועות ל-CSV — הכול ביוזמתכם, ואתם בוחרים לאן הקובץ נשמר.
• איפוס מלא של כל הנתונים מתוך האפליקציה.
• גיבוי המערכת של אנדרואיד והעברה אוטומטית בין מכשירים מבוטלים — העברת נתונים נעשית רק דרך קובץ גיבוי שאתם יוצרים.

מה האפליקציה לא עושה
• אינה מתחברת לחשבון הבנק ואינה מושכת תנועות אוטומטית.
• אינה מסנכרנת לענן, ואין בה חשבון משתמש.
• אינה מספקת ייעוץ פיננסי, ייעוץ השקעות, אשראי או שירותי תשלום.
• אין בה פרסומות, כלי ניתוח (analytics) או מעקב.

הערות
• הממשק בעברית בלבד (RTL), מותאם לטלפון ובמצב לאורך.
• מדיניות פרטיות: https://msrss58-nm.github.io/finance/privacy/
• תמיכה: ffpro1857@gmail.com
```

### Short description (English) — 72 / 80 characters

```
Family budget manager that keeps your financial data on your device only
```

### Full description (English) — 2564 / 4000 characters

```
FamilyFinance PRO is a family budget manager that runs entirely on your device. There is no account, no server, no bank connection and no cloud sync — everything you enter stays in the app's private storage on the phone.

Balance and forecast
• You set an opening balance and its date as the starting point of the calculation.
• "Projected balance for today" is derived from that opening balance and the movements you planned in the app. It is an estimate, not a verified bank balance.
• A daily projected-balance chart and a day-by-day breakdown of the billing cycle, with the events behind each day.
• Cards for the next financial event, this month's credit-card charges and the remaining loan balance.

What you can track
• Income, with a monthly pay day.
• Fixed expenses — monthly, bi-monthly or yearly, from the bank account or on a credit card.
• Instalment purchases — amount, number of payments, start date and what is left to pay.
• Loans — monthly repayment, interest, number of payments, from the bank or through the payslip.
• One-time dated charges, the monthly credit-card settlement and cash withdrawals.
• Built-in and custom categories, a page per category, an archive, and automatic archiving of obligations that have ended.

Goals
• Savings goals with a target amount, a target date and progress tracking.
• Goals can be split into components, with an archive for completed goals.
• The app never moves money — it records what you tell it you transferred.

Notifications
• In-app alerts: a payment due tomorrow, and an obligation that has ended.
• An optional monthly goals reminder as a local notification, off by default. No push notifications and no notification server.

Privacy and data
• A PIN lock protects access to the screens. It is a privacy lock, not encryption of your data.
• JSON backup, restore from a file you pick, and CSV export of transactions — always started by you, and you choose where the file goes.
• A full in-app data reset.
• Android Auto Backup and automatic device-to-device transfer are disabled; data moves only through a backup file you create yourself.

What the app does not do
• It does not connect to your bank and does not import transactions automatically.
• It does not sync to the cloud and has no user account.
• It gives no financial, investment or credit advice, and provides no payment services.
• No ads, no analytics, no tracking.

Notes
• The interface is Hebrew only (RTL), phone-sized and portrait.
• Privacy policy: https://msrss58-nm.github.io/finance/privacy/
• Support: ffpro1857@gmail.com
```

### Contact details

| Field | Value | Basis |
|---|---|---|
| Support email | `ffpro1857@gmail.com` | The same address published in `privacy/index.html` |
| Privacy policy | `https://msrss58-nm.github.io/finance/privacy/` | Live, HTTP 200, verified 18/09/2026 |
| Website | **leave empty** | The only public page is the Web build of the app at the Pages root — a different platform build, not a product site. No website is invented for the listing. If one is wanted later, build a real landing page first. |
| Phone | UNKNOWN — the Console may require one on the developer profile; the account owner decides what to publish |

### Copy rules that must not be broken

Never describe, in text or in screenshots: bank connectivity or transaction import, cloud sync or
backup to a server, a user account, financial or investment advice, encryption of the stored data,
transaction search (the field is deliberately disabled — `app/category/[key].tsx:109-115`), the empty
"אפשרויות ניסיוניות" screen, tablet or landscape support, biometric unlock, or a configurable
auto-lock timer (the app locks whenever it goes to the background —
`src/security/lifecycle.ts:12-14`).

---

## 2. Store asset readiness

| Asset | Requirement | Status |
|---|---|---|
| App icon 512×512 | 32-bit PNG with alpha, ≤1024 KB, mandatory | **Exists, usable as-is** — `icons/familyfinance-512.png`, 512×512 RGBA, 260 KB |
| Feature graphic 1024×500 | JPEG or **24-bit PNG, no alpha**, mandatory to publish | **Missing.** Must be created; every branded PNG in the repo is RGBA, so it needs flattening |
| Phone screenshots | min 2, max 8, no alpha, ≥1080 px recommended, 9:16 | **Missing.** None exist anywhere in the repository |
| Tablet screenshots | not mandatory for a phone-only listing | **Not planned.** The app is portrait and phone only, so large-screen distribution is not targeted |
| Adaptive icon (in-app) | already shipping | `assets/familyfinance-adaptive-foreground.png` over `#0f3a78`. Worth one visual check on device: it is the *maskable* PWA artwork, already inset, and Android insets again |
| Promo video | optional | Not planned |

`Design/*/screen.png` are gitignored third-party mockups of other products. **They must never be
uploaded to the store listing.**

### Screenshot set to capture (Stage 4B)

Six portrait captures, ≥1080×1920, in this order:

1. **בית** — the hero "יתרה צפויה להיום" with the two snapshot cards and the category tiles.
2. **תחזית** — the daily projected-balance chart.
3. **תחזית** — the daily breakdown with one day expanded.
4. A **category page** — e.g. הלוואות or תשלומים שונים, showing obligations with payments left.
   Frame it so the disabled search field is out of shot.
5. **יעדים** — a goal with components and a progress bar.
6. **הגדרות ▸ נתונים** or **הגדרות ▸ אבטחה** — the backup and privacy story.

**Use synthetic data, never real family finances.** `src/composition/syntheticDataset.ts` builds a
complete `BackupEnvelope` (salary, rent, credit-card items, a payroll loan, withdrawals, goals,
alerts) with dates relative to "now". In a release build it can be loaded through
Settings ▸ נתונים ▸ paste a backup as text, so no development build is required. Capture on an
emulator if the build's ABIs allow it; on the A54 only after a backup has been exported and verified
off-device.

---

## 3. Play Console field-by-field sheet

| Field | Recommended answer | Basis |
|---|---|---|
| App or game | App | — |
| Category | **Finance** | It is a personal-finance app. Filing it elsewhere to attract less scrutiny would be inaccurate |
| Free or paid | Free | No billing library in `package.json`, no in-app purchases |
| Contains ads | **No** | No ad SDK anywhere; the install-referrer permission is blocked in `app.json` |
| Advertising ID | **Not used** | No AD_ID permission, no attribution SDK |
| App access | **All functionality is available without special access** | The PIN is created by the user on their own device; a fresh install has no lock, so a reviewer reaches everything |
| Content rating | Complete the IARC questionnaire: no violence, no sexual content, no user-generated content, no user-to-user communication, no gambling, no data sharing. Expected outcome: Everyone / 3+ | Product behavior |
| Target audience | **18 and over**; does not appeal to children | A household budgeting tool; keeps the app out of the Families programme |
| News app | No | — |
| Government app | No | — |
| Health app | No | No Health Connect, no health data |
| COVID-19 apps | No | — |
| Permissions declaration | None required | `android.permissions: []`; the shipped manifest requests only INTERNET, VIBRATE, RECEIVE_BOOT_COMPLETED, POST_NOTIFICATIONS, DETECT_SCREEN_CAPTURE, ACCESS_NETWORK_STATE and WAKE_LOCK — none of them sensitive or high-risk (no SMS, call log or all-files access) |
| Data safety | No data collected, no data shared | See `GOOGLE_PLAY_DATA_SAFETY.md` |
| Financial features | **DECISION PENDING IN PLAY CONSOLE** — see §5 | Must not be pre-selected from documentation |
| Privacy policy URL | `https://msrss58-nm.github.io/finance/privacy/` | Live and verified |
| Store settings / tags | Finance, plus tags such as budgeting / personal finance chosen from what the Console actually offers | — |
| Countries | Israel at minimum; wider distribution is the owner's decision | Hebrew-only interface |

UNKNOWN, answerable only in the live Console: developer-account identity and phone verification
status; whether `com.familyfinance.pro` and the app name are available; the exact wording of the
current declaration forms; and whether a complete main store listing is required before an
internal-testing release can be published.

---

## 4. Data Safety — position for the first upload

Full detail in `GOOGLE_PLAY_DATA_SAFETY.md`. Summary: **no user data collected, none shared.**
Financial information is stored only in the app's private storage; there is no analytics, crash
reporting, advertising ID, account or server. The first Play binary will contain `expo-updates`, so
it will contact Expo's update service — that path carries technical delivery metadata over HTTPS and
downloads code only. It uploads nothing the user entered and changes none of the user-data answers.

---

## 5. Financial-features / policy classification

**Verified product facts**

FamilyFinance PRO is a personal financial-management / budgeting tool. It records amounts the user
types in and does arithmetic on them. It does **not** provide banking, lending, loan facilitation or
brokerage, payday loans or earned-wage advances, payments, money transfers, digital wallets,
investment or trading, crypto in any form, insurance, credit monitoring or repair, debt management as
a service, or personalized financial advice. "Loans" in the app are rows the user types describing
loans they already have; the app never originates, brokers or services anything. Confirmed by the
absence of any network call, payment SDK or advice engine in `src/` and `app/`.

**Declaration status: DECISION PENDING IN PLAY CONSOLE.**

The declaration itself is mandatory for every app on the account since 30/10/2025 — updates are
blocked until it is answered — but the answer is not chosen here. The two candidates:

1. **"My app doesn't provide any financial features"** — the official option list has no
   budgeting/tracking category, and none of the listed features is provided.
2. **Support services → "Other"** — if the live form's definition of a financial feature turns out to
   cover personal financial management as such.

Resolve it by reading the actual form in Console, with its definitions and help text, and choosing
the accurate, defensible answer. Do not pre-select either from this document. Record the final choice
here once it is made.

**Standing constraint:** adding bank-account aggregation, open-banking links, payments or
personalized advice would turn this into a financial product/service — a category that requires an
**organization** developer account. Keeping the app an offline tracker is what keeps a personal
account viable.

---

## 6. Closed-testing plan

Requirement (Google, current at 18/09/2026): a personal developer account created on or after
13/11/2023 must have **at least 12 testers opted in to a closed test, continuously, for 14 days**
before it can apply for production access. Internal testing does not count. Review of the application
typically takes up to 7 days, and meeting the numbers does not guarantee approval — Google asks how
testers were recruited and what feedback came back.

**Before inviting anyone:** re-read the requirement page in Console, because the threshold has moved
before (20 → 12 on 11/12/2024).

- **Tester list:** a Google Group is easier to run than an email list — membership can change without
  editing the track. Recruit **14–15** people for margin, each with a real Google account that can
  install from Play.
- **Opt-in:** every tester opens the opt-in URL, accepts, and installs from Play with that same
  account. An account that never opts in does not count, and a tester who opts out restarts their own
  14-day clock when they come back.
- **Do not** remove and re-add testers, swap the list, or delete the track during the 14 days.
- **What testers should actually do:** install, set an opening balance, add an income, a fixed
  expense, an instalment purchase and a loan, look at Home and Forecast, set a PIN, take a backup and
  restore it, and open the app on several different days.
- **Evidence to collect:** who tested, on which device and Android version, what they did, what broke
  and what was fixed — written down as you go. The production-access form asks for it.
- **Fixes during the 14 days:** JS/UI/logic fixes ship as an **OTA update** (permitted by Play as long
  as it is JS and assets only and adds no unreviewed functionality); native or config changes need a
  new AAB with versionCode +1 and the same versionName. Neither resets the tester clock.
- **OTA during closed testing is safe** as long as the testers' binary and the published update share
  a runtime version — `runtimeVersion` policy `appVersion` guarantees that for a given versionName.

---

## 7. Play App Signing — first upload

1. Build the AAB with EAS, signed by the existing EAS-managed key (certificate SHA-256
   `512fed74…90710b`). It never enters this repository.
2. Upload it. A new app is **enrolled in Play App Signing automatically**; Google generates and holds
   the app signing key and re-signs everything it distributes.
3. The certificate used for that first upload **becomes the upload key** — there is no separate
   registration step. Keep it, never rotate it, never migrate signing without explicit approval.
4. Google recommends later registering a distinct upload key, so a compromised one can be reset
   without touching the app signing key. Not needed now; recorded as a future option.

**Consequence for the A54, confirmed still correct:** the sideloaded build is signed by the EAS key,
while the Play-installed build will be signed by the Play app signing key. The signatures differ, so
Android will not update one with the other. Migration is:

```
backup (Settings ▸ נתונים) → verify the JSON file off-device → uninstall the sideloaded app
→ install from Play → restore the backup
```

Uninstalling deletes the app's private storage, so the exported backup is the only copy. Verify it
before uninstalling, not after.

---

## 8. Version / release plan

- **First Play upload: versionName `1.0.0`, versionCode `1`** — unchanged. Nothing has been uploaded,
  so 1 is still free, and 1.0.0 is the honest first-release number.
- **versionCode:** +1 for every binary uploaded to Play, including a re-upload of the same version.
  Play rejects a reused value.
- **versionName:** keep `1.0.0` for every closed-testing binary. Because `runtimeVersion` follows
  `appVersion`, one OTA runtime then covers all of them; changing versionName strands every binary
  built from the previous value.
- **OTA-only release:** changes neither value.
- **Nothing is changed in Stage 4A.**

---

## 9. Build strategy for Stage 3B + Stage 4B — user decision at execution time

| | Builds | A54 data | OTA staging gate | What gets validated |
|---|---|---|---|---|
| **A.** preview APK (staging) + production AAB | 2 | preserved — same key, `adb install -r` | clean: a staging-channel binary exists for physical QA | an APK that Play does not distribute |
| **B.** production AAB only | **1** | migrates now: backup → uninstall → install from Play → restore | none initially — no staging-channel binary | **the exact artifact testers receive** |

**Preferred: B — preferred, not approved. The choice is made when Stage 3B starts.**

Sequence under B: one production AAB → **internal testing** track (private, instant, unlimited
re-uploads, does not start the 14-day clock) → install on the A54 from Play → full verification
(Home, Forecast, the physical checks still pending for `5af2487` and `318f59d`, backup/restore) →
promote that same AAB to **closed testing** and start the clock.

Why B is preferred: it spends one build instead of two, it validates the artifact that is actually
distributed, and once it is installed every JS-level defect is fixable by OTA without another build.

Cost of B, to be accepted knowingly: the A54 moves to the Play signature immediately (backup and
restore, no in-place update), and the Play binary listens on the **production** channel, so until a
staging binary exists there is no physical staging gate. Mitigation: publish to a `staging` branch
and promote by repointing the channel (`eas channel:edit`) to the exact update that was tested, and
add a staging QA binary later when quota allows. Choose **A** instead if a clean staging gate matters
more than the extra build.

---

## 10. Open items

**BLOCKER — nothing can be published until these exist**
- Feature graphic 1024×500 (24-bit, no alpha).
- At least 2 phone screenshots; 5–6 as specified in §2.
- The Financial features declaration answered in Console (§5).
- The Data Safety form actually submitted.
- Developer-account identity and phone verification complete — UNKNOWN from the repository.
- One EAS build (quota resets 01/10/2026). Nothing can be uploaded without it.

**IMPORTANT**
- Choose A or B in §9 before the build.
- Confirm that `com.familyfinance.pro` and the app name are available.
- Confirm the built manifest targets API 36 (Expo SDK 57 defaults to compileSdk/targetSdk 36 and
  minSdk 24 — `node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle:65-69`); new
  submissions must target API 36 since 31/08/2026.
- Recruit 14–15 testers before the clock starts.
- Verify the A54 backup off-device before any uninstall.

**OPTIONAL**
- An English listing alongside the Hebrew one.
- A real website for the Website field.
- Wire `android-icon-monochrome.png` as a notification / themed icon (needs a build; not worth one on
  its own).
- Visual check of the adaptive icon's double inset.

---

## Rules for this file

Update it when an answer is actually decided in Console — record what was chosen and when. Never mark
anything as submitted before it has been submitted.
