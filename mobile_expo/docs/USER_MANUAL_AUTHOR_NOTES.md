# User manual — author notes (internal)

Not user-facing. This file carries the evidence behind `USER_MANUAL.md`, the decisions taken while
writing it, the open questions, and the recommended architecture for the future in-app Help Center.

Written 18/09/2026 against commit `c07afc0`. Every claim in the manual was verified in the source at
that commit; the references below are where to look when the manual has to be re-verified.

## Rules for maintaining the manual

1. **No claim without code.** If a behavior cannot be traced to source, it does not go in the manual.
   Mark it "טעון בדיקה" here instead and leave it out.
2. **Never document a disabled or dev-only feature as working** — the category search field, the
   empty "אפשרויות ניסיוניות" screen, and the `__DEV__`-only diagnostics route.
3. **Never describe the PIN as encryption.** The app itself says the opposite, in those words.
4. **No implementation detail in the user-facing text** — no key names, no function names, no
   hashing internals. Those live here.
5. **Anchors are permanent.** `<a id="sec-N-M">` ids are referenced by the TOC, by cross-references
   and — once the Help Center exists — by deep links from app screens. Renaming a heading is free;
   changing an id is a breaking change.
6. When the app changes, update the manual **and** the screenshot manifest in the same commit.

## Evidence by section

| Manual section | Source of truth |
|---|---|
| 1.2–1.3 what the app does / does not do | `src/domain/cashflow.ts`, `src/presentation/*`; absence of network calls verified by grep over `src/` and `app/` (no `fetch`/`XMLHttpRequest`/`WebSocket`/SDKs) |
| 1.4 local storage, no system backup | `src/data/familyFinanceRepository.ts`, `plugins/withNoAndroidBackup.js`, `app.json` `allowBackup:false` |
| 2.1 tabs and titles | `src/navigation/routes.ts:4,8-14,24-30`; `app/(tabs)/_layout.tsx:26,36-37,108-119` |
| 2.5 settings topics | `src/presentation/settingsView.ts:9-18`; activity-log actions `src/domain/activityLog.ts:10-20`; cap `ACTIVITY_LOG_MAX = 200` in `src/domain/keys.ts:14`; experimental screen `app/settings-topic/[topic].tsx:76-80` |
| 3.2 hero and its disclaimer | `src/presentation/homeView.ts:114-145`; day-walk `src/domain/forecast.ts:274-287` |
| 3.3 income card = plain sum | `src/domain/aggregates.ts:106-107` |
| 3.4 remaining expenses rule | `src/domain/homeTotals.ts:53-69`; `isExpenseEvent` (excludes withdrawals) `src/domain/cashflow.ts:146-148`; period bounds `src/domain/forecast.ts:29-40` |
| 3.6 tiles, splits, toggle | `src/presentation/homeView.ts:160-214`; fixed split `src/domain/aggregates.ts:33-44`; loan split `src/domain/resolvers.ts:32-37`; credit tile window (current + next month) `src/domain/aggregates.ts:89-94`; principal vs total `src/domain/aggregates.ts:162-179`; tile reorder `app/(tabs)/index.tsx:118-144` |
| 3.7 upcoming / recent activity | `src/domain/upcomingCharges.ts:27,52-61`; `src/domain/recentActivity.ts:1-13,43-46`; relative wording `src/presentation/format.ts:51-59` |
| 4 opening balance | `app/opening-balance.tsx:28-31,60-101`; snapshot of same-day withdrawal ids `src/domain/settings.ts:121-133`; the "already included" rule and its cash-withdrawal exception `src/domain/forecast.ts:124-128,144`; withdrawal-before-opening guard `src/domain/itemWrites.ts:88-90` |
| 5–9 item forms, fields, validation | `app/item-form.tsx:166-261` (labels), `src/domain/itemWrites.ts:66-90,263-429` (messages); settlement always bank `src/domain/itemWrites.ts:341-345` |
| 5.3 / 6.2 day clamping, yearly /12, bi-monthly parity | `src/domain/dates.ts:5-12`; `src/domain/resolvers.ts:39-61`; `src/domain/cashflow.ts:86-98` |
| 7–8 obligations, payments left, lifecycle alerts | `src/domain/dates.ts:26-48`; chips `src/presentation/transactionsView.ts:52-63`; alerts `src/domain/obligationLifecycle.ts:30-36,65-115`; auto-archive sweep `src/domain/aggregates.ts:231-250` + `src/state/financeController.ts:417-436` |
| 10 cash withdrawals | `app/(tabs)/index.tsx:182-266`; `src/presentation/homeView.ts:237-254`; `src/domain/cashflow.ts:132-148` |
| 11 forecast | `src/presentation/forecastView.ts:72-203`; `app/(tabs)/forecast.tsx:81-247`; period label `src/presentation/format.ts:43-48`; next event (2-month look-ahead, strictly after today) `src/domain/forecast.ts:42-49`; tracking cards `src/domain/aggregates.ts:25-31,133-144` |
| 12 categories | `src/domain/categoryConfig.ts:8-22`; `src/domain/categoryWrites.ts:18-34,79-83,129-131,173-197`; page layout `app/category/[key].tsx:93-166`; disabled search `app/category/[key].tsx:109-115` |
| 13 goals | `app/(tabs)/goals.tsx:88-308`; `app/goal-form.tsx:39-70`; `app/component-form.tsx:49-66`; planning/FIFO `src/domain/goalsPlanning.ts:16-43,49-70,100-112,174-215`; reminder dialog `src/ui/GoalsReminderDialog.tsx:31-119`; scheduler `src/notifications/goalsReminderScheduler.ts:23,86-144`; schedule `src/notifications/goalsReminderSchedule.ts:6-13` |
| 14 alerts | `src/domain/alerts.ts:51-105`; Home filter dropping upcoming-income `src/presentation/homeView.ts:219-222`; settings rows `app/settings-topic/[topic].tsx:243-246` |
| 15 security | `app/settings-topic/[topic].tsx:88-217`; PIN length `src/security/pinRecord.ts:23-26`; lock on background `src/security/lifecycle.ts:12-14`; screen privacy `src/security/privacyPolicy.ts:5-31`; lock screen `app/lock.tsx:71-147` |
| 16 backup/restore | `src/domain/backup.ts:29-165`; controller messages `src/state/backupController.ts:55-73,169-254`; folder vs share `src/platform/expoFileGateway.ts:63,99-138`; atomic write `src/data/familyFinanceRepository.ts:262-268` |
| 17 CSV | `src/domain/csvExport.ts:1-37` (18 columns, BOM, CRLF, file name); share-only path `app/settings-topic/[topic].tsx:368` |
| 18 reset | `app/settings-topic/[topic].tsx:384-416`; confirmation word and scope `src/state/backupController.ts:228-237`; `src/data/familyFinanceRepository.ts:249-260`; what survives `src/data/storageKeys.ts:28-36` |
| 19 privacy, updates | `privacy/index.html` (section "עדכוני אפליקציה"); `GOOGLE_PLAY_DATA_SAFETY.md` |

