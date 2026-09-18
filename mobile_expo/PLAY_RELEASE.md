# Google Play release playbook (internal)

Status: **preparation only.** Nothing in this file has been entered into Play Console, no binary has
been built from it, and no store asset has been created yet.

Prepared in Stage 4A and extended in Stage 4B, 18/09/2026, against commit `754bafc`
(app version 1.0.0, versionCode 1,
`com.familyfinance.pro`). Data Safety answers live in `GOOGLE_PLAY_DATA_SAFETY.md`; the public
privacy policy is `privacy/index.html` at the repository root, served at
https://msrss58-nm.github.io/finance/privacy/ . Signing, versioning and OTA rules are in `README.md`
("Release rules"); this file does not repeat them, it applies them.

Every product claim below was verified in the source at that commit. Anything not verified is marked
UNKNOWN and must be answered by the account owner in the live Console.

---

## 0. Google Play account status — 18/09/2026

Reported by the account owner; not verifiable from this repository.

| Item | Status |
|---|---|
| Developer account | Created |
| Registration fee | Paid |
| Android device verification (Galaxy A54) | **Complete** |
| Identity verification | **Submitted, under Google review — NOT complete** |
| Contact phone verification | Pending; it unlocks only after identity verification completes |
| "Create app" | **Locked** until account verification finishes |

Consequence: no app record exists yet, so nothing in this file can be entered anywhere. Every
Console step waits on the verification result. Never describe identity verification as complete
until Google says it is.

---

## 1. Store listing draft

Default listing language: **Hebrew (he-IL)** — the app forces RTL and has no language switch
(`app.json`, `expo-localization` with `forcesRTL: true`). English (en-US) is optional and secondary.

Re-checked in Stage 4B (18/09/2026): the counts below were measured again on the exact strings, and
the copy was audited once more against the code. It contains no disabled feature, no bank
connectivity, no cloud sync, no account, no AI or advice, and no promise of any financial outcome.
Treat it as the **final proposed Hebrew listing** — it changes only when the product changes.

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

### Screenshot plan — LOCKED (Stage 4B, 18/09/2026)

Six portrait captures, ≥1080×1920, 9:16, PNG without alpha or JPEG, in exactly this order. The
order is the story: where do I stand today → where am I heading → what is it made of → what am I
saving for → my data stays mine.

**Data state for every shot:** the synthetic dataset only. `src/composition/syntheticDataset.ts`
builds a complete `BackupEnvelope` — salary ~14,500, rent 4,200, car insurance (annual), a Netflix
credit-card item, instalment purchases, a payroll loan, cash withdrawals, goals with components,
plus a payment due tomorrow — with all dates relative to "now". In a release build it loads through
**Settings ▸ נתונים ▸ הדבקת גיבוי כטקסט**, so no development build is needed. Set an opening balance
first, or Home and Forecast show prompts instead of numbers.

| # | Screen | State to reach | Must be visible | Must NOT be visible | Caption (Hebrew, added externally) |
|---|---|---|---|---|---|
| 1 | בית | Synthetic data loaded, opening balance set, scrolled to the top | The hero "יתרה צפויה להיום" with its "אינה יתרת בנק מאומתת" line, both snapshot cards, the category tiles | The alerts section if it is empty; any real name or amount | תמונת מצב יומית של התקציב |
| 2 | תחזית | Same data, chart section expanded | "📈 יתרה יומית צפויה" with a populated step chart and the basis text that says it is not connected to the bank | The empty-state prompt (means no opening balance) | תחזית יתרה יומית עד סוף המחזור |
| 3 | תחזית | Scrolled to "📋 פירוט יומי", one day expanded | The daily table — תאריך / הכנסות / הוצאות / יתרה צפויה — and one day's individual events | A day with zero movement as the expanded one | פירוט יומי: מה נכנס ומה יורד בכל יום |
| 4 | קטגוריה (הלוואות or תשלומים שונים) | Open the category page from קטגוריות | The category total chip and obligation rows showing payments left | **The disabled search field** — frame or scroll it out of shot | מעקב הלוואות ותשלומים — כמה נשאר |
| 5 | יעדים | פעילים tab | A goal with components, a progress bar and a target date | The archive tab; an overdue-only view as the only goal shown | יעדי חיסכון עם מעקב התקדמות |
| 6 | הגדרות ▸ נתונים | The data topic open | Backup, restore, CSV export, and the reset action | The paste-backup text area with synthetic JSON still in it | גיבוי, שחזור וייצוא — הנתונים נשארים אצלכם |

Captions are optional and, if used, must be added **externally** in the graphic; the app itself must
not be edited for the store. Keep each caption short enough to read on a phone-sized thumbnail. No
caption may claim anything the copy rules above forbid.

Capture on an emulator if the build's ABIs allow it. On the A54 only after a backup has been
exported and verified off-device — and note that loading the synthetic dataset **replaces** the
data on the device.

