# User manual — screenshot manifest

The single mapping between a manual section, its master image and its optimized in-app copy.
Source manual: `USER_MANUAL.md`. Every id below is referenced exactly once by the manual, and the
manual references nothing that is not listed here.

**Status: nothing is captured.** All 57 capturable rows are `PENDING_STAGE_3B`; 2 rows are
`NOT_CAPTURABLE_SECURITY`. No row is complete.

## Why capture is blocked

The binary installed on the A54 predates commits `5af2487` and `318f59d`, so it still shows routine
upcoming-income alerts on Home and the upcoming-income switch in Settings — both removed from the
product. Screenshots taken from it would document a UI that no longer exists. Capture only from the
Stage 3B build.

## Capture rules (apply to every row)

1. **Synthetic data only.** Load `src/composition/syntheticDataset.ts` through
   Settings ▸ נתונים ▸ הדבקת גיבוי כטקסט. It loads in a release build — no development build needed.
   **No real family finances may appear in any image.**
2. **Set an opening balance first**, otherwise Home and Forecast render prompts instead of numbers.
   Use a round figure (e.g. ₪12,340) dated today, unless the row says otherwise.
3. **Capture with no PIN configured.** `src/platform/expoScreenPrivacy.ts` applies FLAG_SECURE
   whenever a lock exists, so every screenshot taken with a PIN set comes out black. This is why two
   rows below can never be captured.
4. **Never in shot:** the disabled search field (except `manual-44`, where it is the subject), the
   empty "אפשרויות ניסיוניות" screen, the dev-only diagnostics entry, real names, real amounts.
5. Portrait, ≥1080 px wide, device status bar included, light theme, default font size.
6. **Annotations are never burned into the image.** The numbered legend lives in the manual text
   beneath the screenshot; the "Legend" column below is that text.

## Data states referenced in the table

| Code | Meaning |
|---|---|
| `base` | Synthetic dataset loaded + opening balance set |
| `empty` | Fresh install, no data, no opening balance |
| `base+arch` | `base`, after an obligation has been auto-archived (advance the device clock or use an item whose last payment has passed) |
| `base+cc` | `base`, with a credit-card settlement charge created today |
| `base+goal` | `base`, goals from the synthetic dataset, one with components, one overdue |
| `base+wd` | `base`, with 2–3 cash withdrawals in the current calendar month |
| `n/a` | No data needed (form or settings screen) |

## Files

- **Master** (repository + PDF): `docs/manual/images/<id>.png`, full resolution, committed.
- **In-app** (bundled with the app): `assets/manual/<id>.webp`, resized to phone width and
  compressed. Generated from the master after Stage 3B; **every row below gets one** so the in-app
  Help Center shows the same screenshot as the manual, offline, with no remote image dependency.
  The Help Center loads images per section, not all at once.

## Manifest