## Quirks documented in the FAQ, and why

Per the product owner's decision (18/09/2026), genuine quirks a user can hit are explained plainly in
[20. שאלות נפוצות](USER_MANUAL.md) rather than hidden. Each is phrased as behavior with a reason, not
as an apology.

| FAQ | The quirk | Source | Note |
|---|---|---|---|
| 3 | On days 1–4 the displayed cycle has not started yet, so today's row is absent from the Forecast table and the Home remaining-expenses card skips charges due in the next 1–3 days | `src/domain/forecast.ts:29-40`; `src/domain/homeTotals.ts:66` | **Approved behavior**, not a defect: Decision A of 17/09/2026 kept `date > today` and the current bounds after a proposed change would have reverted Web v1.4.7 (commit `58d3ca8`) |
| 6 | A credit-paid fixed item can raise "תשלום צפוי מחר" although it never appears in "מה צפוי לרדת" | `src/domain/alerts.ts:51-58` compares day-of-month only, without the payment-method filter the charge list applies (`src/domain/upcomingCharges.ts:5-12`) | **Candidate defect.** Balances are unaffected — only the alert is noisy. Fixing it means filtering the alert by payment method; that touches `computeInAppAlerts`, which is compared against the Web app by the parity suite, so it needs a deliberate deviation decision |
| 7 | For a billing day of 29–31, the forecast event fires on the clamped date (e.g. 28 Feb) but the payments-left counter waits for the raw day (31 Mar), so the loan/instalment tiles over-count for those days | clamp `src/domain/dates.ts:5-12`; counter `src/domain/dates.ts:44` (`todayZero.getDate() >= range.bDay`) | **Real inconsistency.** Documented with the practical workaround (use a billing day ≤ 28). Worth a product decision later: clamp the counter the same way the event is clamped |
| 8 | A yearly fixed item is spread as amount/12 every month instead of charging once a year | `src/domain/resolvers.ts:60`; `src/domain/cashflow.ts:90` | Intended model (CLAUDE.md §10), but consistently surprising — documented with the alternative (a dated one-time charge) |
| 9 | The Home "הכנסות" card is the configured monthly total, with no date filter | `src/domain/aggregates.ts:106-107` | Intended; documented so users stop reading it as "income received so far" |
| 10 | A cash withdrawal reduces the balance but is not an expense | `src/domain/cashflow.ts:132-148` | Intended; documented with the double-counting warning |

## Open questions / things deliberately not documented

1. **Overdue component label.** The component name is prefixed to an overdue note only when the goal
   has **more than one** component (`src/presentation/goalsView.ts:68`). With exactly one component
   the note carries no name. No comment justifies the `> 1`. The manual describes the note generally
   and does not state the rule. Confirm with the product owner whether this is Web parity or an
   off-by-one.
2. **"מה חדש" in אודות is stale.** The list is a hard-coded constant
   (`src/presentation/settingsView.ts:21-28`) predating goals, reminders and the alert changes. The
   manual does not quote it.