**Do not capture yet — there is no suitable build.** The binary installed on the A54 predates
`5af2487` and `318f59d` (their physical verification is still recorded as pending). It therefore
still shows routine upcoming-income alerts on Home and the upcoming-income switch in Settings, both
of which have been removed from the product. Screenshots taken from it would advertise a UI that no
longer exists. Capture only from the Stage 3B build.

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

### Ready-to-enter sheet — first Play binary

Answer in this order; the form hides later questions depending on earlier answers.

| Console question | Answer to enter | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Nothing leaves the device. No network call exists in `src/` or `app/`; the only outbound path in the first binary is the update client, which is delivery infrastructure, not developer collection |
| Data types — Location / Personal info / Financial info / Health and fitness / Messages / Photos and videos / Audio / Files and docs / Calendar / Contacts / App activity / Web browsing / App info and performance / Device or other IDs | **None selected** | Financial data is entered by the user and stored in the app's private SQLite database only |
| Is all of the user data collected by your app encrypted in transit? | **Not shown** once nothing is declared as collected. If the form insists: **Yes** | All connections the binary can make are HTTPS |
| Do you provide a way for users to request that their data be deleted? | **Not shown**; if asked: no account, deletion happens on the device (in-app "איפוס כל הנתונים" or uninstall) | There is no server and no account to delete from |
| Data collected by a third-party SDK? | **No** | Dependency review at `754bafc` found no analytics, attribution or crash-reporting package, direct or transitive |
| Is your app's data handling independently validated against a security standard? | **No** | No such audit has been done. Do not claim one |
| Does your app have ads? | **No** | No ad SDK |
| Advertising ID used? | **No** | No AD_ID permission |
| Privacy policy URL | `https://msrss58-nm.github.io/finance/privacy/` | Live, verified |

**Confirm only in the live Console:** the exact phrasing and order of the questions (the form has
changed before), whether "encrypted in transit" and "deletion request" still appear when nothing is
declared, and whether Play adds a separate question about software-update delivery. If the form asks
anything not covered here, stop and re-read `GOOGLE_PLAY_DATA_SAFETY.md` before answering — do not
improvise an answer at the keyboard.

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

### Decision matrix for the live form

Read the form's own definition of "financial features" first, then walk this table.

| Form option | Does FamilyFinance PRO do it? | Evidence |
|---|---|---|
| Personal loan — direct lender / facilitator / payday / earned-wage advance | **No** | The app originates nothing; a "loan" is a row the user types about a loan they already have |
| Banking, line of credit, microfinance | **No** | No bank connection, no account, no network call |
| Mobile payments, digital wallets, money transfer | **No** | No payment SDK, no billing library |
| Buy now pay later, rewards/points programmes | **No** | Instalments are the user's own records; nothing is offered or brokered |
| Crypto wallet / exchange / tokenized assets | **No** | No crypto code of any kind |
| Stock trading, portfolio management, crowdfunding | **No** | No market data, no brokerage, no portfolio feature |
| Credit monitoring and reporting, credit repair | **No** | No bureau access, no score |
| Insurance | **No** | "ביטוח רכב" can exist only as an expense row the user types |
| Financial advice | **No** | The insight cards are deterministic arithmetic on the user's own numbers — next event, this month's card charges, remaining loan balance. No recommendation engine, no AI |
| Debt management as a service | **No** | Tracking one's own obligations is not a service provided to the user |
| "My app doesn't provide any financial features" | **Candidate 1** | Nothing above applies, and the list has no budgeting/tracking option |
| Support services → Other | **Candidate 2** | Choose this only if the live form defines "financial features" broadly enough to cover personal financial management as such |

**Decision rule:** if the form's definition is about *providing a financial service or product*,
answer Candidate 1. If its definition covers *handling or managing financial information* in a way
that plainly includes a personal budget tracker, answer Candidate 2 with "Other" described as
"personal budgeting and expense tracking; all data entered manually by the user and stored on the
device". If an option requires a licence, a lender relationship or regulator documentation, it is
the wrong option — none of that exists here. When in doubt, choose the answer you could defend
verbatim to a reviewer using the facts above, and record which option you picked and its exact
wording, with the date, in this file.

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
- **Account verification** — identity verification is under Google review and phone verification
  waits on it, so "Create app" is still locked (§0). Nothing can be entered in Console until it
  clears.
- One EAS build (quota resets 01/10/2026). Nothing can be uploaded without it, and there is no
  build suitable for store screenshots until then (§2).

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

## 11. Feature graphic — production specification

1024×500, **no alpha**, 24-bit PNG or JPEG, sRGB, under 15 MB. It is the banner at the top of the
listing and is often shown scaled down to a few hundred pixels wide, so it must survive being small.

**Text**

- Headline (Hebrew): `כל התקציב המשפחתי — במכשיר שלכם`
- Optional subtitle: `יתרה, תחזית, הלוואות ותשלומים` — include it only if it stays legible at
  roughly 40% scale; the headline alone is a valid design.
- English variant, only if an English listing is published:
  headline `Your family budget, on your device`, subtitle `Balance, forecast, loans, instalments`.