| ID | Manual section | Screen | Required state | Data | Legend (numbered, in text) | Caption (he) | Master | In-app | Status |
|---|---|---|---|---|---|---|---|---|---|
| manual-01-first-launch-home-empty | 1.4 | בית | First launch, no opening balance, "לא הוגדרה" visible | `empty` | — | מסך הבית בפתיחה ראשונה, לפני הגדרת יתרת פתיחה | docs/manual/images/manual-01-first-launch-home-empty.png | assets/manual/manual-01-first-launch-home-empty.webp | PENDING_STAGE_3B |
| manual-02-opening-balance-form | 2.2 | יתרת התחלה | Form open, amount and date filled, not yet saved | `n/a` | 1 — סכום · 2 — תאריך · 3 — הערת משיכות מזומן · 4 — שמירה | מסך הגדרת יתרת פתיחה | docs/manual/images/manual-02-opening-balance-form.png | assets/manual/manual-02-opening-balance-form.webp | PENDING_STAGE_3B |
| manual-03-first-items-category-page | 2.3 | קטגוריה (הוצאות קבועות) | Active tab, 3–4 rows, FAB visible, search field out of frame | `base` | 1 — סה״כ החודש · 2 — רשימת התנועות · 3 — כפתור הוספה | עמוד קטגוריה עם כפתור ההוספה | docs/manual/images/manual-03-first-items-category-page.png | assets/manual/manual-03-first-items-category-page.webp | PENDING_STAGE_3B |
| manual-04-home-ready | 2.4 | בית | Scrolled to top, hero shows an amount | `base` | — | מסך הבית אחרי הזנת הנתונים הראשונים | docs/manual/images/manual-04-home-ready.png | assets/manual/manual-04-home-ready.webp | PENDING_STAGE_3B |
| manual-05-settings-menu | 2.5 | הגדרות | Topic list, all eight rows visible | `n/a` | — | תפריט ההגדרות | docs/manual/images/manual-05-settings-menu.png | assets/manual/manual-05-settings-menu.webp | PENDING_STAGE_3B |
| manual-06-home-overview | 3.1 | בית | Full screen from hero down to the alerts section | `base` | 1 — יתרה צפויה להיום · 2 — הכנסות · 3 — הוצאות שנותרו · 4 — אריחים · 5 — התראות · 6 — מה צפוי לרדת | מסך הבית — מבט כללי | docs/manual/images/manual-06-home-overview.png | assets/manual/manual-06-home-overview.webp | PENDING_STAGE_3B |
| manual-07-home-hero | 3.2 | בית | Hero card only, disclaimer line legible | `base` | 1 — הסכום · 2 — ההבהרה שאינה יתרת בנק מאומתת | כרטיס היתרה הצפויה להיום | docs/manual/images/manual-07-home-hero.png | assets/manual/manual-07-home-hero.webp | PENDING_STAGE_3B |
| manual-08-home-income-card | 3.3 | בית | The "הכנסות" card | `base` | — | כרטיס ההכנסות | docs/manual/images/manual-08-home-income-card.png | assets/manual/manual-08-home-income-card.webp | PENDING_STAGE_3B |
| manual-09-home-remaining-expenses-card | 3.4 | בית | The remaining-expenses card, non-zero value | `base` | — | כרטיס ההוצאות שנותרו עד סוף המחזור | docs/manual/images/manual-09-home-remaining-expenses-card.png | assets/manual/manual-09-home-remaining-expenses-card.webp | PENDING_STAGE_3B |
| manual-10-home-alerts | 3.5 | בית | Alerts section with at least two rows | `base` | 1 — תשלום צפוי מחר · 2 — נשאר תשלום אחד | אזור ההתראות במסך הבית | docs/manual/images/manual-10-home-alerts.png | assets/manual/manual-10-home-alerts.webp | PENDING_STAGE_3B |
| manual-11-home-tiles | 3.6 | בית | Tile grid, both split lines visible | `base` | 1 — הוצאות קבועות (בנק/אשראי) · 2 — הלוואות (בנק/תלוש) · 3 — חיוב כרטיס אשראי · 4 — יתרת תשלומים שונים | אריחי הקטגוריות במסך הבית | docs/manual/images/manual-11-home-tiles.png | assets/manual/manual-11-home-tiles.webp | PENDING_STAGE_3B |
| manual-12-home-loan-balance-toggle | 3.6 | בית | The loan-balance tile, one pill active | `base` | — | אריח יתרת הלוואות עם המתג קרן / סה״כ | docs/manual/images/manual-12-home-loan-balance-toggle.png | assets/manual/manual-12-home-loan-balance-toggle.webp | PENDING_STAGE_3B |
| manual-13-home-upcoming | 3.7 | בית | Upcoming list, 3+ rows, "מחר" row present | `base` | — | מה צפוי לרדת בעשרה הימים הקרובים | docs/manual/images/manual-13-home-upcoming.png | assets/manual/manual-13-home-upcoming.webp | PENDING_STAGE_3B |
| manual-14-home-recent-activity | 3.7 | בית | Recent-activity section, 4 rows | `base` | — | פעילות אחרונה | docs/manual/images/manual-14-home-recent-activity.png | assets/manual/manual-14-home-recent-activity.webp | PENDING_STAGE_3B |
| manual-15-opening-balance-saved | 4.1 | הגדרות ▸ יתרת התחלה | Saved amount and date shown | `base` | 1 — הסכום · 2 — התאריך · 3 — כפתור תיקון | יתרת התחלה שמורה | docs/manual/images/manual-15-opening-balance-saved.png | assets/manual/manual-15-opening-balance-saved.webp | PENDING_STAGE_3B |
| manual-16-opening-balance-replace-confirm | 4.2 | יתרת התחלה | Replace confirmation dialog open | `base` | — | אישור החלפת יתרת פתיחה קיימת | docs/manual/images/manual-16-opening-balance-replace-confirm.png | assets/manual/manual-16-opening-balance-replace-confirm.webp | PENDING_STAGE_3B |
| manual-17-income-form | 5.1 | תנועה חדשה — הכנסות | Filled, before save | `n/a` | 1 — שם · 2 — סכום · 3 — יום כניסה | טופס הוספת הכנסה | docs/manual/images/manual-17-income-form.png | assets/manual/manual-17-income-form.webp | PENDING_STAGE_3B |
| manual-18-income-row | 5.4 | קטגוריה (הכנסות) | One income row, action menu closed | `base` | 1 — הסכום · 2 — "נכנס ב-D לחודש" · 3 — תפריט הפעולות | שורת הכנסה בעמוד הקטגוריה | docs/manual/images/manual-18-income-row.png | assets/manual/manual-18-income-row.webp | PENDING_STAGE_3B |
| manual-19-fixed-form | 6.1 | תנועה חדשה — הוצאות קבועות | Filled, bank selected, monthly | `n/a` | 1 — שם וסכום · 2 — יום ירידה · 3 — איפה יורד · 4 — תדירות | טופס הוצאה קבועה | docs/manual/images/manual-19-fixed-form.png | assets/manual/manual-19-fixed-form.webp | PENDING_STAGE_3B |
| manual-20-fixed-bimonthly-month | 6.2 | תנועה חדשה — הוצאות קבועות | Bi-monthly selected, month sheet open | `n/a` | — | בחירת חודש התחלה להוצאה דו-חודשית | docs/manual/images/manual-20-fixed-bimonthly-month.png | assets/manual/manual-20-fixed-bimonthly-month.webp | PENDING_STAGE_3B |
| manual-21-fixed-row | 6.3 | קטגוריה (הוצאות קבועות) | One monthly row and one yearly row | `base` | 1 — הסכום · 2 — יום ותדירות · 3 — תפריט הפעולות | שורת הוצאה קבועה | docs/manual/images/manual-21-fixed-row.png | assets/manual/manual-21-fixed-row.webp | PENDING_STAGE_3B |
| manual-22-variable-form | 7.1 | תנועה חדשה — תשלומים שונים | Filled, helper card visible | `n/a` | 1 — עלות חודשית · 2 — מספר תשלומים · 3 — תאריך התחלה · 4 — אמצעי תשלום | טופס עסקה בתשלומים | docs/manual/images/manual-22-variable-form.png | assets/manual/manual-22-variable-form.webp | PENDING_STAGE_3B |
| manual-23-variable-row-chips | 7.4 | קטגוריה (תשלומים שונים) | Row with payment chips mid-way (e.g. 3/12) | `base` | 1 — תשלום 3/12 · 2 — היתרה שנותרה | שורת פריסה עם מונה התשלומים | docs/manual/images/manual-23-variable-row-chips.png | assets/manual/manual-23-variable-row-chips.webp | PENDING_STAGE_3B |
| manual-24-alert-last-payment | 7.5 | בית | Alerts section showing "נשאר תשלום אחד" | `base` | — | התראת נשאר תשלום אחד | docs/manual/images/manual-24-alert-last-payment.png | assets/manual/manual-24-alert-last-payment.webp | PENDING_STAGE_3B |
| manual-25-variable-archived | 7.6 | קטגוריה ▸ ארכיון | Archive tab with a finished obligation | `base+arch` | — | התחייבות שהסתיימה בלשונית הארכיון | docs/manual/images/manual-25-variable-archived.png | assets/manual/manual-25-variable-archived.webp | PENDING_STAGE_3B |
| manual-26-loan-form | 8.1 | תנועה חדשה — הלוואות | Filled, bank selected | `n/a` | 1 — סכום מקור · 2 — החזר חודשי · 3 — היכן יורד · 4 — ריבית · 5 — מספר תשלומים | טופס הלוואה | docs/manual/images/manual-26-loan-form.png | assets/manual/manual-26-loan-form.webp | PENDING_STAGE_3B |
| manual-27-loan-payroll-option | 8.4 | תנועה חדשה — הלוואות | "דרך תלוש השכר" chip selected | `n/a` | — | בחירת דרך תלוש השכר | docs/manual/images/manual-27-loan-payroll-option.png | assets/manual/manual-27-loan-payroll-option.webp | PENDING_STAGE_3B |
| manual-28-loan-row | 8.5 | קטגוריה (הלוואות) | Two rows: one bank, one payroll | `base` | — | שורת הלוואה עם מונה התשלומים | docs/manual/images/manual-28-loan-row.png | assets/manual/manual-28-loan-row.webp | PENDING_STAGE_3B |
| manual-29-settlement-form | 9.1 | תנועה חדשה — חיוב כרטיס אשראי | Filled incl. 4 digits | `n/a` | 1 — הסכום · 2 — תאריך החיוב · 3 — ארבע ספרות | טופס חיוב כרטיס אשראי | docs/manual/images/manual-29-settlement-form.png | assets/manual/manual-29-settlement-form.webp | PENDING_STAGE_3B |
| manual-30-home-credit-tile | 9.3 | בית | Credit tile with an amount and "עודכן" line | `base+cc` | — | אריח חיוב כרטיס האשראי | docs/manual/images/manual-30-home-credit-tile.png | assets/manual/manual-30-home-credit-tile.webp | PENDING_STAGE_3B |
| manual-31-withdrawal-quick-add | 10.1 | בית | Withdrawal section, one draft row filled | `base+wd` | 1 — סכום · 2 — תאריך · 3 — הערה · 4 — שמירה | הוספת משיכת מזומן ממסך הבית | docs/manual/images/manual-31-withdrawal-quick-add.png | assets/manual/manual-31-withdrawal-quick-add.webp | PENDING_STAGE_3B |
| manual-32-withdrawal-edit | 10.2 | עריכת משיכת מזומן | Edit form with the warning card visible | `base+wd` | — | עריכת משיכת מזומן | docs/manual/images/manual-32-withdrawal-edit.png | assets/manual/manual-32-withdrawal-edit.webp | PENDING_STAGE_3B |
| manual-33-forecast-next-event | 11.1 | תחזית | Next-event card with a real event | `base` | — | כרטיס האירוע הכספי הבא | docs/manual/images/manual-33-forecast-next-event.png | assets/manual/manual-33-forecast-next-event.webp | PENDING_STAGE_3B |
| manual-34-forecast-chart | 11.4 | תחזית | Chart populated, period label legible | `base` | 1 — טווח המחזור · 2 — מדרגת היתרה · 3 — קו האפס | גרף היתרה היומית הצפויה | docs/manual/images/manual-34-forecast-chart.png | assets/manual/manual-34-forecast-chart.webp | PENDING_STAGE_3B |
| manual-35-forecast-daily-table | 11.5 | תחזית | Daily table, today's row highlighted, one negative day if possible | `base` | 1 — שורת היום · 2 — עמודת היתרה הצפויה · 3 — סימון יתרה שלילית | טבלת הפירוט היומי | docs/manual/images/manual-35-forecast-daily-table.png | assets/manual/manual-35-forecast-daily-table.webp | PENDING_STAGE_3B |
| manual-36-forecast-day-expanded | 11.6 | תחזית | A day with 2+ events expanded, withdrawal tag visible | `base+wd` | — | יום פתוח עם פירוט התנועות | docs/manual/images/manual-36-forecast-day-expanded.png | assets/manual/manual-36-forecast-day-expanded.webp | PENDING_STAGE_3B |
| manual-37-forecast-tracking-cards | 11.8 | תחזית | Both bottom cards with non-zero values | `base` | — | כרטיסי המעקב בתחתית מסך התחזית | docs/manual/images/manual-37-forecast-tracking-cards.png | assets/manual/manual-37-forecast-tracking-cards.webp | PENDING_STAGE_3B |
| manual-38-forecast-no-opening-balance | 11.9 | תחזית | Opening balance not set, prompt shown | `empty` | — | מסך התחזית ללא יתרת פתיחה | docs/manual/images/manual-38-forecast-no-opening-balance.png | assets/manual/manual-38-forecast-no-opening-balance.webp | PENDING_STAGE_3B |
| manual-39-categories-list | 12.1 | קטגוריות | Full list incl. "כל התנועות" and one custom category | `base` | — | מסך ניהול הקטגוריות | docs/manual/images/manual-39-categories-list.png | assets/manual/manual-39-categories-list.webp | PENDING_STAGE_3B |
| manual-40-category-page | 12.2 | קטגוריה | Header chip + tabs + rows; search field out of frame | `base` | 1 — סה״כ החודש · 2 — לשוניות · 3 — שורת תנועה | עמוד קטגוריה | docs/manual/images/manual-40-category-page.png | assets/manual/manual-40-category-page.webp | PENDING_STAGE_3B |
| manual-41-category-row-menu | 12.2 | קטגוריה | Action sheet open on an active row | `base` | — | תפריט הפעולות של תנועה | docs/manual/images/manual-41-category-row-menu.png | assets/manual/manual-41-category-row-menu.webp | PENDING_STAGE_3B |
| manual-42-category-archive-tab | 12.2 | קטגוריה ▸ ארכיון | Archive tab with at least one row | `base+arch` | — | לשונית הארכיון | docs/manual/images/manual-42-category-archive-tab.png | assets/manual/manual-42-category-archive-tab.webp | PENDING_STAGE_3B |
| manual-43-category-form | 12.3 | קטגוריה חדשה | Name filled, type sheet visible | `n/a` | 1 — שם · 2 — סוג · 3 — יום ברירת מחדל | טופס קטגוריה חדשה | docs/manual/images/manual-43-category-form.png | assets/manual/manual-43-category-form.webp | PENDING_STAGE_3B |
| manual-44-category-search-disabled | 12.4 | קטגוריה | Close-up of the disabled search field — here it IS the subject | `base` | — | שדה החיפוש הלא-פעיל | docs/manual/images/manual-44-category-search-disabled.png | assets/manual/manual-44-category-search-disabled.webp | PENDING_STAGE_3B |
| manual-45-goals-list | 13.1 | יעדים | Active tab, 2–3 collapsed goals, one with a badge | `base+goal` | — | רשימת היעדים | docs/manual/images/manual-45-goals-list.png | assets/manual/manual-45-goals-list.webp | PENDING_STAGE_3B |
| manual-46-goal-form | 13.1 | יעד חיסכון חדש | Filled, no components (target field editable) | `n/a` | 1 — שם · 2 — סכום יעד · 3 — תאריך יעד · 4 — נחסך כבר | טופס יעד חיסכון | docs/manual/images/manual-46-goal-form.png | assets/manual/manual-46-goal-form.webp | PENDING_STAGE_3B |
| manual-47-goal-expanded | 13.2 | יעדים | A goal expanded with 2+ components, one funded, scheduling note visible | `base+goal` | 1 — פס ההתקדמות · 2 — רכיב ממומן · 3 — סה״כ מרכיבים · 4 — הערת התזמון | כרטיס יעד פתוח עם רכיבים | docs/manual/images/manual-47-goal-expanded.png | assets/manual/manual-47-goal-expanded.webp | PENDING_STAGE_3B |
| manual-48-component-form | 13.2 | רכיב חדש | Filled, optional date empty | `n/a` | — | טופס רכיב יעד | docs/manual/images/manual-48-component-form.png | assets/manual/manual-48-component-form.webp | PENDING_STAGE_3B |
| manual-49-goals-reminder-dialog | 13.6 | דיאלוג תזכורת יעדים | Summary mode, 2 goals, total row and all three buttons visible | `base+goal` | 1 — הסכום לכל יעד · 2 — סה״כ מומלץ · 3 — אפשרויות האישור | חלון תזכורת החיסכון החודשית | docs/manual/images/manual-49-goals-reminder-dialog.png | assets/manual/manual-49-goals-reminder-dialog.webp | PENDING_STAGE_3B |
| manual-50-notifications-settings | 14.1 | הגדרות ▸ התראות | Both in-app toggles + the goals reminder section and status line | `n/a` | 1 — תשלום שצפוי מחר · 2 — התחייבות שהסתיימה · 3 — תזכורת היעדים | מסך הגדרות ההתראות | docs/manual/images/manual-50-notifications-settings.png | assets/manual/manual-50-notifications-settings.webp | PENDING_STAGE_3B |
| manual-51-security-no-pin | 15.1 | הגדרות ▸ אבטחה | **No PIN configured** — disclaimer and "+ הגדר PIN" visible | `n/a` | 1 — ההבהרה שהנתונים אינם מוצפנים · 2 — כפתור הגדרת PIN | מסך האבטחה לפני הגדרת PIN | docs/manual/images/manual-51-security-no-pin.png | assets/manual/manual-51-security-no-pin.webp | PENDING_STAGE_3B |
| manual-52-security-set-pin-form | 15.1 | הגדרות ▸ אבטחה | Set-PIN form open, fields **empty** (never show a real code) | `n/a` | — | טופס הגדרת PIN חדש | docs/manual/images/manual-52-security-set-pin-form.png | assets/manual/manual-52-security-set-pin-form.webp | PENDING_STAGE_3B |
| manual-53-lock-screen | 15.2 | מסך נעילה | Requires an active PIN → FLAG_SECURE blocks capture | `n/a` | — | מסך הנעילה — מתואר בטקסט בלבד | — | — | NOT_CAPTURABLE_SECURITY |
| manual-54-security-pin-active | 15.3 | הגדרות ▸ אבטחה | "PIN פעיל" + "הגנת מסך כעת: פעילה" — exists only with a PIN set → FLAG_SECURE blocks capture | `n/a` | — | מצב PIN פעיל — מתואר בטקסט בלבד | — | — | NOT_CAPTURABLE_SECURITY |
| manual-55-data-screen | 16.1 | הגדרות ▸ נתונים | All actions visible incl. the Android folder-backup button | `base` | 1 — גיבוי לתיקייה · 2 — גיבוי בשיתוף · 3 — שחזור · 4 — ייצוא CSV · 5 — איפוס | מסך הנתונים | docs/manual/images/manual-55-data-screen.png | assets/manual/manual-55-data-screen.webp | PENDING_STAGE_3B |
| manual-56-restore-preview | 16.4 | הגדרות ▸ נתונים | Preview card with counts, before confirming | `base` | 1 — תנועות · 2 — קטגוריות · 3 — יעדים · 4 — כפתור האישור | סקירת הגיבוי לפני השחזור | docs/manual/images/manual-56-restore-preview.png | assets/manual/manual-56-restore-preview.webp | PENDING_STAGE_3B |
| manual-57-paste-backup | 16.4 | הגדרות ▸ נתונים | Paste panel open with the label visible; paste area may hold synthetic JSON only | `base` | — | הדבקת גיבוי כטקסט | docs/manual/images/manual-57-paste-backup.png | assets/manual/manual-57-paste-backup.webp | PENDING_STAGE_3B |
| manual-58-csv-export | 17.2 | הגדרות ▸ נתונים | The CSV button, or the share sheet immediately after tapping it | `base` | — | ייצוא תנועות ל-CSV | docs/manual/images/manual-58-csv-export.png | assets/manual/manual-58-csv-export.webp | PENDING_STAGE_3B |
| manual-59-reset-confirm | 18.3 | הגדרות ▸ נתונים | Inline confirm block open, word field empty, **do not tap מחק הכל** | `base` | 1 — האזהרה · 2 — שדה המילה "איפוס" · 3 — כפתור המחיקה | אישור איפוס כל הנתונים | docs/manual/images/manual-59-reset-confirm.png | assets/manual/manual-59-reset-confirm.webp | PENDING_STAGE_3B |

## After Stage 3B

1. Capture the 57 rows above on the Stage 3B build, in the stated states.
2. Commit the masters to `docs/manual/images/`.
3. Generate the in-app copies into `assets/manual/` (WebP, phone width) — one per captured row.
4. Uncomment the image line in `USER_MANUAL.md` for each captured id and flip its status here to
   `CAPTURED`.
5. Re-run the link/manifest verification before committing.
6. The two `NOT_CAPTURABLE_SECURITY` rows stay as they are. **Never** substitute a mock-up, a
   re-creation or an edited image for them — the manual explains those screens in words.