3. **Standalone cash-withdrawal create screen is unreachable.** `app/item-form.tsx:126` supports a
   "משיכת מזומן חדשה" screen, but nothing navigates to it — creation happens only inline on Home. The
   manual documents the inline flow only.
4. **CSV folder export exists in code but has no UI** (`src/state/backupController.ts:141` supports
   `'folder'`; only `'share'` is wired). The manual documents share only. Gap, not behavior.
5. **`notifications.upcomingIncome`** still exists in stored settings and defaults to `true`
   (`src/domain/settings.ts:51`) but controls nothing reachable. The manual says upcoming-income
   alerts were **removed**, never "turned off".
6. **Play-installed vs sideloaded signature.** FAQ 12 warns that an app installed from a manually
   transferred file may not be updatable in place by a Play install. Kept deliberately vague — the
   full explanation is in `PLAY_RELEASE.md` §7 and is not a user-manual topic.
7. **Legacy `pinHash`** inside `family_finance_settings` rides along in backup files but authenticates
   nothing. Not mentioned in the manual on purpose (implementation detail, and the privacy policy
   already avoids it).

## In-app Help Center — recommended architecture (not implemented)

Three options were evaluated against this repository's constraints: first-party Expo modules only
(`.npmrc` `legacy-peer-deps=true` exists to stop third-party native modules arriving by accident),
ESLint-enforced pure layers, a scarce EAS build quota, and OTA-only shipping of JS changes.

| | A. render Markdown at runtime | B. bundled static HTML | **C. generated content model (recommended)** |
|---|---|---|---|
| New dependencies | 3 runtime (markdown-it + renderer + image lib) | `react-native-webview` — third-party **native** | **0** |
| Feasible here | yes, with friction | **no** — RN cannot render HTML without a webview; `expo-web-browser` cannot open a bundled `file://` | yes |
| Costs an EAS build | no | **yes**, and ends OTA-only help updates | no |
| RTL control | custom renderer rules needed for ordered lists and inline Latin terms | free, but unthemed | full, via `src/core/bidi.ts` |
| Anchors / deep links | **none** — headings get no ids | fragment only, not addressable from RN | typed ids, testable |
| Search | none | none | pure function in `src/presentation/` |
| Theme + font scale | duplicate style table, drifts | manual CSS injection | reuses `src/ui/kit.tsx` |
| PDF reuse | separate pipeline | is the pipeline | same model → HTML emitter |

**Recommendation: C.** `USER_MANUAL.md` stays the single authored source; a build script parses a
constrained Markdown dialect into a typed, frozen module, and a test re-runs the parser and asserts
the committed artifact matches — so the app can never drift from the document.

Implied layout (nothing created yet):

```
docs/USER_MANUAL.md                    authored source (exists)
docs/manual/images/<id>.png            masters for repo + PDF
docs/manual/USER_MANUAL.html           generated, print/PDF
src/content/manualTypes.ts             Doc / Section / Block / InlineRun
src/content/manualParser.ts            pure TS parser, no dependencies
src/content/manual.generated.ts        generated, committed, frozen
src/content/manualImages.ts            id -> require() for the bundled copies
src/presentation/helpView.ts           TOC, task links, search, section lookup
src/navigation/helpLinks.ts            typed anchor ids used for deep links
src/ui/ManualBlocks.tsx                renderers over existing kit primitives
app/help/index.tsx, app/help/[section].tsx
scripts/build-manual.mjs               regenerates the module + the HTML
test/manual.test.ts                    parser tests, drift test, link/id/manifest integrity
```

Notes that matter at implementation time: `src/content/**` must be added to the pure-layer list in
`eslint.config.js`; Hebrew search needs normalization (strip niqqud, fold final forms ם/ן/ץ/ף/ך,
normalize geresh/gershayim); heading ids must stay explicit ASCII — auto-slugged Hebrew anchors are
unstable and percent-encoded.

### Image policy (mandatory)

Every screenshot the manual references must also be available **inside the in-app Help Center**, not
only in the repository and PDF versions.

- Masters stay in `docs/manual/images/` at full resolution, for the repository and the print build.
- After Stage 3B, an **optimized copy is generated for every referenced screenshot** (WebP or
  compressed PNG, resized to phone width) into `assets/manual/` and bundled with the app, so the app
  is not carrying full-resolution masters.
- The Help Center **loads images per section**, never the whole set at once.
- Everything is local and bundled: the Help Center works **offline**, with **no remote or cloud image
  dependency**.
- `USER_MANUAL_SCREENSHOTS.md` is the single mapping between manual section, master and in-app asset.
- The only exception is a screen that FLAG_SECURE makes technically impossible to capture (a screen
  shown while a PIN is active). Those rows are `NOT_CAPTURABLE_SECURITY` and are explained with text
  or a native illustration. **A screenshot is never faked, mocked up or reconstructed.**

Because EAS Update ships assets as well as code, growing the bundled set later needs no new binary —
but it does grow every user's update download, so additions stay reviewed through the manifest.