- Hebrew text is RTL: set the paragraph direction correctly, and check the rendered file rather than
  trusting the editor's preview.

**Composition**

- Background: the brand navy `#0f3a78`, flat or with a subtle vertical gradient toward a slightly
  darker tone. No photography, no stock imagery.
- The app icon (from `icons/familyfinance-512.png`) on one side at roughly 300–340 px, optically
  centred vertically; text block on the other side. With Hebrew text, the icon reads best on the
  left with the text right-aligned.
- Accent colour for a thin rule or a single small highlight: the app's green `#0a7d3d` or white at
  reduced opacity. Two colours plus white is the whole palette.
- No screenshot inside the graphic, no device frame, no drop shadows imitating a real card.

**Typography**

- One clean sans-serif with real Hebrew support (Rubik, Heebo, Assistant, or the system UI face).
  One family, two weights at most.
- Headline about 64–78 px, subtitle about 34–40 px, both at high contrast against the navy
  (white or near-white). Nothing below 30 px.

**Safe areas**

- Keep every glyph and the icon inside a 5% margin — at least 50 px left/right and 25 px top/bottom.
- Play crops and overlays this asset differently across surfaces: keep the middle ~1000×450 free of
  anything essential, and never place text in the outer 64 px on any side.

**Must NOT appear**

- Bank logos, card networks, currency-symbol clip-art suggesting real accounts, charts implying
  market data, AI or robot imagery, or anything resembling a banking dashboard.
- Numbers that could read as a real balance, and any real personal or financial data.
- Growth arrows, "earn", "save X%", returns, or any claim of a financial outcome.
- Store badges, review stars, awards, "#1", or other ranking claims.
- The word "PRO" styled as a paid tier — it is part of the product name, not a plan.
- Alpha transparency of any kind; flatten before export.

**Not generated.** No image has been created. Producing it needs explicit approval.

---

## 12. Tester worksheet (14–15 testers)

Do not invite anyone yet. Keep this as a spreadsheet — one row per tester, one line per event — and
bring it to the production-access application, which asks how testers were recruited and what came
back.

CSV header to paste into a new sheet:

```
tester_name,google_account_email,invited_on,opted_in_on,install_confirmed,day1_date,still_opted_in,feedback_received,issue_found,issue_resolved,notes
```

| Column | Meaning | Rule |
|---|---|---|
| tester_name | Who they are | Enough to contact them |
| google_account_email | The **Google account** that opts in | Must be the same account that installs from Play; a different address silently fails to count |
| invited_on | Date the opt-in link was sent | — |
| opted_in_on | Date they accepted the opt-in | This, not the invitation, is what Google counts |
| install_confirmed | Yes/No | Opting in without installing is weak evidence of real testing |
| day1_date | The first day of that tester's 14-day window | Normally the same as `opted_in_on` |
| still_opted_in | Yes/No, re-checked every few days | If it flips to No, that tester's clock restarts when they return |
| feedback_received | Short note | Google asks about feedback specifically |
| issue_found | What broke | Device and Android version belong in `notes` |
| issue_resolved | How and when | Say whether the fix went out as an OTA or a new binary |
| notes | Device, Android version, anything unusual | — |

Rules that protect the 14-day clock: recruit 14–15 so a dropout does not sink the count; never
remove and re-add a tester, swap the list or delete the track mid-window; a Google Group makes
membership changes safe; count only accounts that actually opted in.

---

## 13. Checklist for the day account verification clears

Run it in order and stop where it says stop.

1. Confirm **identity verification is approved** in Console — not "submitted", approved.
2. Complete **contact phone verification** (it unlocks only after step 1).
3. Confirm **Create app** is enabled.
4. Create the app record: name `FamilyFinance PRO`, default language **Hebrew (he-IL)**, type App,
   Free.
5. Confirm the package name `com.familyfinance.pro` is accepted — it is fixed at the first upload
   and can never be changed for this app.
6. Confirm the app name is available and, if taken, decide on an alternative **before** filling
   anything else in.
7. Open the **Financial features** declaration, read its definition and help text, walk the matrix
   in §5, choose the defensible answer, and record the choice and the date here.
8. Fill the **store listing** draft fields from §1: name, short description, full description,
   support email, privacy policy URL, website left empty. Save as draft. Assets can come later;
   the icon from §2 can be uploaded now.
9. Fill the **Data Safety** draft from §4's ready-to-enter sheet. Save as draft; submit only when
   the rest of App content is consistent.
10. Complete the remaining App content declarations from §3 (ads, app access, content rating,
    target audience, news, government, health, COVID).
11. Create the **internal testing** track and prepare the tester list from §12 — do not invite
    anyone yet.
12. **STOP before uploading any AAB.** The build strategy in §9 (A or B) is not approved, and no
    OTA-capable binary exists. Uploading is Stage 3B/4B work, after the EAS quota resets on
    01/10/2026.

---

## Rules for this file

Update it when an answer is actually decided in Console — record what was chosen and when. Never mark
anything as submitted before it has been submitted.
