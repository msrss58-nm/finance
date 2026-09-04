    // ===== Stage 4.4 candidate: reads/writes the REAL app's own localStorage keys directly — =====
    // ===== no separate Preview/Real distinction anymore (this file IS the candidate for      =====
    // ===== family_finance_data/family_finance_cat_config). The seed-from-real, reset, and     =====
    // ===== status-line mechanisms that only made sense for an isolated Preview copy have been =====
    // ===== removed entirely (not just neutralized) — there is nothing left to seed from or    =====
    // ===== reset against once this file's own keys ARE the real ones.                         =====
    var DATA_KEY = 'family_finance_data';
    var CONFIG_KEY = 'family_finance_cat_config';

    // Version 1.1, Stage 4.0.3: settings + activity log keys — both new, both start with
    // 'family_finance_' (same prefix DATA_KEY/CONFIG_KEY already use), which is also the exact
    // prefix collectAppLocalStorageBackup()/confirmResetAllData() sweep to find every app key
    // without hardcoding a fixed list.
    var SETTINGS_KEY = 'family_finance_settings';
    var ACTIVITY_LOG_KEY = 'family_finance_activity_log';
    var ACTIVITY_LOG_MAX = 200;
    // Milestone 4: same 'family_finance_' prefix as every other key above — automatically
    // included by collectAppLocalStorageBackup()'s/confirmResetAllData()'s existing prefix-sweep
    // with zero changes to either function.
    var GOALS_KEY = 'family_finance_goals';
    var APP_VERSION = '1.4.5';

    var PRIMARY_COLOR_OPTIONS = [
        { key: 'green', label: 'ירוק' },
        { key: 'blue', label: 'כחול' },
        { key: 'purple', label: 'סגול' },
        { key: 'teal', label: 'טורקיז' },
        { key: 'orange', label: 'כתום' },
        { key: 'graphite', label: 'אפור כהה' }
    ];
    var THEME_OPTIONS = [
        { key: 'light', label: 'בהיר' },
        { key: 'dark', label: 'כהה' },
        { key: 'system', label: 'לפי המערכת' }
    ];
    var FONT_SIZE_OPTIONS = [
        { key: 'small', label: 'קטן' },
        { key: 'medium', label: 'רגיל' },
        { key: 'large', label: 'גדול' }
    ];
    var FONT_SIZE_ZOOM = { small: 0.9, medium: 1, large: 1.12 };

    // Version 1.2, Stage C: ordered topic list for the settings menu. Each `build` is one (or, for
    // "אבטחה", two — the exact concatenation the old flat settings screen used before this stage) of
    // the 8 existing section-builder functions, called verbatim — none of their internals changed.
    // `desc` is the short subtitle shown under the label in the topics menu (approved product
    // decision). Order matches the approved list exactly. Declared here (not lower, next to where
    // it's used) because the initial boot-time render of the settings menu happens far earlier in
    // file-execution order than that — referencing buildAppearanceSectionHtml etc. from up here is
    // still safe because function declarations (unlike this var) are fully hoisted to the top of the
    // script, so every buildXSectionHtml function is already callable at this point regardless of
    // where its own `function ...() {}` line physically sits further down the file.
    var SETTINGS_TOPICS = [
        { key: 'security', icon: '🔒', label: 'אבטחה', desc: 'PIN, נעילה אוטומטית', build: function () { return buildSettingsPinSectionHtml() + buildAutoLockSectionHtml(); } },
        { key: 'appearance', icon: '🎨', label: 'מראה', desc: 'ערכת נושא, צבעים וגודל גופן', build: function () { return buildAppearanceSectionHtml(); } },
        { key: 'notifications', icon: '🔔', label: 'התראות', desc: 'התראות בתוך האפליקציה', build: function () { return buildNotificationsSectionHtml(); } },
        { key: 'data', icon: '💾', label: 'נתונים', desc: 'גיבוי, שחזור וייצוא', build: function () { return buildDataSectionHtml(); } },
        // Version 1.4.2: one-time local opening balance for the projected daily balance engine —
        // see buildProjectedBalanceSeries()/getProjectedBalanceOpeningConfig() below. Deliberately
        // its own topic (not folded into 'data') — it is a calculation input, not a backup/export
        // concern.
        { key: 'openingBalance', icon: '⚖️', label: 'יתרת התחלה לחישוב', desc: 'נקודת התחלה לחישוב היתרה הצפויה', build: function () { return buildOpeningBalanceSectionHtml(); } },
        { key: 'activityLog', icon: '🕒', label: 'יומן פעילות', desc: 'היסטוריית פעולות', build: function () { return buildActivityLogSectionHtml(); } },
        { key: 'experimental', icon: '🧪', label: 'אפשרויות ניסיוניות', desc: 'פיצ\'רים עתידיים', build: function () { return buildExperimentalSectionHtml(); } },
        { key: 'about', icon: 'ℹ️', label: 'אודות', desc: 'גרסה ומה חדש', build: function () { return buildAboutSectionHtml(); } }
    ];

    // Version 1.4.2 correction: 'dated' added as a built-in default (key === baseType, matching
    // the existing income/fixed/variable/loan convention) — previously there was NO default
    // 'dated' category at all, so the "חיוב חד-פעמי"/"הוצאה מתוארכת" add-flow was disabled for
    // every user until they manually created a custom category for it first (a real, confirmed
    // product gap, not introduced by this correction). Deliberately named/labeled distinctly from
    // any pre-existing user-created "כרטיסי אשראי" category — this key is never reused, renamed,
    // or migrated into/out of anything the user already has.
    var DEFAULT_CATEGORY_CONFIG_JSON = JSON.stringify({
        income: { label: "💰 הכנסות", baseType: "income" },
        fixed: { label: "🏡 הוצאות קבועות", baseType: "fixed" },
        variable: { label: "🛒 תשלומים שונים", baseType: "variable" },
        loan: { label: "🏦 הלוואות", baseType: "loan" },
        dated: { label: "💳 חיוב כרטיס אשראי", baseType: "dated" }
    });

    // ===== Stage B: screen structure + static UI, fed only by MOCK_DATA below. No business logic, no calculations. =====
    var MOCK_DATA = {
        hero: {
            amount: "₪4,320",
            statusLabel: "תמונת מצב חודשית",
            narrative: "יש לך מרווח בטוח החודש. אפשר להמשיך כרגיל."
        },
        snapshot: {
            income: "₪12,500",
            expenses: "₪8,180",
            balance: "₪4,320"
        },
        attention: [
            { title: "חיוב כרטיס אשראי", detail: "בעוד 4 ימים", amount: "₪2,150" },
            { title: "תשלום הלוואת רכב", detail: "ה-5 לחודש הבא", amount: "₪890" },
            { title: "ביטוח דירה — חיוב שנתי", detail: "בעוד 12 יום", amount: "₪640" }
        ],
        recentActivity: [
            { icon: "💰", title: "משכורת", date: "01/07/2026", amount: "₪10,000", type: "income" },
            { icon: "🏡", title: "שכירות", date: "01/07/2026", amount: "-₪3,000", type: "expense" },
            { icon: "🛒", title: "מקרר — תשלום 3 מתוך 10", date: "05/07/2026", amount: "-₪350", type: "expense" },
            { icon: "🏦", title: "הלוואת רכב", date: "05/07/2026", amount: "-₪890", type: "expense" }
        ],
        transactions: [
            { icon: "💰", title: "משכורת", date: "01/07/2026", amount: "₪10,000", type: "income" },
            { icon: "🏡", title: "שכירות", date: "01/07/2026", amount: "-₪3,000", type: "expense" },
            { icon: "🛒", title: "מקרר — תשלום 3 מתוך 10", date: "05/07/2026", amount: "-₪350", type: "expense" },
            { icon: "🏦", title: "הלוואת רכב", date: "05/07/2026", amount: "-₪890", type: "expense" },
            { icon: "📅", title: "ביטוח דירה", date: "10/07/2026", amount: "-₪640", type: "expense" },
            { icon: "💳", title: "מנוי חדר כושר", date: "12/07/2026", amount: "-₪200", type: "expense" },
            { icon: "💰", title: "הכנסה נוספת — פרילנס", date: "18/07/2026", amount: "₪1,500", type: "income" }
        ],
        insights: [
            { title: "סך חיובי כרטיס אשראי החודש", value: "₪2,150", note: "מבוסס על הוצאות קבועות שסומנו ככרטיס אשראי.", tone: "normal" },
            { title: "יתרת הלוואות שנותרו", value: "₪14,200", note: "16 תשלומים נותרו עד סיום ההלוואות הפעילות.", tone: "normal" },
            { title: "אזהרת תחזית", value: "יתרה שלילית אפשרית", note: "התחזית ל-3 חודשים קדימה מצביעה על חודש עם יתרה שלילית.", tone: "warning" }
        ],
        categories: [
            { icon: "💰", label: "הכנסות" },
            { icon: "🏡", label: "הוצאות קבועות" },
            { icon: "🛒", label: "תשלומים שונים" },
            { icon: "🏦", label: "הלוואות" }
        ]
    };

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function renderTxList(containerId, list) {
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            html += '<div class="tx-row">' +
                '<div class="tx-icon">' + t.icon + '</div>' +
                '<div class="tx-info">' +
                    '<div class="tx-title">' + escapeHtml(t.title) + '</div>' +
                    (t.settlementNote ? '<div class="tx-note">' + escapeHtml(t.settlementNote) + '</div>' : '') +
                    '<div class="tx-date">' + escapeHtml(t.date) + '</div>' +
                '</div>' +
                '<div class="tx-amount ' + t.type + '">' + escapeHtml(t.amount) + '</div>' +
            '</div>';
        }
        document.getElementById(containerId).innerHTML = html;
    }

    // =====================================================================================
    // ===== Stage G.2.4/G.2.5/G.2.6: Transactions-only row-actions markup + wiring.          =====
    // ===== renderTxListWithActions() is a self-contained sibling of renderTxList() above     =====
    // ===== (that function is completely untouched) — Home's recent-activity-list keeps using =====
    // ===== plain renderTxList() exclusively, per the approved "⋮ menu on Transactions screen =====
    // ===== only" decision. toggleRowMenu()/handleRowMenuAction() (both defined further below,=====
    // ===== after archivePreviewItem()/unarchivePreviewItem()) are called via `this`-based     =====
    // ===== onclick — the item id travels only through the data-item-id attribute, never       =====
    // ===== concatenated into an onclick string. Only Stage G.2.6 connects this function to     =====
    // ===== renderTransactionsScreenFromRealData() (see that function below) and only Stage     =====
    // ===== G.2.6 gives the single action item a real onclick — no edit/delete affordance is    =====
    // ===== added anywhere.                                                                     =====
    // =====================================================================================

    function renderTxListWithActions(containerId, txItems) {
        var html = '';
        for (var i = 0; i < txItems.length; i++) {
            var t = txItems[i];

            // Stage G.4: if this row's item is the one currently being edited, its normal
            // .tx-row markup (icon/title/date/amount/⋮ menu) is replaced entirely by the inline
            // edit form (product decision 2א). The full raw item (not the trimmed
            // mapItemToHomeTxRow() shape `t`) is looked up fresh from the live `items` array —
            // same "never trust the previously-rendered shape, re-derive from the live array"
            // convention already used by handleRowMenuAction()/handleDeleteMenuAction() — so the
            // form always reflects the item's current in-memory state. A missing item (deleted by
            // another path between render and this lookup) simply falls through to the normal row
            // below rather than rendering a form for nothing.
            if (previewEditingId !== null && t.id === previewEditingId) {
                var editIdx = items.findIndex(function (it) { return it.id === t.id; });
                if (editIdx !== -1) {
                    html += buildPreviewEditFormHtml(items[editIdx]);
                    continue;
                }
            }

            // Reuses id/isArchived already added to mapItemToHomeTxRow()'s return shape in Stage
            // G.2.1 — no new data source, no new computation. actionLabel is the only new value
            // derived here, and it depends on nothing but that existing isArchived field.
            var actionLabel = t.isArchived ? 'שחזר' : 'העבר לארכיון';
            // Same escapeHtml() already used for every other user-derived string in this file
            // (title/date/amount below, unchanged from renderTxList()) — applied here to the id
            // (defensively, even though it is always numeric in practice) and to the aria-label,
            // since both are injected into HTML attributes. No raw id is ever placed inside an
            // onclick or any JS string — data-item-id is the only place it appears, as plain
            // attribute text, exactly as required.
            var safeId = escapeHtml(String(t.id));
            // Installment-card (Loans + Variable) collapsed-row summary: t.installmentProgress/
            // t.installmentBalance (mapItemToHomeTxRow()) are only ever truthy together, for a
            // loan or variable item with a usable total — every other row renders the same bare
            // .tx-date it always did, inside the same .tx-date-row wrapper (no extra children,
            // visually identical to the old plain .tx-date div).
            var installmentMetaHtml = t.installmentProgress ?
                '<span class="tx-installment-meta">' + escapeHtml(t.installmentProgress) + '</span>' +
                '<span class="tx-installment-meta">' + escapeHtml(t.installmentBalance) + '</span>' : '';
            // Version 1.1, Stage 4.0.2.1: the "✏️ עריכה" dropdown item is removed entirely — the
            // row itself is now the edit trigger (see rowOpenAttrs below). Editing is still only
            // available for active items (same "product decision 1א" restriction this dropdown
            // item used to enforce by simply not existing for archived rows) — that restriction
            // now lives in rowOpenAttrs instead: an archived row gets no onclick/tabindex/pointer
            // cursor at all, so it is neither clickable nor keyboard-focusable as an edit trigger,
            // exactly as before.
            //
            // handleTxRowClick()'s own first line bails out (no-op) when the click actually
            // originated inside .tx-menu-toggle or .tx-menu-dropdown (the same closest()-based
            // check the existing document-level "close other row menus" listener already uses) —
            // so ⋮/archive/restore/delete keep working completely unchanged, with no stopPropagation
            // needed anywhere: those buttons' own onclick handlers still fire first regardless, and
            // the row-level handler simply recognizes their origin and does nothing further.
            var rowOpenAttrs = t.isArchived ? '' :
                ' class="tx-row tx-row-clickable" tabindex="0" role="button" aria-label="' + escapeHtml('ערוך תנועה: ' + t.title) + '" onclick="handleTxRowClick(event, ' + t.id + ')" onkeydown="handleTxRowKeydown(event, ' + t.id + ')"';
            html += '<div' + (rowOpenAttrs || ' class="tx-row"') + '>' +
                '<div class="tx-icon">' + t.icon + '</div>' +
                '<div class="tx-info">' +
                    '<div class="tx-title">' + escapeHtml(t.title) + '</div>' +
                    (t.settlementNote ? '<div class="tx-note">' + escapeHtml(t.settlementNote) + '</div>' : '') +
                    '<div class="tx-date-row">' +
                        '<span class="tx-date">' + escapeHtml(t.date) + '</span>' +
                        installmentMetaHtml +
                    '</div>' +
                '</div>' +
                '<div class="tx-amount ' + t.type + '">' + escapeHtml(t.amount) + '</div>' +
                '<button type="button" class="tx-menu-toggle" data-item-id="' + safeId + '" aria-label="' + escapeHtml('פעולות עבור ' + t.title) + '" onclick="toggleRowMenu(this)">⋮</button>' +
                '<div class="tx-menu-dropdown">' +
                    '<button type="button" class="tx-menu-item" data-item-id="' + safeId + '" onclick="handleRowMenuAction(this)">' + escapeHtml(actionLabel) + '</button>' +
                    // Stage G.3: second, destructive menu item — same data-item-id-only wiring
                    // convention as the button above (id never enters a concatenated onclick
                    // string), routed to its own handler (handleDeleteMenuAction) further below
                    // rather than handleRowMenuAction(), which stays archive/restore-only.
                    '<button type="button" class="tx-menu-item tx-menu-item-danger" data-item-id="' + safeId + '" onclick="handleDeleteMenuAction(this)">' + escapeHtml('מחק לצמיתות') + '</button>' +
                '</div>' +
            '</div>';
        }
        document.getElementById(containerId).innerHTML = html;
    }

    function renderMockUI() {
        document.getElementById('hero-amount').textContent = MOCK_DATA.hero.amount;
        document.getElementById('hero-status').textContent = MOCK_DATA.hero.statusLabel;

        document.getElementById('snapshot-income').textContent = MOCK_DATA.snapshot.income;
        document.getElementById('snapshot-expenses').textContent = MOCK_DATA.snapshot.expenses;

        // attention-list is no longer rendered from MOCK_DATA.attention here — see Stage E.3's
        // renderAttentionListFromRealData() below, which renders it from real getBiggestUpcoming
        // Charge()/getForecastWarning() results instead. This function no longer reads
        // MOCK_DATA.attention at all.

        renderTxList('recent-activity-list', MOCK_DATA.recentActivity);
        // transactions-list is no longer rendered from MOCK_DATA.transactions here — see Stage
        // E.2's renderTransactionsScreenFromRealData() below, which renders it from real `items`
        // instead. This function no longer reads MOCK_DATA.transactions at all.

        var insightsHtml = '';
        for (var k = 0; k < MOCK_DATA.insights.length; k++) {
            var ins = MOCK_DATA.insights[k];
            var isWarning = ins.tone === 'warning';
            var toneClass = isWarning ? ' warning' : '';
            var toneIcon = isWarning ? '⚠️' : '📊'; // purely visual, derived from the existing tone field
            insightsHtml += '<div class="insight-card' + toneClass + '">' +
                '<div class="insight-icon">' + toneIcon + '</div>' +
                '<div class="insight-body">' +
                    '<div class="insight-title">' + escapeHtml(ins.title) + '</div>' +
                    '<div class="insight-value">' + escapeHtml(ins.value) + '</div>' +
                    '<div class="insight-note">' + escapeHtml(ins.note) + '</div>' +
                '</div>' +
            '</div>';
        }
        document.getElementById('insights-feed').innerHTML = insightsHtml;

        // category-list is no longer rendered from MOCK_DATA.categories here — see Stage E.1's
        // renderCategoriesScreenFromRealData() below, which renders it from the real categoryConfig
        // instead. This function no longer reads MOCK_DATA.categories at all.
    }

    // ===== Screen navigation (UI state only) =====
    // Version 1.2, Stage A: some screens are reachable without their own bottom-nav button (e.g.
    // 'transactions' as a category page, 'settings-detail' for a settings sub-topic) — SCREEN_NAV_ALIAS
    // says which existing nav button should stay highlighted instead. The primary lookup
    // (document.getElementById('nav-' + name)) is tried first and unchanged for every screen that
    // still has its own nav button, so this is a pure addition with no behavior change for any
    // screen name that was already working before this stage.
    var SCREEN_NAV_ALIAS = { transactions: 'categories', 'settings-detail': 'settings' };

    // =====================================================================================
    // ===== Version 1.4.1: Android/browser system Back support via the real History API.  =====
    // ===== Two independent mechanisms share one popstate handler:                          =====
    // =====  (1) SCREEN navigation — every showScreen() call pushes {screen:name}, so Back    =====
    // =====      steps through actual prior screens exactly like real browser history.       =====
    // =====  (2) TRANSIENT overlays (quick actions, the Goals reminder, the reset-all-data    =====
    // =====      confirmation) — pushTransientState() marks one history entry per open        =====
    // =====      overlay; the ONE function that makes each overlay invisible (already the     =====
    // =====      single choke point every existing close path already called) also calls      =====
    // =====      consumeTransient() at the end. That means a manual close (its own button,     =====
    // =====      Escape, a successful confirm) and a real Back press consume the exact SAME    =====
    // =====      history entry through the exact SAME close function — Back can never diverge  =====
    // =====      from "click cancel/postpone," and can never reach a save/delete/confirm path  =====
    // =====      because it always calls the same non-destructive close function that already  =====
    // =====      existed. No financial data is ever touched by any of this.                    =====
    // =====================================================================================
    var NAV_STATE_VERSION = 1;
    var transientStack = []; // { type: string, onClose: function }
    var isRestoringNavFromHistory = false;
    var navHistoryInitialized = false;

    function isStandaloneDisplayMode() {
        try {
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) { return true; }
        } catch (e) { /* matchMedia unsupported — treat as normal browser tab */ }
        return !!(window.navigator && window.navigator.standalone); // iOS Safari "Add to Home Screen"
    }

    // Called once, very early (before any overlay/reminder can possibly open), so the base
    // 'home' entry always exists at the bottom of the stack before anything else pushes on top
    // of it. Standalone (installed PWA) mode gets one extra permanent "boundary" entry beneath
    // it — see handleNavPopState()'s boundary branch for why. A normal browser tab gets none,
    // so its own prior-page Back history is never trapped or hidden.
    function initNavHistory() {
        try {
            if (isStandaloneDisplayMode()) {
                history.replaceState({ v: NAV_STATE_VERSION, boundary: true }, '');
                history.pushState({ v: NAV_STATE_VERSION, screen: 'home' }, '');
            } else {
                history.replaceState({ v: NAV_STATE_VERSION, screen: 'home' }, '');
            }
        } catch (e) { /* History API unavailable — screens still work, only Back integration is lost */ }
        navHistoryInitialized = true;
    }

    // Opens one transient overlay: records how to close it (onClose) and pushes exactly one
    // history entry tagged with `type`. `onClose` must be the SAME function every visible
    // close/cancel/postpone control for this overlay already calls — Back must never be able to
    // do anything an existing button couldn't already do.
    function pushTransientState(type, onClose) {
        transientStack.push({ type: type, onClose: onClose });
        try { history.pushState({ v: NAV_STATE_VERSION, transient: type }, ''); } catch (e) { }
    }

    // Called at the END of the one real "make this overlay invisible" function for `type`, on
    // EVERY path that reaches it (its own button, Escape, a successful confirm, or Back itself).
    // If the matching transient entry is still on top of the in-memory stack, this close did NOT
    // originate from Back — pop the bookkeeping and consume the matching history entry so the
    // two stay balanced. If Back already popped it (onClose is being called BY the popstate
    // handler below), the stack is already empty here and this is a safe no-op — it never closes
    // twice, never double-navigates, and never calls onClose itself.
    function consumeTransient(type) {
        if (transientStack.length > 0 && transientStack[transientStack.length - 1].type === type) {
            transientStack.pop();
            try { history.back(); } catch (e) { }
        }
    }

    function handleNavPopState(e) {
        var state = e.state;
        // A popstate event's `state` is always the DESTINATION entry being navigated TO — it
        // never carries the transient marker of the entry being LEFT. So "a transient overlay
        // was just closed by Back" can only be detected from our OWN in-memory stack, never from
        // e.state itself. Whenever a transient is tracked as open, a popstate can only mean we
        // are leaving it (nothing else can be pushed above an open transient), so this check must
        // come first, unconditionally, before looking at e.state at all.
        if (transientStack.length > 0) {
            var top = transientStack.pop();
            try { top.onClose(); } catch (err) { }
            return;
        }
        if (state && state.boundary) {
            // Standalone-only Home boundary: re-establish the exact same one-entry boundary
            // instead of letting Back fall through to whatever hosted the installed PWA (a blank
            // page, the OS launcher, etc.) — bounded depth, never grows, never blocks a real
            // OS-level close/task-switch (those bypass JavaScript entirely).
            try { history.pushState({ v: NAV_STATE_VERSION, screen: 'home' }, ''); } catch (err) { }
            isRestoringNavFromHistory = true;
            try { showScreen('home'); } finally { isRestoringNavFromHistory = false; }
            return;
        }
        var screenName = (state && state.screen) ? state.screen : 'home';
        if (!document.getElementById('screen-' + screenName)) { screenName = 'home'; }
        isRestoringNavFromHistory = true;
        try { showScreen(screenName); } finally { isRestoringNavFromHistory = false; }
    }

    window.addEventListener('popstate', handleNavPopState);

    function showScreen(name) {
        // Collapse-on-leave: showScreen() is the single choke point for every screen change in
        // this app, including a category-tile click (filterTransactionsByCategory() always calls
        // showScreen('transactions'), even when already on that screen) — so resetting
        // previewEditingId here, unconditionally, is sufficient to guarantee no transaction/item
        // row is ever left expanded when the user leaves a category (to Home/Insights/Settings/a
        // different category) or returns to one. UI state only — no data, no localStorage, no
        // calculation touched. Already a safe no-op everywhere this was implicitly true before
        // (e.g. startPreviewAddForCategory() already clears previewEditingId itself) — this just
        // makes it hold unconditionally everywhere.
        // Version 1.4.1 correction: consumeTransient() below is a defensive no-op safety net for
        // the case where the user navigates screens directly (bottom-nav, a category tile) while
        // the 'txInline' transient is open, instead of via its own Cancel/Back path — never leaves
        // a stale, unbalanced history entry behind. It must run BEFORE previewEditingId is cleared
        // so cancelCurrentTxInlineState() (if it were ever reached — it isn't here, since this is a
        // direct-navigation discard, not a Back-triggered close) would still see accurate state;
        // in practice consumeTransient() only pops bookkeeping here, it never calls that dispatcher.
        //
        // Android-back correction: every OTHER open transient (settings sub-forms, goalInline,
        // categoryInline, the Goals reminder, rowMenu, etc.) must ALSO be closed here, via its own real
        // onClose() this time — not just popped — because a direct navigation away (bottom-nav,
        // a category tile) never goes through that transient's own Cancel/Back path either. Left
        // stale, its entry would still sit in transientStack under whatever screen entry this
        // showScreen() call is about to push; the NEXT real Back press would then hit
        // handleNavPopState()'s unconditional "transientStack not empty" check FIRST, silently
        // consuming that real Back press to close the (already invisible) stale overlay instead of
        // showing the screen the browser actually navigated back to — the screen and the real
        // history position fall out of sync, and each further Back press burns one more real
        // history entry without the visible screen ever catching up, eventually exhausting history
        // and exiting the app even though in-app screens the user never saw remain unvisited.
        // 'txInline' keeps its existing pop-only handling below and is deliberately excluded here:
        // it is the one type callable while sharing this exact screen (Transactions), so a stale
        // entry cannot hide behind a screen switch the way every other type's can.
        while (transientStack.length > 0 && transientStack[transientStack.length - 1].type !== 'txInline') {
            var staleTransient = transientStack.pop();
            try { staleTransient.onClose(); } catch (e) { /* a transient's onClose must already be safe to call from Back; same guarantee here */ }
        }
        consumeTransient('txInline');
        previewEditingId = null;

        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) { screens[i].classList.remove('active'); }
        document.getElementById('screen-' + name).classList.add('active');

        var navBtns = document.querySelectorAll('.nav-btn');
        for (var j = 0; j < navBtns.length; j++) { navBtns[j].classList.remove('active'); }
        var navBtn = document.getElementById('nav-' + name) || document.getElementById('nav-' + (SCREEN_NAV_ALIAS[name] || name));
        if (navBtn) { navBtn.classList.add('active'); }

        updateFabVisibility();

        // Version 1.4.1: keep the browser/Android history stack in sync with every screen change,
        // except when THIS call is itself restoring a state popstate already made current (that
        // state IS the current history entry — pushing again would create a duplicate entry for
        // the same screen, breaking the "no duplicate history entries" requirement).
        if (!isRestoringNavFromHistory) {
            var currentNavState = history.state;
            if (!currentNavState || currentNavState.screen !== name) {
                try { history.pushState({ v: NAV_STATE_VERSION, screen: name }, ''); } catch (e) { }
            }
        }
    }

    // Version 1.1, Stage 3: a category is now a full "page" (the Transactions screen filtered by
    // currentCategoryFilterKey) — the floating + button is scoped to that page only, per the
    // approved product decision. True only while actually looking at an open category page; false
    // on Home, Settings/category-management, Insights, and the plain (unfiltered) Transactions
    // screen.
    function isOnCategoryPage() {
        var txScreenEl = document.getElementById('screen-transactions');
        return !!(txScreenEl && txScreenEl.classList.contains('active') && currentCategoryFilterKey !== null && categoryConfig[currentCategoryFilterKey]);
    }

    // Milestone 4: the Goals screen is the FAB's second context (add-goal), alongside the
    // existing category-page context (add-transaction) — see handleFabClick() below.
    function isOnGoalsScreen() {
        var goalsScreenEl = document.getElementById('screen-goals');
        return !!(goalsScreenEl && goalsScreenEl.classList.contains('active'));
    }

    // Version 1.4.2: the Categories screen's own add-category FAB context (screen-categories,
    // separate from screen-transactions' category-FILTER page above, despite the similar name).
    function isOnCategoriesScreen() {
        var el = document.getElementById('screen-categories');
        return !!(el && el.classList.contains('active'));
    }

    function updateFabVisibility() {
        var fabEl = document.getElementById('fab-button');
        if (!fabEl) { return; }
        // Milestone 4 correction: the FAB's "add goal" action is unavailable while the local
        // Goals dataset is invalid (goalsState.valid false) — every Goals mutation is blocked
        // during that state, so there is nothing useful for it to do.
        var onGoals = isOnGoalsScreen() && goalsState.valid;
        var onCategories = isOnCategoriesScreen();
        var onCategoryFilter = isOnCategoryPage();
        // Home is deliberately NOT a FAB context (removed — see the Home quick-action-removal
        // correction; Home's own balance card now opens the opening-balance form directly).
        fabEl.style.display = (onCategoryFilter || onCategories || onGoals) ? 'flex' : 'none';
        // Version 1.4.2: the shared FAB previously had no accessible name at all in any of its
        // contexts (just a bare "+" glyph) — set explicitly per context rather than leaving a
        // stale/wrong label from whichever screen was active before.
        var label = onCategories ? 'הוסף קטגוריה' : (onGoals ? 'הוסף יעד' : (onCategoryFilter ? 'הוסף תנועה' : 'הוסף'));
        fabEl.setAttribute('aria-label', label);
    }

    // ===== Transactions filter toggle — visual only, does not filter the mock list =====
    function setTxFilter(name) {
        var btns = document.querySelectorAll('.filter-btn');
        for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('active'); }
        document.getElementById('filter-' + name).classList.add('active');

        // Stage E.2: the filter is now functional — re-renders transactions-list for the real
        // items matching the selected filter. Previously this function only toggled the button's
        // CSS class and never touched the list itself. renderTransactionsScreenFromRealData() is
        // defined later in this file (function declarations are hoisted, so the forward reference
        // here is safe — same pattern already used throughout this file).
        renderTransactionsScreenFromRealData(name);
    }

    // Version 1.1, Stage 2: the single FAB has three behaviors depending on context. While
    // actually looking at a category's filtered transaction list (Transactions screen +
    // currentCategoryFilterKey set — i.e. a "category view"), it opens the existing add-transaction
    // form directly for that category (startPreviewAddForCategory() below, defined further down —
    // safe due to function hoisting, same pattern used throughout this file). On Goals/Categories
    // it opens that screen's own create form. The Home Quick Actions sheet this FAB used to also
    // open there was removed — Home is no longer a FAB context at all (see updateFabVisibility()).
    function handleFabClick() {
        if (isOnCategoryPage()) {
            startPreviewAddForCategory(currentCategoryFilterKey);
        } else if (isOnGoalsScreen() && goalsState.valid) {
            startGoalCreate();
        } else if (isOnCategoriesScreen()) {
            // Version 1.4.2: replaces the removed textual "+ הוסף קטגוריה" toggle button — same
            // startPreviewAddCategory()/existing form+save logic, only the trigger changed.
            startPreviewAddCategory();
        }
    }

    renderMockUI();

    // =====================================================================================
    // ===== Stage C/D.3: "story engine" — pure functions, generic over WHATEVER items[]/  =====
    // ===== categoryConfig object is passed to them. As of Stage D.3 none of them read     =====
    // ===== mockItems/mockCategoryConfig/mockSnapshot internally anymore — callers decide  =====
    // ===== the data source. mockItems/mockCategoryConfig/mockSnapshot below are kept ONLY =====
    // ===== as fixtures for tests (Stage A/B/C already rely on them); they are otherwise   =====
    // ===== inert. NOT wired to any screen yet — no automatic call site exists in this     =====
    // ===== file for any of these functions. Does not touch MOCK_DATA above (Stage B's     =====
    // ===== display-only source) or localStorage.                                         =====
    // =====================================================================================

    // mockCategoryConfig mirrors the real categoryConfig shape (key -> {label, baseType}),
    // same 4 built-in keys as the real app, constant Mock values only. Kept as a test fixture.
    var mockCategoryConfig = {
        income: { label: "💰 הכנסות", baseType: "income" },
        fixed: { label: "🏡 הוצאות קבועות", baseType: "fixed" },
        variable: { label: "🛒 תשלומים שונים", baseType: "variable" },
        loan: { label: "🏦 הלוואות", baseType: "loan" }
    };

    // mockItems mirrors the real items[] shape (id, type, displayCategory, isArchived + per-type
    // fields) as closely as possible, with constant Mock values only. One item (id 7) is archived
    // on purpose, to verify the engine correctly excludes archived items like the real app does.
    // Kept as a test fixture only. Note: "monthsLeft" on loan items was a Mock-only convenience
    // field for Stage C's getLoansRemainingSummary(); as of Stage D.3 that function now computes
    // `left` for real via parseDatesAndGetLeft(), so this field is no longer read by any function
    // — left in place harmlessly rather than stripped, since nothing depends on its absence.
    var mockItems = [
        { id: 1, type: "income", displayCategory: "income", isArchived: false, title: "משכורת", amount: 10000 },
        { id: 2, type: "income", displayCategory: "income", isArchived: false, title: "הכנסה נוספת — פרילנס", amount: 1500 },
        { id: 3, type: "fixed", displayCategory: "fixed", isArchived: false, title: "שכירות", amount: 3000, where: "bank", period: "monthly", notes: "", cardLast4: "" },
        { id: 4, type: "fixed", displayCategory: "fixed", isArchived: false, title: "מנוי חדר כושר", amount: 200, where: "credit", period: "monthly", notes: "", cardLast4: "1234" },
        { id: 5, type: "fixed", displayCategory: "fixed", isArchived: false, title: "ביטוח דירה", amount: 640, where: "credit", period: "monthly", notes: "", cardLast4: "1234" },
        { id: 6, type: "fixed", displayCategory: "fixed", isArchived: false, title: "אינטרנט וטלוויזיה", amount: 150, where: "credit", period: "monthly", notes: "", cardLast4: "5678" },
        { id: 7, type: "fixed", displayCategory: "fixed", isArchived: true, title: "מנוי ישן שבוטל", amount: 99, where: "credit", period: "monthly", notes: "", cardLast4: "1234" },
        { id: 8, type: "loan", displayCategory: "loan", isArchived: false, title: "הלוואת רכב", originalAmount: 24000, amount: 890, where: "bank", interest: 4.5, day: 5, total: 24, start: "2025-08-05", monthsLeft: 16 },
        { id: 9, type: "loan", displayCategory: "loan", isArchived: false, title: "הלוואה אישית", originalAmount: 6000, amount: 500, where: "bank", interest: 6, day: 10, total: 12, start: "2026-02-10", monthsLeft: 8 },
        { id: 10, type: "variable", displayCategory: "variable", isArchived: false, title: "מקרר — תשלום 3 מתוך 10", originalAmount: 3500, amount: 350, total: 10, start: "2026-05-05" },
        { id: 11, type: "dated", displayCategory: "dated", isArchived: false, title: "ביטוח רכב שנתי", amount: 1200, start: "2026-08-15" }
    ];

    // Ready-made Mock snapshot values (income/expenses/balance). Used by Stage C's getMonthSnapshot()
    // as a placeholder wrapper. As of Stage D.3, getMonthSnapshot() computes for real from its
    // `items` parameter (see below) and no longer reads this constant — kept only as a test fixture.
    var mockSnapshot = { income: 11500, expenses: 6930, balance: 4570 };

    // ----- Safe pure functions: generic filtering/summation over whatever items[] is passed in --

    // Period-conversion note (applies to all three functions below): renderAll() in index.html
    // always converts yearly fixed items to a monthly figure (amount/12) before summing them into
    // catStats[cKey].monthly — the one real "fixed" aggregation that exists today. All three
    // fixed-total functions below apply the same conversion, so getFixedCreditCardTotals +
    // getFixedBankVsCreditSplit.bank/.credit always agree with getTotalFixedCommitments — no
    // second, inconsistent source of truth between these three closely-related aggregations.

    function getFixedCreditCardTotals(items) {
        var total = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'fixed' && !it.isArchived && it.where === 'credit') {
                total += getFixedItemMonthlyFigure(it, new Date());
            }
        }
        return total;
    }

    function getFixedBankVsCreditSplit(items) {
        var bank = 0, credit = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'fixed' && !it.isArchived) {
                var mAmount = getFixedItemMonthlyFigure(it, new Date());
                if (it.where === 'credit') { credit += mAmount; } else { bank += mAmount; }
            }
        }
        return { bank: bank, credit: credit };
    }

    // Mirrors renderAll()'s fixed-item handling in index.html exactly: catStats[cKey].monthly for
    // baseType 'fixed' always includes both bank AND credit (no `where` filter — matches the
    // approved "dashboard tile shows everything" decision), and always period-converts yearly
    // items. Reads only `items` — no DOM, no catStats (which only exists during a real render).
    function getTotalFixedCommitments(items) {
        var total = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'fixed' && !it.isArchived) {
                total += getFixedItemMonthlyFigure(it, new Date());
            }
        }
        return total;
    }

    // Version 1.1, Stage 1: per-category monthly totals for the Home screen's automatic category
    // tiles. Mirrors the legacy (pre-Cockpit) index.html's own catStats[cKey].monthly accumulation
    // verbatim — same per-type conditions as getMonthSnapshot()/getTotalFixedCommitments() above,
    // just grouped by category key instead of collapsed into two grand totals:
    //   - cKey is item.displayCategory, falling back to item.type when displayCategory is missing
    //     or no longer a real categoryConfig key (identical fallback to the legacy renderAll()).
    //   - fixed: yearly period converted to monthly; bank AND credit both included (the existing
    //     "dashboard tile shows everything" decision, same as getTotalFixedCommitments() above).
    //   - variable/loan: current installment amount, only while parseDatesAndGetLeft(...).left > 0.
    //   - dated: only when its exact year+month matches the current year+month.
    //   - income: full amount.
    // Archived items are excluded entirely. Returns a plain { categoryKey: monthlyAmount } object
    // covering every key currently in categoryConfig (0 for categories with no matching items).
    function getCategoryMonthlyTotals(items, categoryConfig) {
        var totals = {};
        for (var key in categoryConfig) { totals[key] = 0; }
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.isArchived) { continue; }
            var cKey = item.displayCategory || item.type;
            if (!categoryConfig[cKey]) { cKey = item.type; }
            if (!(cKey in totals)) { totals[cKey] = 0; }

            if (item.type === 'income') {
                totals[cKey] += item.amount;
            } else if (item.type === 'fixed') {
                totals[cKey] += getFixedItemMonthlyFigure(item, new Date());
            } else if (item.type === 'variable') {
                var dtVar = parseDatesAndGetLeft(item.start, item.total, resolveEffectiveDay(item));
                if (dtVar.left > 0) { totals[cKey] += item.amount; }
            } else if (item.type === 'loan') {
                var dtLoan = parseDatesAndGetLeft(item.start, item.total, item.day);
                if (dtLoan.left > 0) { totals[cKey] += item.amount; }
            } else if (item.type === 'dated') {
                // Real-device correction: the credit-card tile must show "active upcoming" charges,
                // not only the exact current calendar month — a charge already dated for next month
                // (e.g. entered ahead of time, or a charge that lands right after a month boundary)
                // must still total into the tile instead of showing the empty placeholder. Widened
                // from an exact current-month match to current-OR-next-month, mirroring the same
                // 2-month lookahead convention getNextCashflowEvent() already uses for the identical
                // "don't miss something just past a month boundary" problem. This changes only this
                // display total — generateCashflowEvents() (the actual balance-affecting engine)
                // still deducts the charge exactly once, on its own exact date, unchanged.
                if (item.start) {
                    var itemDate = new Date(item.start);
                    var now = new Date();
                    var monthDiff = (itemDate.getFullYear() - now.getFullYear()) * 12 + (itemDate.getMonth() - now.getMonth());
                    if (monthDiff === 0 || monthDiff === 1) {
                        totals[cKey] += item.amount;
                    }
                }
            }
        }
        return totals;
    }

    // Copied verbatim (income/expense inclusion logic only) from renderAll() in index.html — same
    // structure, same conditions, same edge cases, sourced ONLY from index.html (never app.js,
    // which lacks the variable-exclusion and fixed/credit-exclusion rules applied here):
    //   - isArchived items are excluded entirely.
    //   - variable is never added to expenses (tracking-only; comment preserved from the source).
    //   - fixed: yearly period is converted to a monthly figure; where==='credit' is excluded from
    //     expenses; any other value (including legacy/undefined) is treated as bank and included.
    //   - loan: uses parseDatesAndGetLeft() (copied verbatim in Stage D.1); included only when
    //     dt.left > 0 — this intentionally preserves the same known inconsistency documented in
    //     the Stage-D scoping report (a not-yet-started future loan can already count today,
    //     because parseDatesAndGetLeft returns the full total while "before first billing").
    //   - dated: included only when its exact year+month matches the current year+month.
    // catStats/per-category bookkeeping is intentionally omitted — this function only needs the
    // two totals, not a per-category breakdown.
    function getMonthSnapshot(items) {
        var sumInc = 0, monthlyExpenses = 0;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item.isArchived) {
                if (item.type === 'income') {
                    sumInc += item.amount;
                } else if (item.type === 'fixed') {
                    var mAmount = getFixedItemMonthlyFigure(item, new Date());
                    if (item.where !== 'credit') {
                        monthlyExpenses += mAmount;
                    }
                } else if (item.type === 'variable') {
                    // תשלומים שונים למעקב/תצוגה בלבד - לא נכללים ביתרה הפנויה (ההשפעה בפועל מגיעה מחיוב כרטיס האשראי שנרשם בנפרד)
                } else if (item.type === 'loan') {
                    var dt = parseDatesAndGetLeft(item.start, item.total, item.day);
                    if (dt.left > 0) {
                        monthlyExpenses += item.amount;
                    }
                } else if (item.type === 'dated') {
                    // Payment-method correction: a credit-paid dated charge is deferred to the
                    // card's own bank-paid monthly settlement — same "credit is never counted here
                    // directly" rule already applied to 'fixed' above. Settlement-identification
                    // correction: the built-in settlement category itself is exempt — see
                    // isBuiltinCreditCardSettlement().
                    if (item.start && (isBuiltinCreditCardSettlement(item) || resolveEffectiveWhere(item) !== 'credit')) {
                        var itemDate = new Date(item.start);
                        var now = new Date();
                        if (itemDate.getFullYear() === now.getFullYear() && itemDate.getMonth() === now.getMonth()) {
                            monthlyExpenses += item.amount;
                        }
                    }
                }
            }
        }
        return { income: sumInc, expenses: monthlyExpenses, balance: sumInc - monthlyExpenses };
    }

    function getRecentActivity(items, count) {
        var n = count || 5;
        var active = [];
        for (var i = 0; i < items.length; i++) {
            if (!items[i].isArchived) { active.push(items[i]); }
        }
        return active.slice(-n).reverse();
    }

    // Uses parseDatesAndGetLeft() (copied verbatim from index.html in Stage D.1) to get `left` —
    // no independent date arithmetic here. totalRemaining mirrors renderAll()'s
    // catStats[cKey].totalLeft accumulation (amount * dt.left, unconditional — a loan whose
    // dt.left is 0 simply contributes 0). loanCount is a new metric with no real-app equivalent
    // to copy; it counts loans that still have payments left (dt.left > 0), i.e. not yet fully paid.
    function getLoansRemainingSummary(items) {
        var totalRemaining = 0;
        var loanCount = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'loan' && !it.isArchived) {
                var dt = parseDatesAndGetLeft(it.start, it.total, it.day);
                totalRemaining += it.amount * dt.left;
                if (dt.left > 0) { loanCount++; }
            }
        }
        return { totalRemaining: totalRemaining, loanCount: loanCount };
    }

    // Version 1.1, Stage 3.5: "יתרת תשלומים שונים" stat tile — sum of every active (non-archived)
    // variable item's remaining installments (amount × payments left). Mirrors
    // getLoansRemainingSummary()'s own totalRemaining accumulation immediately above, just for
    // type 'variable' instead of 'loan', and reuses the same billing-day convention (1) already
    // established for variable items in getCategoryMonthlyTotals() — no new date arithmetic.
    // Extracted from getVariableRemainingBalance()'s own inline per-item math (unchanged formula:
    // amount × payments left, same resolveEffectiveDay() billing-day convention) so a single
    // variable item's remaining balance can be reused elsewhere (installment-card collapsed-row
    // summary, shared with Loans) without duplicating the calculation.
    function getVariableItemRemainingBalance(it) {
        var dt = parseDatesAndGetLeft(it.start, it.total, resolveEffectiveDay(it));
        return { total: it.amount * dt.left, left: dt.left };
    }

    function getVariableRemainingBalance(items) {
        var total = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'variable' && !it.isArchived) {
                total += getVariableItemRemainingBalance(it).total;
            }
        }
        return total;
    }

    // Version 1.1, Stage 3.5: "יתרת הלוואות" stat tile — two aggregate figures across every active
    // loan: `total` (קרן + ריבית — everything still scheduled to be paid) is the exact same
    // amount×left accumulation getLoansRemainingSummary().totalRemaining already computes, reused
    // as-is here rather than duplicated. `principal` (קרן בלבד) is new: the outstanding loan
    // balance after `elapsed` real payments of the loan's own recorded `amount` — the standard
    // fixed-payment amortization recursion
    //   B_k = P·(1+r)^k − amount·[(1+r)^k − 1] / r
    // where P = item.originalAmount, r = the monthly rate derived from item.interest (annual %, so
    // r = interest/100/12), and k = elapsed payments already made (item.total − dt.left). A loan
    // with no/zero/invalid interest (r = 0) falls back to straight-line reduction — P − amount·k.
    //
    // Bug fixed after review (caught before this stage's commit): the first version of this
    // formula derived principal from originalAmount/interest/total ALONE — P·[(1+r)^n−(1+r)^k] /
    // [(1+r)^n−1] — which never actually reads item.amount, so it silently assumed the recorded
    // payment already happened to be the theoretically exact one needed to amortize P at r over
    // exactly n installments. This app never enforces that (amount/originalAmount/interest/total
    // are 4 independently hand-entered fields — updateCategoryName-style forms, no cross-
    // validation anywhere), so for a real loan whose recorded payment is smaller than that
    // theoretical figure, the old formula could report a "קרן" larger than "סה"כ" (amount×left) —
    // i.e. a principal that exceeds everything left to pay, principal+interest included, which is
    // never possible for a real loan. The fixed formula above uses the loan's own `amount` (the
    // same value `total` is built from) instead of assuming a theoretical one, so both figures
    // describe the same actual payment stream. `remainingPrincipal` is additionally capped at that
    // loan's own `amount × dt.left` as a hard safety net — principal can never be MORE than
    // everything left to pay, by definition — for the (still-possible, given 4 unvalidated fields)
    // case where the recorded amount/interest/total genuinely don't amortize the loan by schedule.
    // Extracted from getLoansBalanceSummary()'s own inline per-loan math (unchanged formulas) so a
    // single loan's remaining balance can be reused elsewhere (Loans-card collapsed-row summary)
    // without duplicating the amortization calculation. getLoansBalanceSummary() below now simply
    // accumulates this per-loan result across all active loans — same output as before.
    function getLoanRemainingBalance(it) {
        var dt = parseDatesAndGetLeft(it.start, it.total, it.day);
        var loanTotalRemaining = it.amount * dt.left;

        var n = parseInt(it.total, 10);
        if (!n || n <= 0 || dt.left <= 0) {
            return { principal: 0, total: loanTotalRemaining, left: dt.left };
        }
        var originalAmount = (typeof it.originalAmount === 'number' && !isNaN(it.originalAmount)) ? it.originalAmount : 0;
        var elapsed = n - dt.left;
        if (elapsed < 0) { elapsed = 0; }

        var annualRatePct = parseFloat(it.interest);
        var monthlyRate = (isFinite(annualRatePct) && annualRatePct > 0) ? (annualRatePct / 100 / 12) : 0;
        var remainingPrincipal;
        if (monthlyRate > 0) {
            var growth = Math.pow(1 + monthlyRate, elapsed);
            remainingPrincipal = originalAmount * growth - it.amount * (growth - 1) / monthlyRate;
        } else {
            remainingPrincipal = originalAmount - it.amount * elapsed;
        }
        if (remainingPrincipal < 0) { remainingPrincipal = 0; }
        if (remainingPrincipal > loanTotalRemaining) { remainingPrincipal = loanTotalRemaining; }
        return { principal: remainingPrincipal, total: loanTotalRemaining, left: dt.left };
    }

    function getLoansBalanceSummary(items) {
        var principal = 0;
        var total = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type !== 'loan' || it.isArchived) { continue; }
            var b = getLoanRemainingBalance(it);
            principal += b.principal;
            total += b.total;
        }
        return { principal: principal, total: total };
    }

    // =====================================================================================
    // ===== Version 1.1, Stage 4.0.2.2: automatic end-of-commitment archiving — loan/variable =====
    // ===== items whose payments are fully done AND whose last billing date is strictly in    =====
    // ===== the past (not today itself) are archived automatically, once, at load time.       =====
    // =====================================================================================

    // Read-only: returns the subset of `itemsList` eligible for automatic archiving right now.
    // Reuses getBillingRange()/parseDatesAndGetLeft()/resolveEffectiveDay() exactly as already
    // established elsewhere in this file — no new date arithmetic, no new "how many payments are
    // left" logic. Eligibility (per the approved decision):
    //   - type is 'loan' or 'variable' only — income/fixed/dated are never touched.
    //   - not already archived, and no archiveReason yet (belt-and-suspenders: in practice
    //     archiveReason is only ever set together with isArchived, but both are checked so a
    //     hand-edited/imported item with one but not the other is still treated as "already
    //     handled" rather than re-processed).
    //   - has both `start` and `total` (missing either -> getBillingRange() itself would return
    //     null for a falsy total, and a missing/empty start is rejected explicitly here) and
    //     `total` parses to a positive integer — anything else is "not unambiguous" and skipped.
    //   - parseDatesAndGetLeft(...).left === 0 — every payment already billed, via the exact same
    //     calculation getLoansBalanceSummary()/getVariableRemainingBalance() already rely on.
    //   - AND today (date-only) is strictly AFTER the billing range's own last date — this is the
    //     "one full day must have passed" rule: an item whose final payment bills today is
    //     deliberately left alone (it may still need to visibly appear today), matching
    //     getBillingRange()'s own `last` Date (already routed through the Stage 4.0.2 clamp
    //     helper, so a 29/30/31 last-billing-day is handled the same way it already is everywhere
    //     else). An unparseable start (Invalid Date) never satisfies this comparison, so it's
    //     naturally excluded without a separate explicit check.
    function getAutoArchiveCandidates(itemsList) {
        var today = new Date();
        var todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        var candidates = [];
        for (var i = 0; i < itemsList.length; i++) {
            var it = itemsList[i];
            if (!it || it.isArchived || it.archiveReason) { continue; }
            if (it.type !== 'loan' && it.type !== 'variable') { continue; }
            if (!it.start || !it.total) { continue; }
            var totalNum = parseInt(it.total, 10);
            if (!isFinite(totalNum) || totalNum <= 0) { continue; }

            var effectiveDay = resolveEffectiveDay(it);
            var range = getBillingRange(it.start, it.total, effectiveDay);
            if (!range || isNaN(range.last.getTime())) { continue; }

            var dt = parseDatesAndGetLeft(it.start, it.total, effectiveDay);
            if (dt.left !== 0) { continue; }
            if (!(todayZero.getTime() > range.last.getTime())) { continue; }

            candidates.push(it);
        }
        return candidates;
    }

    // Mutates every candidate item in place (isArchived/archiveReason/archivedAt only — title,
    // amount, and every other field are untouched, so no history/amount is altered) and persists
    // once via the existing savePreviewItems() (DATA_KEY only, same as every other write path in
    // this file) — no new localStorage key, no schema change. `archivedAt` is today's date via the
    // existing todayStr() (already used to pre-fill the 'dated' add form), so it's always
    // "YYYY-MM-DD", no new date-formatting logic. Returns the number of items archived so the
    // caller can decide whether/what to tell the user. A count of 0 does nothing at all — no
    // write, no render trigger — so a run with nothing to archive has zero side effects.
    function runAutoArchiveSweep(itemsList) {
        var candidates = getAutoArchiveCandidates(itemsList);
        if (candidates.length === 0) { return 0; }
        var archivedAtStr = todayStr();
        // Version 1.1, Stage 4.0.3: lastAutoArchivedTitles feeds the "התחייבות שהסתיימה"
        // notification on Home (computeHomeNotifications()) — captured here, once, from exactly
        // the items this run actually archived (not every archived item ever).
        lastAutoArchivedTitles = candidates.map(function (c) { return c.title || ''; });
        for (var i = 0; i < candidates.length; i++) {
            candidates[i].isArchived = true;
            candidates[i].archiveReason = 'completed';
            candidates[i].archivedAt = archivedAtStr;
            appendActivityLog('auto_archive', candidates[i].title || '');
        }
        savePreviewItems();
        return candidates.length;
    }

    // Shows the "✓ X התחייבויות הסתיימו והועברו לארכיון" notice once, then self-dismisses — no
    // native alert()/confirm() (those block interaction; the approved requirement explicitly rules
    // that out), just a fixed-position element (#auto-archive-toast, hidden by default in the
    // static HTML) whose text/visibility this toggles. Only ever called once per page load (from
    // the single runAutoArchiveSweep() call site below), so "shown once" falls out of that call
    // discipline rather than needing its own dedup state here.
    function showAutoArchiveToast(count) {
        var el = document.getElementById('auto-archive-toast');
        if (!el) { return; }
        el.textContent = '✓ ' + count + ' התחייבויות הסתיימו והועברו לארכיון';
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 4000);
    }

    // Milestone 6 correction: getBiggestUpcomingCharge()/getProjectedBalanceAfterUpcoming()/
    // getForecastWarning() (all computeForecast()-derived) were removed here — confirmed
    // unreachable: their only caller was buildNarrative(), whose sentences.biggestUpcomingCharge/
    // .projectedBalanceAfterUpcoming/.forecastWarning fields were themselves never read by the
    // single live consumer of buildNarrative()'s output (renderInsightsScreenFromRealData(), which
    // reads only narrativeResult.creditCardTotal/.loansRemaining — see buildNarrative() below).
    // computeForecast() itself is removed for the same reason (see its own former location, just
    // above the unified cash-flow engine section) — computeForecast()'s output never reached any
    // screen. isBillingActiveInMonth()/getBillingRange() (which these functions also used) are
    // NOT removed: generateCashflowEvents() (the unified engine's event source) reuses them
    // directly and remains fully live. Version 1.4.1 correction: buildCashflowSummary()/
    // renderForecast() (the 6-month "תחזית חודשית מורחבת" section) were themselves later removed
    // too — see CURRENT_STATUS.md, "Version 1.4.1" correction round.

    // Compares dated-item totals between the CURRENT calendar month and the PREVIOUS calendar
    // month (the one immediately before it — not part of computeForecast()'s forward-looking
    // range, so this reads `items` directly), using the exact same "exact year+month match" test
    // already used identically for dated items in both computeForecast() and getMonthSnapshot().
    // Returns both an absolute amount and a percentage; percentage is explicitly null (never
    // NaN/Infinity) when the previous month's total is 0, since a percentage change from zero is
    // not meaningful. Returns null (not an object) only when there are no dated items anywhere in
    // items — that's the sole "no dated data" case; if dated items exist elsewhere but not in
    // either of these two months, both totals are simply 0 and changePercent is null.
    function getDatedMonthOverMonthChange(items) {
        var hasDatedItems = items.some(function (it) { return it.type === 'dated' && !it.isArchived; });
        if (!hasDatedItems) { return null; }

        var now = new Date();
        var currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
        var previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        var currentMonthTotal = 0, previousMonthTotal = 0;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.type !== 'dated' || item.isArchived || !item.start) { continue; }
            var itemDate = new Date(item.start);
            if (itemDate.getFullYear() === currentMonthDate.getFullYear() && itemDate.getMonth() === currentMonthDate.getMonth()) {
                currentMonthTotal += item.amount;
            } else if (itemDate.getFullYear() === previousMonthDate.getFullYear() && itemDate.getMonth() === previousMonthDate.getMonth()) {
                previousMonthTotal += item.amount;
            }
        }

        var changeAmount = currentMonthTotal - previousMonthTotal;
        var changePercent = (previousMonthTotal !== 0) ? ((changeAmount / previousMonthTotal) * 100) : null;

        return {
            currentMonthLabel: currentMonthDate.toLocaleDateString('he-IL', { month: 'short' }),
            previousMonthLabel: previousMonthDate.toLocaleDateString('he-IL', { month: 'short' }),
            currentMonthTotal: currentMonthTotal,
            previousMonthTotal: previousMonthTotal,
            changeAmount: changeAmount,
            changePercent: changePercent
        };
    }

    // ----- buildNarrative: assembles human sentences ("story of the money") from the safe -----
    // ----- functions' output only. Stub-backed fields are left null/omitted, never invented. -----

    function buildNarrative(items, categoryConfig) {
        var creditTotal = getFixedCreditCardTotals(items);
        var split = getFixedBankVsCreditSplit(items);
        var totalCommitments = getTotalFixedCommitments(items);
        var snapshot = getMonthSnapshot(items);
        var recent = getRecentActivity(items, 5);
        var loans = getLoansRemainingSummary(items);

        var sentences = {};

        // Stage F.1 fix: formatHomeCurrency() instead of a raw number, so this matches the
        // insight-value formatting on the Insights screen (previously e.g. "₪220" was fine only
        // because it's under 1000 — a 4-digit value would have shown without a thousands separator).
        sentences.creditCardTotal = creditTotal > 0
            ? 'סך חיובי כרטיס האשראי מהוצאות קבועות עומד על ' + formatHomeCurrency(creditTotal) + '.'
            : 'אין כרגע הוצאות קבועות המחויבות בכרטיס אשראי.';

        sentences.bankVsCredit = 'מתוך ההוצאות הקבועות: ₪' + split.bank + ' מחויבות בחשבון הבנק, ו-₪' + split.credit + ' בכרטיס אשראי.';

        sentences.totalCommitments = 'סך ההתחייבויות הקבועות שלך עומד על ₪' + totalCommitments + ' לחודש.';

        sentences.monthSnapshot = snapshot.balance >= 0
            ? 'החודש: הכנסות ₪' + snapshot.income + ', הוצאות ₪' + snapshot.expenses + ', ונשארת עם יתרה חיובית של ₪' + snapshot.balance + '.'
            : 'החודש: הכנסות ₪' + snapshot.income + ', הוצאות ₪' + snapshot.expenses + ' — היתרה שלילית בסך ₪' + Math.abs(snapshot.balance) + '.';

        // Stage F.1 fix: formatHomeCurrency() instead of a raw number — same reasoning as
        // creditCardTotal above (e.g. previously showed "26100" instead of "26,100").
        sentences.loansRemaining = loans.loanCount > 0
            ? 'נותרו לך ' + formatHomeCurrency(loans.totalRemaining) + ' בסך הכול ב-' + loans.loanCount + ' הלוואות פעילות.'
            : 'אין לך כרגע הלוואות פעילות.';

        sentences.recentActivity = recent.length > 0
            ? 'הפעילות האחרונה כוללת ' + recent.length + ' תנועות.'
            : 'אין עדיין פעילות להצגה.';

        // Milestone 6 correction: the computeForecast()-derived biggestUpcomingCharge/
        // projectedBalanceAfterUpcoming/forecastWarning fields that used to be set here were
        // removed — confirmed unreachable (see the removal note above computeForecast()'s former
        // location for the full call-graph evidence): renderInsightsScreenFromRealData(), the only
        // live reader of this function's return value, never read any of the three.
        var datedChange = getDatedMonthOverMonthChange(items);
        sentences.datedMonthOverMonthChange = datedChange
            ? 'החיובים החד-פעמיים ' + (datedChange.changeAmount >= 0 ? 'עלו' : 'ירדו') + ' ב-₪' + Math.abs(datedChange.changeAmount) + ' לעומת ' + datedChange.previousMonthLabel + '.'
            : null;

        return sentences;
    }

    // =====================================================================================
    // ===== Stage D.1/D.6 Part A: infrastructure only — verbatim copies of the real app's    =====
    // ===== date-billing and forecast logic from index.html (getBillingRange,                =====
    // ===== parseDatesAndGetLeft added in D.1; isBillingActiveInMonth + computeForecast       =====
    // ===== added in D.6), unmodified. Not wired to mockItems or localStorage.                =====
    // =====================================================================================

    // Version 1.1, Stage 4.0.2: single central helper for "day-of-month → actual Date" conversion.
    // A day of 29/30/31 that doesn't exist in the target month (e.g. 31 in February) lands on that
    // month's last real day instead — the stored day value itself is never altered, only the Date
    // object built from it here. `monthIndex` is passed through `new Date(year, monthIndex, 1)`
    // first so any out-of-range month (e.g. 12, or a negative index) normalizes to the correct
    // year/month exactly the way plain `new Date(year, monthIndex, day)` already would, before the
    // day itself is clamped against that normalized month's real length.
    function getClampedBillingDate(year, monthIndex, day) {
        var normalized = new Date(year, monthIndex, 1);
        var y = normalized.getFullYear();
        var m = normalized.getMonth();
        var lastDayOfMonth = new Date(y, m + 1, 0).getDate();
        var clampedDay = Math.min(day, lastDayOfMonth);
        return new Date(y, m, clampedDay);
    }

    // --- ⚖️ לוגיקת חישוב מועדים ותשלומים שנותרו מעודכנת ומסונכרנת לחלוטין ---
    function getBillingRange(startDateStr, totalPayments, billingDay) {
        if (!startDateStr || !totalPayments) return null;

        var parts = startDateStr.split('-');
        var startYear = parseInt(parts[0], 10);
        var startMonth = parseInt(parts[1], 10) - 1;
        var startDay = parts[2] ? parseInt(parts[2], 10) : 1;

        var total = parseInt(totalPayments, 10);
        var bDay = billingDay ? parseInt(billingDay, 10) : 1;

        // קביעת חודש החיוב הראשון בפועל
        var firstBillingMonth = startMonth;
        if (startDay >= bDay) {
            firstBillingMonth += 1;
        }
        var firstBillingDate = getClampedBillingDate(startYear, firstBillingMonth, bDay);

        // קביעת תאריך חיוב אחרון (הוספת סך תשלומים פחות 1)
        var lastBillingDate = getClampedBillingDate(firstBillingDate.getFullYear(), firstBillingDate.getMonth() + (total - 1), bDay);

        return { first: firstBillingDate, last: lastBillingDate, bDay: bDay, total: total };
    }

    function parseDatesAndGetLeft(startDateStr, totalPayments, billingDay) {
        var range = getBillingRange(startDateStr, totalPayments, billingDay);
        if (!range) return { left: 0, endStr: '-' };

        var endStr = range.last.toLocaleDateString('he-IL');

        // חישוב מדויק של תשלומים שנותרו ביחס להיום
        var today = new Date();
        var todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // אם היום הנוכחי מוקדם ממועד החיוב הראשון בפועל - נשארו כל התשלומים
        if (todayZero < range.first) {
            return { left: range.total, endStr: endStr };
        }

        // חישוב מספר חודשי החיוב המלאים שעברו
        var passedMonths = (todayZero.getFullYear() - range.first.getFullYear()) * 12 + (todayZero.getMonth() - range.first.getMonth());

        // אם עברנו או הגענו ליום החיוב בחודש הנוכחי, החודש הנוכחי נחשב ככזה שירד
        if (todayZero.getDate() >= range.bDay) {
            passedMonths += 1;
        }

        var left = range.total - passedMonths;
        if (left < 0) left = 0;
        if (left > range.total) left = range.total;

        return { left: left, endStr: endStr };
    }

    // Version 1.1, Stage 4.0.2: single central helper resolving the "effective" day-of-month for
    // one item — item.day itself when it's already a valid 1–31 value, otherwise
    // categoryConfig[<item's category>].defaultDayOfMonth when that's valid, otherwise 1. Never
    // mutates `item` or `categoryConfig` — read-only, used both to fill a new item's day field with
    // its category's default and to feed billing-day calculations (getCategoryMonthlyTotals's/
    // getVariableRemainingBalance's variable branch) without a hardcoded day. Existing items saved
    // before this stage (no `day` field at all) are unaffected on disk — this only computes what to
    // use *this time*, exactly the "lazy fallback, no migration" decision requires. Category lookup
    // mirrors the existing displayCategory-then-type fallback already used elsewhere in this file
    // (e.g. getCategoryMonthlyTotals's own `cKey` resolution) so a stale/mismatched displayCategory
    // degrades the same way it already does everywhere else, not differently here.
    function resolveEffectiveDay(item) {
        var ownDay = parseInt(item && item.day, 10);
        if (isFinite(ownDay) && ownDay >= 1 && ownDay <= 31) { return ownDay; }

        var cKey = (item && item.displayCategory) || (item && item.type);
        var cfg = categoryConfig[cKey];
        if (!cfg && item) { cfg = categoryConfig[item.type]; }
        var defaultDay = cfg ? parseInt(cfg.defaultDayOfMonth, 10) : NaN;
        if (isFinite(defaultDay) && defaultDay >= 1 && defaultDay <= 31) { return defaultDay; }

        return 1;
    }

    // Payment-method correction: single central helper resolving the "effective" payment method
    // for one item — 'credit' only when item.where is EXACTLY that string, 'bank' for every other
    // value (missing/undefined/'bank'/anything else) — same "lazy fallback, no migration"
    // convention as resolveEffectiveDay() above, so an existing item saved before this field
    // existed is unaffected on disk and simply defaults to Bank account when read. Used by both
    // the bank-balance-affecting calculations (generateCashflowEvents()/getMonthSnapshot()) and
    // the edit-form pre-fill, so all three can never disagree about what "credit" means for a
    // given item.
    function resolveEffectiveWhere(item) {
        return (item && item.where === 'credit') ? 'credit' : 'bank';
    }

    // Version 1.4.5: payment-method resolver for 'variable' ("תשלומים שונים") installment items —
    // deliberately NOT the same "default to bank" convention as resolveEffectiveWhere() above.
    // Returns 'bank'/'credit' ONLY when the item carries an explicit value (every add/edit form
    // now requires an explicit choice, so every new/edited item always has one); returns null for a
    // legacy item saved before this field existed, whose real cash effect may already be captured
    // by a separate fixed/credit item elsewhere (the original tracking-only reasoning) — silently
    // defaulting a legacy item to 'bank' would start deducting it from the balance with no user
    // confirmation, which is exactly what "existing items without payment metadata must remain
    // tracking-only" forbids. Used by generateCashflowEvents() below to decide whether a variable
    // item generates a real balance-affecting event at all.
    function resolveVariablePaymentMethod(item) {
        if (item && item.where === 'bank') { return 'bank'; }
        if (item && item.where === 'credit') { return 'credit'; }
        return null;
    }

    // Bimonthly fixed expenses: a fixed item recurs every 2 months instead of every month, e.g. a
    // September start recurs Sep/Nov/Jan/Mar/... indefinitely, forever, with no end date (same
    // "ongoing commitment" semantics as monthly/yearly 'fixed' — unlike loans/variable, which have
    // a total-payment countdown). item.bimonthly is the boolean toggle; item.bimonthlyStartMonth
    // (1–12) is which calendar month the every-2-months cycle is anchored to. Only a MONTH is
    // stored (no year) because the pattern is year-agnostic by construction: a target month is
    // "active" exactly when it shares the same parity (odd/even) as the start month — true for
    // every year, so no year bookkeeping is ever needed. isBimonthly() requires BOTH fields to be
    // valid before treating an item as bimonthly at all — malformed/missing recurrence data (a
    // stray `bimonthly:true` with no/garbage start month, or an item saved before this feature
    // existed) safely falls back to the existing monthly/yearly `period`-based behavior, never
    // throws, never invents a start month.
    function resolveFixedIsBimonthly(item) {
        if (!item || item.bimonthly !== true) { return false; }
        var m = parseInt(item.bimonthlyStartMonth, 10);
        return isFinite(m) && m >= 1 && m <= 12;
    }
    function resolveFixedBimonthlyStartMonth(item) {
        var m = parseInt(item && item.bimonthlyStartMonth, 10);
        return (isFinite(m) && m >= 1 && m <= 12) ? m : 1;
    }
    function isBimonthlyActiveMonth(targetMonth1to12, startMonth1to12) {
        return (targetMonth1to12 % 2) === (startMonth1to12 % 2);
    }

    // Single shared "monthly figure" for one fixed item, reused by every monthly-aggregate display
    // (Home snapshot, category tiles, the Insights credit-card/commitments cards) so they can never
    // disagree with each other about what a given fixed item contributes to a given month — exactly
    // the "apply consistently" requirement. Monthly and yearly behavior is UNCHANGED (yearly still
    // smooths to amount/12 every month, matching the existing budgeting convention). Bimonthly is
    // deliberately NOT smoothed — the full amount in an active (matching-parity) month, zero in
    // every other month — matching its own discrete every-2-months occurrence and the cash-flow
    // engine's own event dates below, rather than inventing a new averaging rule nothing asked for.
    function getFixedItemMonthlyFigure(item, refDate) {
        if (resolveFixedIsBimonthly(item)) {
            var refMonth1to12 = ((refDate || new Date()).getMonth()) + 1;
            return isBimonthlyActiveMonth(refMonth1to12, resolveFixedBimonthlyStartMonth(item)) ? item.amount : 0;
        }
        return (item.period === 'שנתי') ? (item.amount / 12) : item.amount;
    }

    // Settlement-identification correction: the built-in credit-card SETTLEMENT category (key
    // 'dated' — the default "💳 חיוב כרטיס אשראי", present in every categoryConfig via the
    // existing backfill) IS the actual monthly bank outflow — selecting "Credit card" as this
    // item's own payment method must never exclude it, or the settlement itself would vanish from
    // the balance it exists to represent. Only a DIFFERENT dated-baseType category (a custom one,
    // e.g. a purchase-level charge awaiting settlement) can still be deferred/excluded via
    // resolveEffectiveWhere(). Identified by the STABLE KEY (displayCategory, falling back to
    // item.type exactly like the cKey resolution already used in getCategoryMonthlyTotals()/
    // getMonthSnapshot() elsewhere in this file) — never by the category's displayed label, which
    // a user can freely rename without changing its key. A pre-existing settlement item that
    // happens to already have where:'credit' stored (e.g. from before this correction existed) is
    // unaffected by that stored value here — this checks the key, not `where`, so it self-heals
    // with no migration needed.
    function isBuiltinCreditCardSettlement(item) {
        return !!(item && item.type === 'dated' && (item.displayCategory || item.type) === 'dated');
    }

    // Version 1.4.6: formats the built-in credit-card settlement tile's "עודכן: DD.MM.YYYY" line
    // from appSettings.creditCardSettlementUpdatedAt (a plain 'YYYY-MM-DD' string, same convention
    // as todayStr()). A plain string split — not a Date object/toLocaleDateString() — so there is
    // no timezone/UTC-shift risk for a value that is itself always a local calendar date already.
    // null/malformed input (never yet set, or a corrupt settings blob) safely falls back to the
    // required "עודכן: —" placeholder — never the charge date, never today's date.
    function formatCreditSettlementUpdatedLabel(dateStr) {
        var parts = (dateStr || '').split('-');
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) { return 'עודכן: —'; }
        return 'עודכן: ' + parts[2] + '.' + parts[1] + '.' + parts[0];
    }

    // Copied verbatim from index.html. Milestone 6: its original sole caller, computeForecast(),
    // was removed as dead code — this function remains live because generateCashflowEvents()
    // (the unified cash-flow engine's event source) reuses it directly.
    function isBillingActiveInMonth(range, year, monthIndex) {
        var firstYm = range.first.getFullYear() * 12 + range.first.getMonth();
        var lastYm = range.last.getFullYear() * 12 + range.last.getMonth();
        var targetYm = year * 12 + monthIndex;
        return targetYm >= firstYm && targetYm <= lastYm;
    }

    // Milestone 6 correction: computeForecast() removed here — confirmed unreachable (see the
    // removal note above getDatedMonthOverMonthChange() for the full call-graph evidence); its
    // output never reached any live screen. Version 1.4.1 correction: the six-month "תחזית
    // חודשית מורחבת" UI that later replaced it (buildCashflowSummary()/renderForecast()) was
    // itself removed too — see CURRENT_STATUS.md.

    // =====================================================================================
    // ===== Version 1.3, Phase 2B/2E: unified cash-flow engine. Single source of truth for  =====
    // ===== cash-flow events, cumulative balances and every derived Insights metric below.  =====
    // ===== Reuses resolveEffectiveDay/getClampedBillingDate/getBillingRange/               =====
    // ===== parseDatesAndGetLeft/isBillingActiveInMonth verbatim from above — no new date    =====
    // ===== arithmetic is invented here. Does NOT replace getMonthSnapshot/                  =====
    // ===== getCategoryMonthlyTotals (those keep serving the screens that already consume    =====
    // ===== them, unmodified, per the approved "no rewrite" scope) — this is new, additive    =====
    // ===== code that the Phase 2C+ Insights UI consumes instead. Milestone 6: computeForecast=====
    // ===== itself was later confirmed unreachable and removed — see its former location.     =====
    // =====================================================================================

    // EVENT CONTRACT: { date: Date, amount: signed number, itemId, type, title }.
    // Positive amount = money in (income). Negative amount = money out (fixed/loan/dated/variable).
    // 'variable' ("תשלומים שונים") items — Version 1.4.5 correction: the original Phase 2A
    // decision (never generate an event) assumed the schema had no field that could safely tell
    // "already captured elsewhere" apart from "a real, independent bank installment". Now that
    // every variable item carries an explicit payment method (resolveVariablePaymentMethod()), a
    // 'bank'-method item generates one real event per active billing month (identical schedule to
    // 'loan' below); a 'credit'-method item, and any LEGACY item saved before this field existed
    // (method unknown), remain tracking-only exactly as before — see resolveVariablePaymentMethod()
    // for why an unset method must never be assumed to be 'bank'.

    var CASHFLOW_HORIZON_MONTHS = 6;

    // Deterministic same-day ordering for TIMELINE/DISPLAY PURPOSES ONLY. Every balance number
    // below (estimated-today/lowest/end-of-month) is computed from a per-CALENDAR-DAY sum of
    // that day's events, not from a running total after each individual event — so this order
    // can never change any balance figure, only the order same-day rows are listed in the
    // timeline UI. Income is listed before expenses on a shared day so a day that nets
    // positive never *appears* to dip first; expense types are then ordered fixed → loan →
    // variable → dated (arbitrary but fixed), with itemId as the final tiebreak.
    var CASHFLOW_TYPE_ORDER = { income: 0, fixed: 1, loan: 2, variable: 3, dated: 4, cashWithdrawal: 5 };
    function compareCashflowEvents(a, b) {
        var dCompare = a.date.getTime() - b.date.getTime();
        if (dCompare !== 0) { return dCompare; }
        var ta = (CASHFLOW_TYPE_ORDER[a.type] !== undefined) ? CASHFLOW_TYPE_ORDER[a.type] : 99;
        var tb = (CASHFLOW_TYPE_ORDER[b.type] !== undefined) ? CASHFLOW_TYPE_ORDER[b.type] : 99;
        if (ta !== tb) { return ta - tb; }
        return (a.itemId || 0) - (b.itemId || 0);
    }

    function cashflowDateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function cashflowDateKey(d) {
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    // Parses a stored 'YYYY-MM-DD' string as a LOCAL calendar date (year, month-1, day) —
    // unlike the older getMonthSnapshot/getCategoryMonthlyTotals/computeForecast 'dated'
    // branches, which parse the same string via `new Date(string)` (spec'd as UTC midnight).
    // Used consistently for anchorDate parsing too, per the approved "avoid UTC date-shift
    // errors, local calendar semantics" requirement.
    function parseLocalDateStr(str) {
        var parts = (str || '').split('-');
        var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parts[2] ? parseInt(parts[2], 10) : 1;
        if (!isFinite(y) || !isFinite(m) || !isFinite(d)) { return null; }
        return new Date(y, m, d);
    }

    // Generates every cash-flow event across `monthsCount` consecutive calendar months
    // starting at `rangeStartMonth` (a Date already normalized to the 1st of its month) for
    // non-archived income/fixed/loan/dated items — unfiltered by any "today" boundary (that
    // filtering, where needed, happens in the caller, e.g. buildProjectedBalanceSeries()/
    // getNextCashflowEvent()). One event per monthly occurrence for
    // income/fixed; one event per active billing month for loans (per-month range test, not
    // the left>0 gate); at most one event for dated items. `rangeStartMonth` may be in the
    // past relative to the current month (needed to catch up from an old anchor date) or in
    // the current month (the common case when the anchor is today) — this function is unaware
    // of "today"/"the anchor" at all, it just fills in the requested window once.
    function generateCashflowEvents(items, rangeStartMonth, monthsCount) {
        var months = (typeof monthsCount === 'number') ? monthsCount : CASHFLOW_HORIZON_MONTHS;
        var rangeStart = (rangeStartMonth instanceof Date) ? rangeStartMonth : new Date();
        var horizonStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        var horizonEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + months, 0);
        var events = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.isArchived) { continue; }

            if (item.type === 'income') {
                for (var mi = 0; mi < months; mi++) {
                    var di = getClampedBillingDate(horizonStart.getFullYear(), horizonStart.getMonth() + mi, resolveEffectiveDay(item));
                    events.push({ date: di, amount: item.amount, itemId: item.id, type: 'income', title: item.title });
                }
            } else if (item.type === 'fixed') {
                // Payment-method correction: a fixed expense paid by credit card does not itself
                // leave the bank on its own billing day — the card's own monthly settlement (a
                // 'dated' item, itself excluded below when IT is marked 'credit') is what actually
                // does. Previously only getMonthSnapshot() excluded credit-paid fixed items; the
                // real balance-affecting engine here did not, double-counting them against the
                // settlement. resolveEffectiveWhere() defaults missing/legacy items to 'bank'
                // (unchanged behavior), so this only skips items explicitly marked 'credit'.
                if (resolveEffectiveWhere(item) !== 'credit') {
                    // Bimonthly correction: a bimonthly fixed item generates a DISCRETE, full-amount
                    // event only in months matching its starting month's parity (Sep start -> Sep,
                    // Nov, Jan, Mar, ... — see resolveFixedIsBimonthly()) instead of a smoothed
                    // amount every month. Monthly/yearly behavior below this check is unchanged.
                    var isBimonthlyFixed = resolveFixedIsBimonthly(item);
                    var bimonthlyStart = isBimonthlyFixed ? resolveFixedBimonthlyStartMonth(item) : null;
                    var mAmount = isBimonthlyFixed ? item.amount : ((item.period === 'שנתי') ? (item.amount / 12) : item.amount);
                    for (var mf = 0; mf < months; mf++) {
                        var probeMonth = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + mf, 1);
                        if (isBimonthlyFixed && !isBimonthlyActiveMonth(probeMonth.getMonth() + 1, bimonthlyStart)) { continue; }
                        var df = getClampedBillingDate(probeMonth.getFullYear(), probeMonth.getMonth(), resolveEffectiveDay(item));
                        events.push({ date: df, amount: -mAmount, itemId: item.id, type: 'fixed', title: item.title });
                    }
                }
            } else if (item.type === 'loan') {
                var range = getBillingRange(item.start, item.total, resolveEffectiveDay(item));
                if (range) {
                    for (var ml = 0; ml < months; ml++) {
                        var probe = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + ml, 1);
                        if (isBillingActiveInMonth(range, probe.getFullYear(), probe.getMonth())) {
                            var dl = getClampedBillingDate(probe.getFullYear(), probe.getMonth(), range.bDay);
                            events.push({ date: dl, amount: -item.amount, itemId: item.id, type: 'loan', title: item.title });
                        }
                    }
                }
            } else if (item.type === 'variable') {
                // Version 1.4.5: a 'bank'-method variable/installment item now generates one real
                // event per active billing month — identical range/clamping logic to 'loan' above
                // (same start/total/day schema), reusing getBillingRange()/isBillingActiveInMonth()
                // verbatim rather than inventing new date arithmetic. 'credit'-method and legacy
                // (unset) items generate nothing here — see resolveVariablePaymentMethod() and the
                // EVENT CONTRACT comment above for why an unset method must never be assumed bank.
                if (resolveVariablePaymentMethod(item) === 'bank') {
                    var rangeVar = getBillingRange(item.start, item.total, resolveEffectiveDay(item));
                    if (rangeVar) {
                        for (var mv = 0; mv < months; mv++) {
                            var probeVar = new Date(horizonStart.getFullYear(), horizonStart.getMonth() + mv, 1);
                            if (isBillingActiveInMonth(rangeVar, probeVar.getFullYear(), probeVar.getMonth())) {
                                var dv = getClampedBillingDate(probeVar.getFullYear(), probeVar.getMonth(), rangeVar.bDay);
                                events.push({ date: dv, amount: -item.amount, itemId: item.id, type: 'variable', title: item.title });
                            }
                        }
                    }
                }
            } else if (item.type === 'dated') {
                // Payment-method correction: a one-time dated charge paid by credit card is
                // deferred to the card's own monthly settlement instead of leaving the bank on its
                // own date — same reasoning as 'fixed' above. Settlement-identification
                // correction: the built-in settlement category itself is EXEMPT from this
                // exclusion — it always counts, regardless of its own `where` — see
                // isBuiltinCreditCardSettlement() above.
                if (isBuiltinCreditCardSettlement(item) || resolveEffectiveWhere(item) !== 'credit') {
                    var dd = item.start ? parseLocalDateStr(item.start) : null;
                    if (dd && dd >= horizonStart && dd <= horizonEnd) {
                        events.push({ date: dd, amount: -item.amount, itemId: item.id, type: 'dated', title: item.title });
                    }
                }
            } else if (item.type === 'cashWithdrawal') {
                // Version 1.4.2: a bank-balance movement, deliberately its OWN event type (not
                // 'dated') so it is structurally excluded from every dated/credit-card aggregation
                // in this file (getCategoryMonthlyTotals/getMonthSnapshot/getDatedMonthOverMonth
                // Change all switch strictly on item.type — a type they never match is automatically
                // never summed by them, no separate exclusion filter needed anywhere). One-time
                // event on its own exact date, same date-window/clamping convention as 'dated'.
                var dw = item.start ? parseLocalDateStr(item.start) : null;
                if (dw && dw >= horizonStart && dw <= horizonEnd) {
                    events.push({ date: dw, amount: -item.amount, itemId: item.id, type: 'cashWithdrawal', title: item.title });
                }
            }
            // any unrecognized type: no event.
        }

        events.sort(compareCashflowEvents);
        return events;
    }

    // ===== Version 1.4.1 calendar-month bounds helper — still used by Version 1.4.2's          =====
    // ===== buildProjectedBalanceMonthView() below to determine which days to display. The       =====
    // ===== Version 1.4.1 buildMonthlyDailySeries() function that used to sit here (cumulative   =====
    // ===== reset to ₪0 every month) was REMOVED in Version 1.4.2 — replaced by the continuously- =====
    // ===== carried buildProjectedBalanceSeries()/buildProjectedBalanceMonthView() further below, =====
    // ===== which is now the only day-level series Home/Forecast read. Version 1.4.6: the         =====
    // ===== calendar-month bounds this used to compute are REPLACED below by the approved 5th-to- =====
    // ===== 4th billing-cycle-aligned reporting period — see getForecastPeriodBounds().           =====
    // =====================================================================================

    // Version 1.4.6: the Forecast screen's reporting period — the 5th of a month through the 4th
    // of the following month, inclusive (NOT a calendar month). A refDate on the 1st–4th belongs
    // to the period that started the PREVIOUS month's 5th; a refDate on the 5th or later belongs
    // to the period starting THIS month's 5th. This period always spans exactly two distinct
    // calendar months (5th of month N through 4th of month N+1), including across a year boundary
    // (Dec 5 – Jan 4) — so a single Date's own month/year can no longer identify "the displayed
    // period" the way a calendar month could; periodStart/periodEnd fully describe it instead.
    // totalDays is computed via the SAME integer year/month arithmetic idiom already used by
    // getClampedBillingDate() above (`new Date(y, m+1, 0).getDate()`), not a millisecond
    // difference — this avoids any Israel-DST (שעון קיץ) off-by-one risk entirely. It also happens
    // to always equal periodStart's own calendar month length (5th–4th is just that month's days
    // shifted by 4), which is why a single such call suffices.
    function getForecastPeriodBounds(refDate) {
        var y = refDate.getFullYear(), m = refDate.getMonth(), d = refDate.getDate();
        var periodStart = (d >= 5) ? new Date(y, m, 5) : new Date(y, m - 1, 5);
        var periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 4);
        var totalDays = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
        var startLabel = periodStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
        var endLabel = periodEnd.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
        var periodLabel = startLabel + (periodStart.getFullYear() !== periodEnd.getFullYear() ? (' ' + periodStart.getFullYear()) : '') + ' – ' + endLabel;
        return { periodStart: periodStart, periodEnd: periodEnd, totalDays: totalDays, periodLabel: periodLabel };
    }

    // The single "האירוע הכספי הבא" card everywhere it appears (Home + Forecast) — strictly
    // after today, from the same unified event source, with no balance-anchor dependency
    // whatsoever. Looks two months ahead so an event just past a month boundary is never missed.
    function getNextCashflowEvent(itemsOverride) {
        var sourceItems = Array.isArray(itemsOverride) ? itemsOverride : items;
        var todayZero = cashflowDateOnly(new Date());
        var monthStart = new Date(todayZero.getFullYear(), todayZero.getMonth(), 1);
        var upcoming = generateCashflowEvents(sourceItems, monthStart, 2);
        var future = [];
        for (var i = 0; i < upcoming.length; i++) {
            if (cashflowDateOnly(upcoming[i].date) > todayZero) { future.push(upcoming[i]); }
        }
        future.sort(compareCashflowEvents);
        return future.length ? future[0] : null;
    }

    // =====================================================================================
    // ===== Version 1.4.2: authoritative projected-DAILY-BALANCE engine. Replaces the        =====
    // ===== Version 1.4.1 "cumulative since month start, resets to ₪0 every month" model with a  =====
    // ===== continuously-carried balance seeded from ONE locally-stored opening amount/date      =====
    // ===== (settings.projectedBalanceOpeningAmount/projectedBalanceOpeningDate — see            =====
    // ===== getProjectedBalanceOpeningConfig() near saveAppSettings() below). Reuses             =====
    // ===== generateCashflowEvents() verbatim as its ONLY event source — no new event type is    =====
    // ===== invented; 'variable' items follow generateCashflowEvents()'s own EVENT CONTRACT       =====
    // ===== rule (Version 1.4.5: 'bank'-method generates events, 'credit'/legacy remain           =====
    // ===== tracking-only). This is the ONE calculation path Home and                             =====
    // ===== the Forecast graph/table all read from — none of them may recompute a balance         =====
    // ===== independently.                                                                        =====
    // =====================================================================================

    // Walks every LOCAL calendar day from openingDateStr through throughDate (both inclusive),
    // carrying a running balance forward. Returns null only for a structurally invalid
    // openingDateStr (callers are expected to have already validated via
    // getProjectedBalanceOpeningConfig(), so this is a defensive guard, not the primary check).
    // When throughDate is BEFORE the opening date, returns an empty days[] — the caller (never
    // this function) decides how to label dates that precede the opening date; this function only
    // ever walks forward.
    function buildProjectedBalanceSeries(openingAmount, openingDateStr, throughDate, itemsOverride, includedWithdrawalIds) {
        var openingDate = parseLocalDateStr(openingDateStr);
        if (!openingDate || typeof openingAmount !== 'number' || !isFinite(openingAmount)) { return null; }
        var openingZero = cashflowDateOnly(openingDate);
        var through = cashflowDateOnly(throughDate);
        if (through < openingZero) { return { openingAmount: round2(openingAmount), openingDateStr: openingDateStr, days: [] }; }
        // Version 1.4.2 correction: `null` (never captured — legacy, or explicitly not supplied)
        // means the original blanket rule below applies to cash withdrawals too, same as every
        // other opening-date event type. A real array (possibly empty) enables the precise per-id
        // rule for cash withdrawals specifically — see getProjectedBalanceOpeningConfig().
        var includedIds = Array.isArray(includedWithdrawalIds) ? includedWithdrawalIds : null;

        var rangeStartMonth = new Date(openingZero.getFullYear(), openingZero.getMonth(), 1);
        var monthsCount = (through.getFullYear() - rangeStartMonth.getFullYear()) * 12 + (through.getMonth() - rangeStartMonth.getMonth()) + 1;
        var events = generateCashflowEvents(Array.isArray(itemsOverride) ? itemsOverride : items, rangeStartMonth, monthsCount);

        var byDay = {};
        for (var i = 0; i < events.length; i++) {
            var key = cashflowDateKey(events[i].date);
            if (!byDay[key]) { byDay[key] = []; }
            byDay[key].push(events[i]);
        }

        var days = [];
        var runningBalance = round2(openingAmount);
        var cursor = new Date(openingZero.getFullYear(), openingZero.getMonth(), openingZero.getDate());
        var isOpeningDay = true;
        while (cursor <= through) {
            var dateKey = cashflowDateKey(cursor);
            var dayEvents = byDay[dateKey] || [];
            var income = 0, expenses = 0, appliedNet = 0;
            var annotatedEvents = [];
            for (var j = 0; j < dayEvents.length; j++) {
                var ev = dayEvents[j];
                if (ev.amount >= 0) { income += ev.amount; } else { expenses += -ev.amount; }
                // Rule: an opening-date event is already reflected in the opening amount (it
                // represents the actual balance AFTER everything already posted that day) — EXCEPT
                // a cash withdrawal whose id is not in the captured snapshot list, which means it
                // was entered AFTER the snapshot was taken and must still reduce the balance on
                // this same day. Every other event type keeps the original unconditional rule.
                var alreadyIncluded = true;
                if (isOpeningDay && ev.type === 'cashWithdrawal') {
                    alreadyIncluded = (includedIds === null) ? true : (includedIds.indexOf(ev.itemId) !== -1);
                }
                if (!isOpeningDay || !alreadyIncluded) { appliedNet += ev.amount; }
                annotatedEvents.push({ date: ev.date, amount: ev.amount, itemId: ev.itemId, type: ev.type, title: ev.title, alreadyIncludedInOpeningSnapshot: isOpeningDay ? alreadyIncluded : false });
            }
            income = round2(income); expenses = round2(expenses);
            var net = round2(income - expenses);
            appliedNet = round2(appliedNet);
            if (isOpeningDay) {
                runningBalance = round2(openingAmount + appliedNet);
            } else {
                runningBalance = round2(runningBalance + net);
            }
            days.push({
                date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
                dateKey: dateKey, income: income, expenses: expenses, net: net,
                projectedBalance: runningBalance, events: annotatedEvents, isOpeningDay: isOpeningDay
            });
            isOpeningDay = false;
            cursor.setDate(cursor.getDate() + 1);
        }

        return { openingAmount: round2(openingAmount), openingDateStr: openingDateStr, days: days };
    }

    // Version 1.4.6: the Forecast graph/table's day range — one entry for every day of the
    // approved 5th-to-4th reporting period containing refDate (see getForecastPeriodBounds()),
    // always (including days before the opening date, and days before today). A day strictly
    // before the opening date carries no computed figures at all (availability: 'unavailable') —
    // never back-calculated, never fabricated (approved requirement: dates before the opening
    // balance must show "אין נתון לפני יתרת ההתחלה", not a guessed number). Returns
    // { configured:false, ... } with no days[] figures when no valid opening balance exists yet.
    // Reuses buildProjectedBalanceSeries() verbatim as its only calculation source (walked from
    // the existing opening balance through periodEnd — the opening balance itself is never reset
    // or reseeded on the 5th, exactly as required) — this function only decides which slice of
    // that one series' days to expose, never computes a balance independently.
    function buildProjectedBalanceMonthView(refDate, itemsOverride) {
        var bounds = getForecastPeriodBounds(refDate);
        var base = { periodStart: bounds.periodStart, periodEnd: bounds.periodEnd, periodLabel: bounds.periodLabel, totalDays: bounds.totalDays };
        var opening = getProjectedBalanceOpeningConfig();
        if (!opening) { base.configured = false; base.days = []; return base; }

        var openingZero = cashflowDateOnly(parseLocalDateStr(opening.dateStr));
        var series = (openingZero <= bounds.periodEnd) ? buildProjectedBalanceSeries(opening.amount, opening.dateStr, bounds.periodEnd, itemsOverride, opening.includedWithdrawalIds) : null;
        var seriesByKey = {};
        if (series) { for (var i = 0; i < series.days.length; i++) { seriesByKey[series.days[i].dateKey] = series.days[i]; } }

        var days = [];
        var cursor = new Date(bounds.periodStart.getFullYear(), bounds.periodStart.getMonth(), bounds.periodStart.getDate());
        var periodDayIndex = 1;
        while (cursor <= bounds.periodEnd) {
            var date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
            var dateKey = cashflowDateKey(date);
            if (date < openingZero) {
                days.push({ date: date, periodDayIndex: periodDayIndex, dateKey: dateKey, availability: 'unavailable', income: null, expenses: null, net: null, projectedBalance: null, events: [] });
            } else {
                var rec = seriesByKey[dateKey];
                days.push({
                    date: date, periodDayIndex: periodDayIndex, dateKey: dateKey,
                    availability: rec.isOpeningDay ? 'opening' : 'available',
                    income: rec.income, expenses: rec.expenses, net: rec.net,
                    projectedBalance: rec.projectedBalance, events: rec.events
                });
            }
            periodDayIndex++;
            cursor.setDate(cursor.getDate() + 1);
        }

        base.configured = true;
        base.openingAmount = opening.amount;
        base.openingDateStr = opening.dateStr;
        base.days = days;
        return base;
    }

    // Home's "יתרה צפויה להיום" — the SAME buildProjectedBalanceSeries() engine as the Forecast
    // screen, just walked through today instead of through the displayed month's last day. Never a
    // second/independent balance calculation.
    function getProjectedBalanceToday(itemsOverride) {
        var opening = getProjectedBalanceOpeningConfig();
        if (!opening) { return { configured: false }; }
        var todayZero = cashflowDateOnly(new Date());
        var openingZero = cashflowDateOnly(parseLocalDateStr(opening.dateStr));
        if (todayZero < openingZero) { return { configured: true, state: 'future', openingDateStr: opening.dateStr }; }
        var series = buildProjectedBalanceSeries(opening.amount, opening.dateStr, todayZero, itemsOverride, opening.includedWithdrawalIds);
        var last = series.days[series.days.length - 1];
        return { configured: true, state: 'available', projectedBalance: last.projectedBalance, isOpeningDay: last.isOpeningDay };
    }

    // =====================================================================================
    // ===== Stage D.2 (originally Preview-only, now Stage 4.4 candidate): read-only          =====
    // ===== connection to the app's own localStorage data. Reads ONLY DATA_KEY/CONFIG_KEY —  =====
    // ===== the real family_finance_data/family_finance_cat_config keys directly, no other   =====
    // ===== key. No setItem/removeItem anywhere in this section. Not wired to any Stage C     =====
    // ===== function, mockItems, mockCategoryConfig, buildNarrative, or UI — `items`/         =====
    // ===== `categoryConfig` below are declared and loaded, nothing more.                     =====
    // =====================================================================================

    function loadPreviewItems() {
        var raw = localStorage.getItem(DATA_KEY);
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            parsed = null;
        }
        // Safe fallback: anything that isn't actually an array (missing key, corrupt JSON,
        // wrong type) becomes an empty items list — never throws, never invents item data.
        return Array.isArray(parsed) ? parsed : [];
    }

    function loadPreviewCategoryConfig() {
        var raw = localStorage.getItem(CONFIG_KEY);
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            parsed = null;
        }
        var isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        var defaults;
        try { defaults = JSON.parse(DEFAULT_CATEGORY_CONFIG_JSON); } catch (e2) { defaults = {}; }
        if (!isPlainObject) {
            // Safe fallback: missing key, corrupt JSON, or wrong type (array/null/primitive) falls
            // back to DEFAULT_CATEGORY_CONFIG_JSON — the real app's own known-good default shape,
            // not Stage C's mock data.
            return defaults;
        }
        // Version 1.4.2 correction: backfill any built-in default key that is entirely ABSENT
        // from an already-stored config (e.g. 'dated', newly added to DEFAULT_CATEGORY_CONFIG_JSON
        // after this user's config was first saved) — in-memory only, never overwrites an
        // existing key of the same name (a user's own pre-existing category, whatever its key, is
        // always left exactly as stored), never calls localStorage.setItem from inside a loader
        // (same "load never writes" convention loadAppSettings() already follows). Idempotent by
        // construction: recomputed fresh from the current stored object on every load, so it can
        // never duplicate — it persists automatically the next time any category mutation calls
        // savePreviewCategoryConfig() and writes the full (now-merged) object back.
        for (var dk in defaults) {
            if (parsed[dk] === undefined) { parsed[dk] = defaults[dk]; }
        }
        return parsed;
    }

    // =====================================================================================
    // ===== Version 1.1, Stage 4.0.3: settings + activity log persistence. Two new keys,   =====
    // ===== both prefixed 'family_finance_' like DATA_KEY/CONFIG_KEY, loaded once here      =====
    // ===== (same convention as loadPreviewItems/loadPreviewCategoryConfig above) — a       =====
    // ===== missing/corrupt/wrong-shape value always falls back to a safe default rather    =====
    // ===== than throwing.                                                                   =====
    // =====================================================================================

    function getDefaultAppSettings() {
        return {
            theme: 'system',
            primaryColor: 'green',
            fontSize: 'medium',
            pinHash: null,
            pinEnabled: false,
            autoLockMinutes: null,
            // Version 1.3, Phase 2B (legacy field). Version 1.4.1 correction: the balance-anchor
            // UI and its entire calculation path (resolveBalanceAnchor()/buildCashflowSummary())
            // were removed — this field, and anchorBalance/anchorDate below, are no longer
            // written OR read by any live code anywhere in the app. They are kept purely so an
            // existing user's already-stored family_finance_settings value is never silently
            // dropped/rewritten by this default-shape function — pure backward-compatible
            // preservation, not an active data source.
            currentBalance: null,
            anchorBalance: null,
            anchorDate: null,
            // Version 1.4.2: one-time, user-entered opening balance for the projected daily
            // balance engine — a wholly separate, newly-introduced concept from the retired
            // anchorBalance/anchorDate above (never reactivated, never auto-adopted from them; a
            // rejected legacy value must not silently reappear here). null/null = unconfigured.
            // See getProjectedBalanceOpeningConfig()/saveProjectedBalanceOpening() below for the
            // validation contract.
            projectedBalanceOpeningAmount: null,
            projectedBalanceOpeningDate: null,
            // Version 1.4.2 correction: the snapshot-boundary list — cash-withdrawal item ids
            // already reflected in the opening amount at the moment it was (most recently) saved,
            // rebuilt from scratch on every save/replace (see saveProjectedBalanceOpening()).
            // `null` (the default, and what any settings blob saved by the ORIGINAL 1.4.2 code
            // before this correction will have) means "never captured" — buildProjectedBalanceSeries()
            // then falls back to the original blanket rule (every opening-date event, cash
            // withdrawals included, already reflected) so a legacy opening balance's behavior does
            // not change until the user next saves/replaces it. Once populated, it is always a real
            // array (possibly empty) and the precise per-id rule applies.
            projectedBalanceOpeningIncludedWithdrawalIds: null,
            notifications: { upcomingPayment: true, upcomingIncome: true, completedObligation: true },
            experimentalFlags: {},
            // Version 1.4.6: last successful add/edit date (local 'YYYY-MM-DD', via todayStr()) for
            // the built-in credit-card settlement category ONLY — never the charge date, never
            // "today" as a live fallback at render time. null = never updated since this field was
            // introduced ("עודכן: —"). Deletion never writes this field — see deletePreviewItem()'s
            // callers, which have no code path that touches it.
            creditCardSettlementUpdatedAt: null
        };
    }

    // =====================================================================================
    // ===== Milestone 4: Goals data model, storage, and pure planning-calculation         =====
    // ===== functions. Goals are a wholly separate collection from items[] — a new           =====
    // ===== 'family_finance_goals' key, automatically covered by the existing prefix-sweep    =====
    // ===== backup/reset functions (no changes needed there beyond the schemaVersion bump).   =====
    // =====================================================================================

    // Rounds to currency (2dp) precision at every summation boundary to avoid visible float
    // drift (e.g. 0.1+0.2 style errors) — the app's existing convention elsewhere is plain
    // floats rounded only at DISPLAY time (formatHomeCurrency does Math.round); goals follow
    // that same plain-float approach (consistent with every other amount in this file — loans,
    // fixed, income are all plain floats too, so a separate integer-cents representation only
    // for goals would be LESS consistent, not more), with this extra rounding step added at
    // sum/subtract boundaries specifically because goal math chains multiple additions
    // (component sums, remaining = target - saved - confirmed) where drift could otherwise
    // visibly accumulate before the final display-time rounding.
    function round2(n) {
        return Math.round((n + Number.EPSILON) * 100) / 100;
    }

    var goalsIdCounter = 0;
    // Stable unique IDs, string-typed (items[] uses numeric Date.now() ids; goals are a
    // separate collection with no compatibility requirement to match that exact type — a
    // string prefix is clearer for two different id namespaces, e.g. "goal" vs "comp", and
    // the counter guarantees uniqueness even when several components are created in the same
    // synchronous save, which Date.now() alone cannot guarantee).
    function generateGoalsId(prefix) {
        goalsIdCounter += 1;
        return prefix + '_' + Date.now() + '_' + goalsIdCounter;
    }

    // Same 'YYYY-MM-DD' shape check used implicitly elsewhere via parseLocalDateStr(), made
    // explicit here for form validation (parseLocalDateStr is lenient — it happily returns a
    // Date for garbage input like "9999-99-99" — so goal/component due-date validation needs
    // its own real-calendar-date check).
    function isValidDateStr(str) {
        if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) { return false; }
        var d = parseLocalDateStr(str);
        if (!d || isNaN(d.getTime())) { return false; }
        // Reject a clamped-but-different date (e.g. "2027-02-30" silently becoming March 2 in
        // native Date arithmetic) — the stored string must describe a real calendar date.
        var parts = str.split('-');
        return d.getFullYear() === parseInt(parts[0], 10) && (d.getMonth() + 1) === parseInt(parts[1], 10) && d.getDate() === parseInt(parts[2], 10);
    }

    // Positive-amount parse: rejects NaN, Infinity, zero, and negative values. Returns the
    // parsed number or null (never NaN) so callers can use a simple truthiness-safe check.
    function sanitizePositiveAmount(raw) {
        var n = parseFloat(raw);
        if (!isFinite(n) || n <= 0) { return null; }
        return round2(n);
    }

    // Non-negative amount parse (saved/opening amount — 0 is valid, negative is not).
    function sanitizeNonNegativeAmount(raw) {
        var n = parseFloat(raw);
        if (!isFinite(n) || n < 0) { return null; }
        return round2(n);
    }

    // Any-sign finite amount parse — Version 1.4.2 projected-balance opening amount, which may
    // legitimately be positive, zero, OR negative (an already-overdrawn real bank balance). Unlike
    // sanitizePositiveAmount/sanitizeNonNegativeAmount above, the only values rejected here are
    // NaN/Infinity/non-numeric input — never coerced, never defaulted to 0.
    function sanitizeFiniteAmount(raw) {
        var n = parseFloat(raw);
        if (typeof raw === 'string' && raw.trim() === '') { return null; }
        if (!isFinite(n)) { return null; }
        return round2(n);
    }

    // Milestone 7.1: canonical Goal-metadata timestamp writer/validator — deliberately SEPARATE
    // from nowTimestampStr() (which stays completely untouched: it's shared with activityLog
    // entries and backup.exportedAt, neither of which this correction's scope covers, and both of
    // which intentionally use a local "YYYY-MM-DD HH:mm" display-oriented format, not this
    // machine-readable UTC contract). Used ONLY for goal.createdAt/updatedAt and a new-format
    // confirmedTransfer's confirmedAt — never for goal/component due dates or a transfer's own
    // `date`, which remain local YYYY-MM-DD business dates via isValidDateStr()/todayStr(),
    // untouched by this correction.
    function nowIsoTimestamp() {
        return new Date().toISOString();
    }

    // Date.prototype.toISOString() always produces exactly "YYYY-MM-DDTHH:mm:ss.sssZ" (UTC,
    // millisecond precision, literal "Z") for any valid Date — so round-tripping a candidate
    // string through `new Date(str).toISOString()` and comparing it back to the original string
    // is a complete, self-contained validator: it rejects non-canonical shapes (missing "Z",
    // wrong precision, a numeric offset instead of "Z", date-only, locale-formatted) AND
    // impossible calendar values (an out-of-range day/month either parses to Invalid Date, or —
    // for constructors that clamp/roll over — re-serializes to a DIFFERENT string than the input,
    // which this comparison still catches) without needing separate regex + calendar-math logic.
    function isValidCanonicalIsoTimestamp(str) {
        if (typeof str !== 'string' || str === '') { return false; }
        var d = new Date(str);
        if (isNaN(d.getTime())) { return false; }
        return d.toISOString() === str;
    }

    // Milestone 6 correction: genuinely strict raw-shape validation, replacing the previous
    // version which silently REPAIRED several kinds of invalid input into something that looked
    // valid — auto-generating a missing id, defaulting a missing/wrong-typed createdAt/updatedAt
    // to "now", truthiness-coercing isArchived, and (via sanitizePositiveAmount/
    // sanitizeNonNegativeAmount's parseFloat) silently accepting a NUMERIC-STRING amount as if it
    // were already a number. That is the opposite of "strict, all-or-nothing, never partial
    // trust" for restore-time/local-integrity data. normalizeComponent()/normalizeGoal() are
    // called ONLY from isValidGoalsArrayStrict() below (never for parsing live FORM input, which
    // goes through sanitizePositiveAmount()/sanitizeNonNegativeAmount() directly in
    // saveNewGoal()/saveGoalEdit()/the component forms, untouched by this correction) — so there
    // is no longer any live "lenient" caller to preserve, and the `strict` parameter these two
    // functions used to take is removed as dead. Every check below inspects the RAW parsed
    // value's actual type BEFORE any trimming/rounding/shaping happens, so an invalid raw shape
    // can never be coerced/defaulted/repaired into an apparently-valid one. Goals are not yet
    // released to Production, so there is no compatibility requirement to keep accepting
    // malformed records that happened to work under the old lenient rules.

    // One component: id/name/amount required with exact types (amount must already be a number,
    // never a numeric string); dueDate, if present at all, must already be a real calendar date
    // string (a present-but-invalid dueDate rejects the component — there is no more "silently
    // treat as inherited" fallback for a value that was actually supplied and wrong).
    function normalizeComponent(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return null; }
        if (typeof raw.id !== 'string' || !raw.id) { return null; }
        if (typeof raw.name !== 'string') { return null; }
        var name = raw.name.trim();
        if (!name) { return null; }
        if (typeof raw.amount !== 'number' || !isFinite(raw.amount) || raw.amount <= 0) { return null; }
        var dueDate = null;
        if (raw.dueDate !== null && raw.dueDate !== undefined) {
            if (!isValidDateStr(raw.dueDate)) { return null; }
            dueDate = raw.dueDate;
        }
        return { id: raw.id, name: name, amount: round2(raw.amount), dueDate: dueDate };
    }

    // One goal. Required raw types: id/title (non-empty string), dueDate (real calendar date),
    // isArchived (actual boolean, not merely truthy), createdAt/updatedAt (Milestone 7.1: canonical
    // ISO 8601 UTC timestamp — see isValidCanonicalIsoTimestamp() — never silently defaulted when
    // missing/invalid, and updatedAt must not be EARLIER than createdAt), components/
    // confirmedTransfers (arrays). targetAmount/savedAmount must already be numbers (never numeric
    // strings). For a goal WITH components, the stored targetAmount is additionally required to
    // reconcile EXACTLY with round2(sum of the already-validated component amounts) — a stale/
    // contradictory stored total is rejected outright, never silently overwritten with the
    // recomputed sum as an earlier implementation did.
    function normalizeGoal(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return null; }
        if (typeof raw.id !== 'string' || !raw.id) { return null; }
        if (typeof raw.title !== 'string') { return null; }
        var title = raw.title.trim();
        if (!title) { return null; }
        if (!isValidDateStr(raw.dueDate)) { return null; }
        if (typeof raw.isArchived !== 'boolean') { return null; }
        if (!isValidCanonicalIsoTimestamp(raw.createdAt)) { return null; }
        if (!isValidCanonicalIsoTimestamp(raw.updatedAt)) { return null; }
        if (new Date(raw.updatedAt).getTime() < new Date(raw.createdAt).getTime()) { return null; } // updatedAt must not precede createdAt
        if (!Array.isArray(raw.components)) { return null; }
        if (!Array.isArray(raw.confirmedTransfers)) { return null; }

        var components = [];
        var seenComponentIds = {};
        for (var i = 0; i < raw.components.length; i++) {
            var comp = normalizeComponent(raw.components[i]);
            if (!comp) { return null; }
            if (seenComponentIds[comp.id]) { return null; } // no duplicate component IDs
            seenComponentIds[comp.id] = true;
            components.push(comp);
        }

        var targetAmount;
        if (components.length > 0) {
            var sum = 0;
            for (var j = 0; j < components.length; j++) { sum = round2(sum + components[j].amount); }
            if (typeof raw.targetAmount !== 'number' || !isFinite(raw.targetAmount)) { return null; }
            if (round2(raw.targetAmount) !== sum) { return null; } // stale/contradictory stored total
            targetAmount = sum;
        } else {
            if (typeof raw.targetAmount !== 'number' || !isFinite(raw.targetAmount) || raw.targetAmount <= 0) { return null; }
            targetAmount = round2(raw.targetAmount);
        }

        if (typeof raw.savedAmount !== 'number' || !isFinite(raw.savedAmount) || raw.savedAmount < 0) { return null; }
        var savedAmount = round2(raw.savedAmount);

        // Milestone 7.1: a confirmedTransfers entry must be EITHER a true legacy record (exactly
        // `date`+`amount`, none of the 4 Milestone-5 fields present) OR a COMPLETE new-format
        // reminder record (ALL 4 of id/confirmedAt/reminderPeriod/source present and individually
        // valid) — a "partial hybrid" (some but not all of the 4 present) is never reinterpreted
        // as legacy and rejects the whole dataset, same as any other malformed shape here.
        var confirmedTransfers = [];
        for (var k = 0; k < raw.confirmedTransfers.length; k++) {
            var ct = raw.confirmedTransfers[k];
            if (!ct || typeof ct !== 'object' || Array.isArray(ct)) { return null; }
            // date/amount are the only two fields common to both shapes.
            if (typeof ct.amount !== 'number' || !isFinite(ct.amount) || ct.amount <= 0) { return null; }
            if (typeof ct.date !== 'string' || !isValidDateStr(ct.date)) { return null; }

            var hasId = ct.id !== undefined;
            var hasConfirmedAt = ct.confirmedAt !== undefined;
            var hasReminderPeriod = ct.reminderPeriod !== undefined;
            var hasSource = ct.source !== undefined;
            var newFieldCount = (hasId ? 1 : 0) + (hasConfirmedAt ? 1 : 0) + (hasReminderPeriod ? 1 : 0) + (hasSource ? 1 : 0);

            if (newFieldCount === 0) {
                // True legacy record (predates Milestone 5) — fully valid on its own.
                confirmedTransfers.push({ date: ct.date, amount: round2(ct.amount) });
            } else if (newFieldCount === 4) {
                if (typeof ct.id !== 'string' || !ct.id) { return null; }
                if (!isValidCanonicalIsoTimestamp(ct.confirmedAt)) { return null; }
                if (typeof ct.reminderPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(ct.reminderPeriod)) { return null; }
                if (ct.reminderPeriod !== ct.date.slice(0, 7)) { return null; } // must match the transfer date's own YYYY-MM
                if (ct.source !== 'goals_reminder') { return null; } // exact match — the only source this app's own writer ever produces
                confirmedTransfers.push({
                    date: ct.date, amount: round2(ct.amount),
                    id: ct.id, confirmedAt: ct.confirmedAt, reminderPeriod: ct.reminderPeriod, source: ct.source
                });
            } else {
                return null; // partial hybrid — never accepted, never reinterpreted as legacy
            }
        }

        return {
            id: raw.id,
            title: title,
            dueDate: raw.dueDate,
            targetAmount: targetAmount,
            savedAmount: savedAmount,
            components: components,
            isArchived: raw.isArchived,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            confirmedTransfers: confirmedTransfers
        };
    }

    // Strict, restore-time AND local-load-time validator (the same one function serves both — no
    // separate lenient variant, per the Milestone 4 "one strict definition of valid, used
    // everywhere" decision, which this Milestone 6 correction keeps intact while tightening what
    // "valid" actually inspects): returns the fully-normalized array on success, or null if ANY
    // goal/component in `arr` is structurally invalid (per normalizeGoal()/normalizeComponent()
    // above) or if any goal/component id is duplicated.
    function isValidGoalsArrayStrict(arr) {
        if (!Array.isArray(arr)) { return null; }
        var result = [];
        var seenIds = {};
        for (var i = 0; i < arr.length; i++) {
            var g = normalizeGoal(arr[i]);
            if (!g) { return null; }
            if (seenIds[g.id]) { return null; } // no duplicate goal IDs
            seenIds[g.id] = true;
            result.push(g);
        }
        return result;
    }

    // Milestone 4 correction: ALL-OR-NOTHING local integrity check, replacing the previous
    // lenient per-entry loader (which silently dropped malformed entries and de-duplicated ids —
    // no longer approved behavior). Never writes to localStorage — a pure read. Absence of the
    // key is a valid empty list (the lazy-write model: a goals-aware device that has never
    // created a goal has no key yet, which is NOT corruption). Any other problem — invalid JSON,
    // a non-array value, or ANY malformed goal/component/confirmedTransfer/duplicate-id anywhere
    // in the array (isValidGoalsArrayStrict() already checks every one of these) — makes the
    // ENTIRE local dataset invalid: nothing is dropped, filtered, or silently repaired, and
    // `raw` preserves the exact original localStorage string byte-for-byte for later recovery
    // paths (reset-only / restore) to act on. `goals` is [] in BOTH the "genuinely empty" and
    // "invalid" cases — callers MUST check `.valid` before treating that [] as real data (see
    // renderGoalsScreenFromRealData()'s integrity-warning branch and saveGoals()'s guard below).
    function loadGoalsState() {
        var raw;
        try { raw = localStorage.getItem(GOALS_KEY); } catch (e) { raw = null; }
        if (raw === null) { return { valid: true, raw: null, goals: [] }; }
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return { valid: false, raw: raw, goals: [] }; }
        var validated = isValidGoalsArrayStrict(parsed);
        if (validated === null) { return { valid: false, raw: raw, goals: [] }; }
        return { valid: true, raw: raw, goals: validated };
    }

    // Guarded write: refuses to persist while the local dataset is known-invalid (goalsState.valid
    // false), so a stray call from any Goals mutation path can never overwrite the corrupted raw
    // value with an in-memory [] — the ONLY sanctioned ways to change GOALS_KEY while invalid are
    // confirmResetGoalsIntegrity() (explicit, destructive, user-confirmed) or a restore. Every
    // create/edit/archive/component mutation funnels through this one function, so guarding it
    // here protects all of them at once rather than repeating the check at each call site.
    function saveGoals() {
        if (!goalsState.valid) { console.log('שגיאה: לא ניתן לשמור יעדים בעוד הנתונים המקומיים פגומים'); return; }
        try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch (e) { console.log('שגיאה בשמירת יעדים'); }
    }

    // ----- Goal amount helpers (single source of truth for the "components sum vs. entered
    // target" rule — never two independently-editable totals that can disagree) -----

    function goalTargetAmount(goal) {
        if (goal.components && goal.components.length > 0) {
            var sum = 0;
            for (var i = 0; i < goal.components.length; i++) { sum += goal.components[i].amount; }
            return round2(sum);
        }
        return round2(goal.targetAmount || 0);
    }

    function goalConfirmedTransfersTotal(goal) {
        var sum = 0;
        var list = goal.confirmedTransfers || [];
        for (var i = 0; i < list.length; i++) { sum += (list[i].amount || 0); }
        return round2(sum);
    }

    function goalRemainingAmount(goal) {
        var target = goalTargetAmount(goal);
        var saved = round2(goal.savedAmount || 0);
        var confirmed = goalConfirmedTransfersTotal(goal);
        return Math.max(round2(target - saved - confirmed), 0);
    }

    function goalProgressPercent(goal) {
        var target = goalTargetAmount(goal);
        if (target <= 0) { return 0; }
        var saved = round2(goal.savedAmount || 0) + goalConfirmedTransfersTotal(goal);
        return Math.min(100, Math.max(0, Math.round((saved / target) * 100)));
    }

    // A component with no own dueDate inherits the parent goal's due date — the single place
    // this inheritance rule is implemented, so the UI and the schedule math can never disagree
    // about which date a given component actually uses.
    function resolveComponentEffectiveDueDate(component, goal) {
        return component.dueDate || goal.dueDate;
    }

    // "If the due date is before the 2nd of its month, the final eligible transfer date is the
    // 2nd of the previous month. If the due date is on or after the 2nd, that month's 2nd is
    // eligible." Real calendar-date arithmetic (JS Date month rollover), not approximate.
    function getLastEligibleTransferDate(dueDateStr) {
        var due = parseLocalDateStr(dueDateStr);
        var y = due.getFullYear(), m = due.getMonth(), d = due.getDate();
        if (d < 2) { m -= 1; }
        return new Date(y, m, 2);
    }

    // Every 2nd-of-month date from the next upcoming opportunity (today's own 2nd counts if
    // today IS the 2nd — it has not passed yet today) through the last eligible date inclusive.
    // Returns [] when the last eligible date is already in the past relative to today (the
    // overdue case) or otherwise before the next upcoming opportunity.
    function getUpcomingEligibleTransferDates(dueDateStr) {
        var last = getLastEligibleTransferDate(dueDateStr);
        var today = cashflowDateOnly(new Date());
        var firstCandidate = new Date(today.getFullYear(), today.getMonth(), 2);
        if (firstCandidate.getTime() < today.getTime()) {
            firstCandidate = new Date(today.getFullYear(), today.getMonth() + 1, 2);
        }
        var dates = [];
        var cursor = firstCandidate;
        while (cursor.getTime() <= last.getTime()) {
            dates.push(cursor);
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 2);
        }
        return dates;
    }

    // Milestone 5: the reminder needs its OWN date sequence for the same deadline — "today"
    // itself counts as an immediate opportunity (not "the next upcoming 2nd", which is what the
    // Goals-card view uses) whenever the reminder is actually showing (on/after the 2nd, or the
    // obligation is overdue). Before the 2nd (day 1 only), today is not yet a real opportunity for
    // a NON-overdue obligation, so this falls back to the exact same "next upcoming 2nd" sequence
    // the card uses — nothing appears artificially immediate on day 1. An already-overdue
    // deadline returns [] here too (same convention as getUpcomingEligibleTransferDates) — the
    // overdue amount is handled separately, in full, by buildGoalReminderInfo() below.
    function getReminderEligibleTransferDates(dueDateStr) {
        var last = getLastEligibleTransferDate(dueDateStr);
        var today = cashflowDateOnly(new Date());
        if (today.getTime() > last.getTime()) { return []; }
        if (today.getDate() < 2) { return getUpcomingEligibleTransferDates(dueDateStr); }
        var dates = [today];
        var cursor = new Date(today.getFullYear(), today.getMonth() + 1, 2);
        while (cursor.getTime() <= last.getTime()) {
            dates.push(cursor);
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 2);
        }
        return dates;
    }

    // Single-deadline schedule builder over an ALREADY-COMPUTED list of eligible dates — the
    // shared core both buildDeadlineSchedule() (Goals card: "next upcoming 2nd" cadence) and
    // Milestone 5's reminder scheduler (getReminderEligibleTransferDates(): "today is immediate")
    // reduce to. Round up to a whole shekel; the final date absorbs whatever remainder is left, so
    // per-date amounts always sum to EXACTLY `remaining`; never negative; an empty `eligibleDates`
    // with remaining>0 means overdue, never a division by zero.
    function buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates) {
        var isCompleted = remaining <= 0;
        var isOverdue = !isCompleted && eligibleDates.length === 0;

        var suggestedMonthly = null;
        var perDateAmounts = [];
        if (!isCompleted && !isOverdue) {
            suggestedMonthly = Math.ceil(remaining / eligibleDates.length);
            var runningRemaining = remaining;
            for (var i = 0; i < eligibleDates.length; i++) {
                var isLast = (i === eligibleDates.length - 1);
                var amt = isLast ? runningRemaining : Math.min(suggestedMonthly, runningRemaining);
                amt = Math.max(round2(amt), 0);
                perDateAmounts.push({ date: eligibleDates[i], amount: amt });
                runningRemaining = round2(runningRemaining - amt);
            }
        }
        return { remaining: remaining, dueDate: dueDateStr, isCompleted: isCompleted, isOverdue: isOverdue, eligibleDates: eligibleDates, suggestedMonthly: suggestedMonthly, perDateAmounts: perDateAmounts };
    }

    // Goals-card scheduler — unchanged behavior/signature from Milestone 4, now a thin wrapper
    // over the shared core above. This is used PER BUCKET by buildGoalScheduleInfo() below.
    function buildDeadlineSchedule(remaining, dueDateStr) {
        var isCompleted = remaining <= 0;
        var eligibleDates = isCompleted ? [] : getUpcomingEligibleTransferDates(dueDateStr);
        return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
    }

    // Milestone 5 reminder scheduler — same shared core, "today is immediate" date sequence.
    function buildReminderDeadlineSchedule(remaining, dueDateStr) {
        var isCompleted = remaining <= 0;
        var eligibleDates = isCompleted ? [] : getReminderEligibleTransferDates(dueDateStr);
        return buildDeadlineScheduleFromDates(remaining, dueDateStr, eligibleDates);
    }

    // Milestone 4 correction (approved product decision, replaces the earlier "earliest date
    // funds the entire goal" rule): true COMPONENT-SPECIFIC deadline planning. Each component (or
    // the flat goal itself, when it has no components) is its own independent funding "bucket"
    // with its own due date and its own buildDeadlineSchedule() — so an earlier component is
    // always funded by its OWN effective date, never merely implied by a pace set for a later
    // sibling/parent deadline.
    //
    // The single pooled savedAmount + confirmedTransfers total is not attributed per-component in
    // the data model, so it must be ATTRIBUTED for scheduling purposes — done here via the
    // simplest defensible rule (not an invented proportional-split model): earliest-deadline-first.
    // Buckets are sorted by due date and the pool is applied to the earliest bucket first, then
    // the next, etc. — the same order that money would actually need to be spent in reality, so a
    // component due sooner is never left looking underfunded just because a later component's
    // money happens to sit in the same undifferentiated pool.
    //
    // Every bucket's own perDateAmounts are then merged into one combined per-calendar-date total
    // (mergedPerDateAmounts) — this is what actually answers "how much do I need to transfer on
    // the 2nd of next month," accounting for every still-open component at once. nextTransferDate/
    // nextTransferAmount expose the single soonest such combined figure for the headline UI text.
    // Shared bucket-building core: given a goal and a deadline-scheduler function (either
    // buildDeadlineSchedule — Goals card — or buildReminderDeadlineSchedule — Milestone 5
    // reminder), builds the exact same funding buckets, FIFO pool allocation, and merged
    // per-date view either way. This is the ONE place bucket construction happens — the two
    // call sites below (buildGoalScheduleInfo/buildGoalReminderInfo) never duplicate it, so the
    // Goals card and the reminder can never disagree about target/saved/confirmed/remaining or
    // about which bucket owns how much of the pool — only the DATE SEQUENCE each deadline is
    // scheduled against legitimately differs between the two (by design: the reminder answers
    // "what do I need to pay right now," the card answers "what's the ongoing monthly pace").
    function buildGoalFundingBuckets(goal, deadlineSchedulerFn) {
        var target = goalTargetAmount(goal);
        var saved = round2(goal.savedAmount || 0);
        var confirmed = goalConfirmedTransfersTotal(goal);
        var remaining = goalRemainingAmount(goal);
        var pool = round2(saved + confirmed);

        var rawBuckets = [];
        if (goal.components && goal.components.length > 0) {
            for (var i = 0; i < goal.components.length; i++) {
                var c = goal.components[i];
                rawBuckets.push({ key: c.id, label: c.name, amount: c.amount, dueDate: resolveComponentEffectiveDueDate(c, goal) });
            }
        } else {
            rawBuckets.push({ key: 'goal', label: goal.title, amount: target, dueDate: goal.dueDate });
        }
        rawBuckets.sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0); });

        var poolRemaining = pool;
        var buckets = [];
        for (var j = 0; j < rawBuckets.length; j++) {
            var rb = rawBuckets[j];
            var allocated = round2(Math.max(0, Math.min(rb.amount, poolRemaining)));
            poolRemaining = round2(poolRemaining - allocated);
            var bucketRemaining = Math.max(round2(rb.amount - allocated), 0);
            var sched = deadlineSchedulerFn(bucketRemaining, rb.dueDate);
            buckets.push({
                key: rb.key, label: rb.label, amount: rb.amount, saved: allocated,
                remaining: sched.remaining, dueDate: rb.dueDate,
                isCompleted: sched.isCompleted, isOverdue: sched.isOverdue,
                eligibleDates: sched.eligibleDates, suggestedMonthly: sched.suggestedMonthly,
                perDateAmounts: sched.perDateAmounts
            });
        }

        var isCompleted = remaining <= 0;
        var isOverdue = false;
        for (var k = 0; k < buckets.length; k++) { if (buckets[k].isOverdue) { isOverdue = true; break; } }

        var mergedMap = {};
        var mergedKeys = [];
        for (var m = 0; m < buckets.length; m++) {
            var pd = buckets[m].perDateAmounts;
            for (var n = 0; n < pd.length; n++) {
                var dk = cashflowDateKey(pd[n].date);
                if (!(dk in mergedMap)) { mergedMap[dk] = { date: pd[n].date, amount: 0 }; mergedKeys.push(dk); }
                mergedMap[dk].amount = round2(mergedMap[dk].amount + pd[n].amount);
            }
        }
        mergedKeys.sort();
        var mergedPerDateAmounts = [];
        for (var p = 0; p < mergedKeys.length; p++) { mergedPerDateAmounts.push(mergedMap[mergedKeys[p]]); }

        // Kept for any caller still expecting a single "effective due date": the earliest due
        // date among buckets that STILL need money — an already-funded early component no longer
        // drives urgency, unlike the old rule this replaces.
        var effectiveDueDate = goal.dueDate;
        for (var q = 0; q < buckets.length; q++) {
            if (buckets[q].remaining > 0) { effectiveDueDate = buckets[q].dueDate; break; }
        }

        return {
            target: target,
            saved: saved,
            confirmed: confirmed,
            remaining: remaining,
            isCompleted: isCompleted,
            isOverdue: isOverdue,
            effectiveDueDate: effectiveDueDate,
            buckets: buckets,
            mergedPerDateAmounts: mergedPerDateAmounts,
            nextTransferDate: mergedPerDateAmounts.length ? mergedPerDateAmounts[0].date : null,
            nextTransferAmount: mergedPerDateAmounts.length ? mergedPerDateAmounts[0].amount : null
        };
    }

    // Milestone 4 correction (approved product decision, replaces the earlier "earliest date
    // funds the entire goal" rule): true COMPONENT-SPECIFIC deadline planning, via the shared
    // buildGoalFundingBuckets() core above with the Goals-card "next upcoming 2nd" scheduler.
    // Byte-for-byte unchanged output from before this refactor — same function name, same
    // signature, same values for every existing caller (the Goals card).
    function buildGoalScheduleInfo(goal) {
        return buildGoalFundingBuckets(goal, buildDeadlineSchedule);
    }

    // Milestone 5: reminder-specific view — same shared bucket core, "today is immediate"
    // scheduler. See buildGoalReminderInfo() further below for the reminder-facing wrapper that
    // adds the overdue-vs-today split the reminder UI actually needs.
    function buildGoalReminderScheduleInfo(goal) {
        return buildGoalFundingBuckets(goal, buildReminderDeadlineSchedule);
    }

    // Milestone 5: the reminder period is simply "which calendar month is today in," in the same
    // local-date-derived YYYY-MM shape confirmedTransfers.reminderPeriod records use — reuses
    // todayStr() (already local-date-safe, no UTC risk) rather than a new date formatter.
    function getCurrentReminderPeriod() {
        return todayStr().slice(0, 7);
    }

    // Legacy-compatible: a positive confirmedTransfers record already covers a goal for "the
    // current period" if either its own reminderPeriod matches, OR — for an older 2-field
    // {date, amount} record that predates this field — its valid local transfer date falls in
    // the same YYYY-MM. Any positive record for the period counts, per the approved rule ("any
    // positive amount, including a partial amount, counts as that goal's confirmed transfer for
    // the current reminder period") — no comparison against the suggested amount is made here.
    function isGoalHandledForPeriod(goal, period) {
        var list = goal.confirmedTransfers || [];
        for (var i = 0; i < list.length; i++) {
            var rec = list[i];
            if (!(rec.amount > 0)) { continue; }
            var recPeriod = (typeof rec.reminderPeriod === 'string' && rec.reminderPeriod) ? rec.reminderPeriod : (rec.date || '').slice(0, 7);
            if (recPeriod === period) { return true; }
        }
        return false;
    }

    // Milestone 5: builds the reminder-facing view for one goal — the overdue amount (if any) is
    // shown and summed SEPARATELY from today's regular contribution (never silently merged into
    // one undifferentiated number, and never causes a later, genuinely-on-time component to be
    // mislabeled overdue). `suggestedTotal` is the exact amount this goal's reminder row proposes
    // — always >= 0, never NaN/Infinity by construction (every input is already a round2()'d,
    // Math.max-guarded non-negative number from buildGoalFundingBuckets()/
    // buildDeadlineScheduleFromDates()).
    function buildGoalReminderInfo(goal) {
        var funding = buildGoalReminderScheduleInfo(goal);
        var today = cashflowDateOnly(new Date());
        var todayKey = cashflowDateKey(today);
        var overdueAmount = 0;
        var todayContribution = 0;
        for (var i = 0; i < funding.buckets.length; i++) {
            var b = funding.buckets[i];
            if (b.isCompleted) { continue; }
            if (b.isOverdue) {
                overdueAmount = round2(overdueAmount + b.remaining);
            } else if (b.perDateAmounts.length && cashflowDateKey(b.perDateAmounts[0].date) === todayKey) {
                todayContribution = round2(todayContribution + b.perDateAmounts[0].amount);
            }
        }
        var suggestedTotal = round2(overdueAmount + todayContribution);
        return {
            goal: goal,
            target: funding.target,
            saved: funding.saved,
            confirmed: funding.confirmed,
            remaining: funding.remaining,
            buckets: funding.buckets,
            overdueAmount: overdueAmount,
            todayContribution: todayContribution,
            suggestedTotal: suggestedTotal,
            remainingAfterSuggested: Math.max(round2(funding.remaining - suggestedTotal), 0)
        };
    }

    // Milestone 5: whether `goal` should appear in the consolidated reminder RIGHT NOW. Every
    // input is one of the explicitly-approved deterministic sources — no second persistent
    // reminder-state store: active/completed state (isArchived, suggestedTotal<=0 from a
    // fully-funded goal), the confirmed-transfer ledger (isGoalHandledForPeriod), and the
    // calculation engine's own overdue/today-due determination (suggestedTotal itself, which is
    // already 0 for a goal that isn't actually due yet — e.g. before the 2nd, or a component due
    // further out than today). A goal's OWN createdAt is not read here directly: it doesn't need
    // to be — a freshly created goal's schedule is computed exactly like any other goal's, so it
    // naturally becomes due (or not) the instant its own due date/component dates say so, with no
    // separate "is this a new goal" branch required.
    function isGoalDueForReminderNow(goal) {
        if (goal.isArchived) { return false; }
        var info = buildGoalReminderInfo(goal);
        if (info.suggestedTotal <= 0) { return false; }
        if (isGoalHandledForPeriod(goal, getCurrentReminderPeriod())) { return false; }
        return true;
    }

    // The full consolidated due-list for the reminder overlay — every active, invalid-data-free,
    // currently-due goal with its reminder info attached, goal-array order preserved (no
    // reordering invented). Returns [] immediately (no computation attempted) when the local
    // Goals dataset itself is invalid, per the explicit "must not be processed" requirement.
    function getGoalsDueForReminder() {
        if (!goalsState.valid) { return []; }
        var due = [];
        for (var i = 0; i < goals.length; i++) {
            var g = goals[i];
            if (g.isArchived) { continue; }
            var info = buildGoalReminderInfo(g);
            if (info.suggestedTotal <= 0) { continue; }
            if (isGoalHandledForPeriod(g, getCurrentReminderPeriod())) { continue; }
            due.push({ goal: g, info: info });
        }
        return due;
    }

    function loadAppSettings() {
        var defaults = getDefaultAppSettings();
        var raw = null;
        try { raw = localStorage.getItem(SETTINGS_KEY); } catch (e) { raw = null; }
        if (!raw) { return defaults; }
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return defaults; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return defaults; }

        var merged = getDefaultAppSettings();
        for (var k in merged) {
            if (k === 'notifications' || k === 'experimentalFlags') { continue; }
            if (parsed[k] !== undefined && parsed[k] !== null) { merged[k] = parsed[k]; }
        }
        if (parsed.notifications && typeof parsed.notifications === 'object') {
            for (var nk in merged.notifications) {
                if (parsed.notifications[nk] !== undefined) { merged.notifications[nk] = !!parsed.notifications[nk]; }
            }
        }
        if (parsed.experimentalFlags && typeof parsed.experimentalFlags === 'object' && !Array.isArray(parsed.experimentalFlags)) {
            merged.experimentalFlags = parsed.experimentalFlags;
        }
        return merged;
    }

    function saveAppSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); } catch (e) { console.log('שגיאה בשמירת הגדרות'); }
    }

    // Version 1.4.2: strict, all-or-nothing accessor for the projected-balance opening balance —
    // same "never partially trust" convention as normalizeGoal()/isValidGoalsArrayStrict(). A
    // malformed stored value (wrong type, NaN/Infinity, an invalid calendar date) is treated as
    // fully unconfigured, never coerced/repaired and never partially applied. This is the ONLY
    // function anywhere in this file that reads projectedBalanceOpeningAmount/
    // projectedBalanceOpeningDate — every engine/render function goes through it.
    function getProjectedBalanceOpeningConfig() {
        var amt = appSettings.projectedBalanceOpeningAmount;
        var dateStr = appSettings.projectedBalanceOpeningDate;
        if (typeof amt !== 'number' || !isFinite(amt)) { return null; }
        if (!isValidDateStr(dateStr)) { return null; }
        // Version 1.4.2 correction: defensive read of the snapshot-boundary list — malformed
        // (wrong type) or absent (legacy) falls back to `null` (blanket-conservative), never to an
        // empty array (which would mean something different — "captured, zero withdrawals existed
        // at save time"). Non-numeric/non-finite entries are dropped rather than trusted; a
        // duplicate id is harmless (only ever membership-tested via indexOf, never iterated to
        // subtract), so no dedup is needed for correctness.
        var rawIncluded = appSettings.projectedBalanceOpeningIncludedWithdrawalIds;
        var includedWithdrawalIds = null;
        if (Array.isArray(rawIncluded)) {
            includedWithdrawalIds = rawIncluded.filter(function (x) { return typeof x === 'number' && isFinite(x); });
        }
        return { amount: round2(amt), dateStr: dateStr, includedWithdrawalIds: includedWithdrawalIds };
    }

    // Single write path for the opening balance — always writes amount+date+the snapshot-boundary
    // list together, so a partially-configured state can never exist on disk. Returns false (no
    // write attempted) for structurally invalid input; callers must validate with
    // sanitizeFiniteAmount()/isValidDateStr() before calling this, same convention as
    // commitConfirmedTransfers()'s caller-validates-first contract. The included-withdrawal-ids
    // list is always rebuilt FRESH from the current `items` here (never merged with a prior list)
    // — every cash-withdrawal already dated on `dateStr` at the moment of this call is captured as
    // "already reflected in the amount just entered"; anything added afterward on the same date is
    // therefore correctly treated as new.
    function saveProjectedBalanceOpening(amount, dateStr) {
        if (typeof amount !== 'number' || !isFinite(amount)) { return false; }
        if (!isValidDateStr(dateStr)) { return false; }
        var includedIds = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type === 'cashWithdrawal' && it.start === dateStr && !it.isArchived) { includedIds.push(it.id); }
        }
        appSettings.projectedBalanceOpeningAmount = round2(amount);
        appSettings.projectedBalanceOpeningDate = dateStr;
        appSettings.projectedBalanceOpeningIncludedWithdrawalIds = includedIds;
        saveAppSettings();
        return true;
    }

    function loadActivityLog() {
        var raw = null;
        try { raw = localStorage.getItem(ACTIVITY_LOG_KEY); } catch (e) { raw = null; }
        if (!raw) { return []; }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }

    function saveActivityLog() {
        try { localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLog)); } catch (e) { console.log('שגיאה בשמירת יומן פעילות'); }
    }

    function nowTimestampStr() {
        var d = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // Append-only, capped at ACTIVITY_LOG_MAX (oldest entries dropped first — per approved
    // decision, never PIN/hash/secret values, and never a per-click technical log).
    function appendActivityLog(action, detail) {
        activityLog.push({ ts: nowTimestampStr(), action: action, detail: detail || '' });
        if (activityLog.length > ACTIVITY_LOG_MAX) {
            activityLog.splice(0, activityLog.length - ACTIVITY_LOG_MAX);
        }
        saveActivityLog();
    }

    // SHA-256 via the browser's native Web Crypto API (crypto.subtle) — no external library. A
    // fixed static prefix stands in for a per-user salt; this is explicitly a "privacy lock" per
    // the approved product decision, not real encryption, and the Settings UI says so.
    async function hashPin(pin) {
        var enc = new TextEncoder();
        var data = enc.encode('ffpro-pin-v1:' + pin);
        var hashBuffer = await crypto.subtle.digest('SHA-256', data);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    function resolveEffectiveTheme() {
        if (appSettings.theme === 'dark') { return 'dark'; }
        if (appSettings.theme === 'light') { return 'light'; }
        try {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    // Applies theme/primary-color (via <html data-theme>/<html data-color>, read by the CSS
    // palette rules near :root) and font-size (via body.style.zoom — the file's CSS uses fixed px
    // sizes throughout rather than rem, so zoom is the one mechanism that reliably scales
    // everything, including the fixed-position bottom-nav/FAB, uniformly).
    function applySettingsToDom() {
        document.documentElement.setAttribute('data-theme', resolveEffectiveTheme());
        document.documentElement.setAttribute('data-color', appSettings.primaryColor || 'green');
        document.body.style.zoom = FONT_SIZE_ZOOM[appSettings.fontSize] || 1;
    }

    var items = loadPreviewItems();
    var categoryConfig = loadPreviewCategoryConfig();
    var appSettings = loadAppSettings();
    var activityLog = loadActivityLog();
    // Milestone 4: loaded early alongside items/categoryConfig/activityLog, same reasoning as the
    // comment below about CATEGORY_TILE_ORDER_KEY — declared before any render call reads it.
    // Milestone 4 correction: goalsState.valid gates the entire Goals screen (integrity-warning
    // branch) and every mutation (saveGoals()'s guard) — `goals` is [] in memory whenever invalid,
    // but is NEVER treated as real data or written back in that case; see loadGoalsState().
    var goalsState = loadGoalsState();
    var goals = goalsState.goals;
    var lastAutoArchivedTitles = [];
    var appBackgroundedAt = null;
    var settingsPinFormMode = null;
    // Version 1.4.2: opening-balance Settings form state. pendingReplace holds a validated,
    // not-yet-confirmed {amount, dateStr} while the "this will change every projected balance"
    // warning is shown — cleared (never written) by cancelOpeningBalanceForm(), the single close
    // function Back/Escape/Cancel and a successful save all funnel through.
    var settingsOpeningBalanceFormOpen = false;
    var settingsOpeningBalancePendingReplace = null;
    // Home balance-card correction: which mount point currently owns the (single, shared) open
    // form — 'settingsTopic' (Settings > topic) or 'home' (the hero card's own inline toggle).
    // null when closed. Lets buildOpeningBalanceSectionHtml() (Settings) and
    // renderHomeScreenFromRealData() (Home) each render the form ONLY at its own opened-from
    // location, so the two mount points can never both hold a live copy — and therefore never
    // collide on the shared input ids (opening-balance-amount-input/opening-balance-date-input) —
    // at the same time.
    var openingBalanceFormOpenedFrom = null;
    var pendingRestoreBackup = null;
    var resetConfirmMode = false;
    var restorePasteMode = false;

    applySettingsToDom();

    (function () {
        if (!window.matchMedia) { return; }
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var handler = function () { if (appSettings.theme === 'system') { applySettingsToDom(); } };
        if (mq.addEventListener) { mq.addEventListener('change', handler); }
        else if (mq.addListener) { mq.addListener(handler); }
    })();

    // Version 1.1, Stage 4.0.2.2: runs exactly once per page load, right after `items`/
    // `categoryConfig` are available and before any screen renders for the first time — so an
    // item this sweep archives is already reflected (lists, sums, Home tiles) in that very first
    // render, with no separate "flash of stale state" re-render needed. runAutoArchiveSweep()
    // itself is a strict no-op (no write, no re-render trigger) when nothing qualifies, so a
    // normal load with nothing to archive has zero extra cost beyond the one read-only scan.
    var autoArchivedCount = runAutoArchiveSweep(items);
    if (autoArchivedCount > 0) {
        showAutoArchiveToast(autoArchivedCount);
    }

    // Stage G.4: tracks which item's row (Transactions screen only) is currently showing the
    // inline edit form in place of its normal row markup. null means no row is being edited.
    // Mirrors index.html's own `editingId` module-level variable, just scoped to Preview v2's
    // separate `items` array.
    var previewEditingId = null;

    // Stage G.5: tracks the add-transaction form currently open (if any) at the top of the
    // Transactions screen. null = closed. 'income'/'loan'/'fixed'/'variable'/'dated'/
    // 'cashWithdrawal' = that type's full form is open. previewAddCategoryKey holds the
    // categoryConfig key the new item will be saved under (displayCategory) — only meaningful for
    // the types that have one (cashWithdrawal deliberately never does). Both are visual-only
    // state, mirroring previewEditingId: never persisted, always reset to null on page load.
    var previewAddMode = null;
    var previewAddCategoryKey = null;

    // Milestone 4: Goals screen UI-only state — never persisted, always reset to defaults on page
    // load, same convention as previewEditingId/previewAddMode above.
    var goalsExpandedId = null;          // id of the one inline-expanded goal card, or null
    var goalsShowArchived = false;       // active/archived list toggle (mirrors setTxFilter's two states)
    var goalCreateFormOpen = false;      // new-goal form open at the top of the Goals screen
    var goalEditingId = null;            // id of the goal currently showing its inline edit form
    var goalComponentFormFor = null;     // goal id whose add/edit-component form is open, or null
    var goalComponentEditingId = null;   // component id being edited (null = the open form is "add new")
    var goalArchiveConfirmId = null;     // goal id showing the inline "archive this goal?" confirm
    var goalRemoveComponentConfirm = null; // {goalId, componentId} showing the inline remove-component confirm
    var goalsIntegrityResetConfirm = false; // showing the "reset corrupted goals data?" destructive confirm

    // Milestone 5: Goals reminder overlay state — ALL of this is transient, session-only, in-
    // memory UI state, exactly like the vars above. None of it is ever written to localStorage or
    // included in a backup; "remind later"/postponement in particular MUST NOT be persisted per
    // the approved spec, which this satisfies simply by being a plain `var` that resets on every
    // fresh page load, the same way every other transient flag in this file already does.
    //
    // Per-goal/per-period suppression (audit correction — replaces a single global dismissal
    // flag, which incorrectly blocked an unrelated goal's reminder for the rest of the session):
    // keyed by "<reminderPeriod>::<goalId>", so postponing/confirming the goals CURRENTLY SHOWN in
    // one opening of the dialog never prevents a different goal — created before or after that
    // moment — from opening its own reminder later in the same session. See
    // suppressReminderDueList() below, the one place tokens are ever added. Ordinary navigation
    // never reopens an already-suppressed goal either (checkAndShowGoalsReminder() only ever fires
    // at page load and right after creating a goal, never on plain screen changes); a fresh reload
    // clears this object entirely, exactly like the flag it replaces did.
    var reminderSuppressedTokens = {};
    var reminderOpen = false;
    var reminderMode = 'summary'; // 'summary' | 'custom'
    var reminderDueList = [];     // snapshot captured at open time: [{goal, info}, ...]
    var reminderCustomAmounts = {}; // goalId -> raw string currently in that row's input
    var reminderWriteInProgress = false;
    var reminderPreviouslyFocusedEl = null;
    var reminderErrorMessage = null;

    // Version 1.1, Stage 1: which category key (if any) the Transactions screen is currently
    // filtered to, set only via clicking a Home category tile (filterTransactionsByCategory()) and
    // cleared via the filter chip's ✕ (clearCategoryFilter()) or automatically if the category is
    // deleted (see renderTransactionsScreenFromRealData()). null = no category filter (all items).
    // Independent of, and combined with, the existing active/archived filter — never persisted.
    var currentCategoryFilterKey = null;

    // Version 1.1, Stage 1: declared here — BEFORE the initial renderHomeScreenFromRealData() call
    // further down — rather than next to the reconcile/render functions that use them below.
    // `var x = ...` only assigns its initial value when execution actually reaches that line; a
    // `var` statement placed textually after the first call that reads/writes these would silently
    // clobber the value that call had already computed, back to this initializer, the moment
    // execution reached it. Kept together with the other early state above for the same reason.
    var CATEGORY_TILE_ORDER_KEY = 'family_finance_category_tile_order';
    var categoryTileOrder = [];
    var categoryTileTotalsCache = {};

    // Version 1.1, Stage 3.5: the two new computed "stat" tiles (יתרת תשלומים שונים / יתרת
    // הלוואות) reuse the same cache-once-per-full-render convention as categoryTileTotalsCache
    // above — recomputed only in renderCategoryTilesFromRealData(), then read as-is by
    // renderCategoryTileGridHtml() on every lightweight drag re-render (renderCategoryTileGridOnly),
    // so dragging a real category tile never re-triggers these calculations. Declared here (before
    // any render call) for the same var-hoisting reason as CATEGORY_TILE_ORDER_KEY above.
    var categoryTileVariableRemainingCache = 0;
    var categoryTileLoanBalanceCache = { principal: 0, total: 0 };

    // Version 1.1, Stage 3.5: which value the "יתרת הלוואות" stat tile's small toggle currently
    // shows — 'principal' (קרן בלבד) or 'total' (קרן + ריבית, the full remaining amount). Its own
    // new localStorage key, independent of DATA_KEY/CONFIG_KEY/CATEGORY_TILE_ORDER_KEY, per the
    // task's explicit "מפתח חדש עבור מצב המתג" allowance. Declared/loaded here (before the first
    // Home render) for the same reason as categoryTileOrder above.
    var LOAN_BALANCE_VIEW_KEY = 'family_finance_loan_balance_view';
    var loanBalanceView = loadLoanBalanceView();
    // Version 1.1, Stage 3.5: strips a leading emoji (+ its trailing space) from a category's
    // stored label for Home-tile display ONLY — categoryConfig[key].label itself (used everywhere
    // else: Settings, the category page, add-transaction forms) is never touched or persisted
    // differently. Every built-in/custom label in this app is built as "emoji + space + name"
    // (DEFAULT_CATEGORY_CONFIG_JSON, addPreviewCategory()'s pickEmojiForCategory()), so a leading
    // run of pictographic/ZWJ/variation-selector characters is always exactly the prefix to drop.
    var HOME_TILE_LEADING_EMOJI_RE = /^[\p{Extended_Pictographic}\u200D\uFE0F]+\s*/u;

    // Version 1.1, Stage 3.5: presentation-only Home-tile label overrides for the two built-in
    // categories whose dashboard wording changed ("יורד החודש – ...") — categoryConfig itself keeps
    // its normal label (Settings/category page/forms are unaffected). Every other category
    // (including 'fixed' and any custom category) just shows its normal label, emoji stripped.
    var HOME_TILE_LABEL_OVERRIDE_BY_KEY = {
        variable: 'יורד החודש – תשלומים שונים',
        loan: 'יורד החודש – הלוואות'
    };

    // =====================================================================================
    // ===== Stage 3ב.1/3ב.2: category management state. Declared here (with items/          =====
    // ===== categoryConfig above and previewEditingId/previewAddMode) rather than down next  =====
    // ===== to the Stage 3ב.1 logic functions themselves, because renderSettingsScreenFromReal=====
    // ===== Data() is invoked once during the page's initial synchronous load (below) and, as =====
    // ===== of Stage 3ב.2, reads these values — they must already be assigned by then. Plain  =====
    // ===== `var` initializers are NOT hoisted the way `function` declarations are, so this   =====
    // ===== block cannot stay below its point of first use the way the pure Stage 3ב.1 logic  =====
    // ===== functions (translateBaseType, addPreviewCategory, deletePreviewCategory, etc.,    =====
    // ===== still appended near the end of the file) safely can.                              =====
    // =====================================================================================

    // The 4 keys index.html itself treats as permanent (initCategoryInputs() there renders a
    // rename input for each of them but never a delete button — the same set this file's own
    // Stage E.1 loop already iterates over via Object.keys(categoryConfig), just named here so
    // the deletion guard below has something explicit to check against instead of re-deriving
    // the set ad hoc.
    var PREVIEW_BUILTIN_CATEGORY_KEYS = ['income', 'fixed', 'variable', 'loan'];

    // Copied verbatim (value/label text) from index.html's own #new-cat-type <option> list.
    // 'loan' is deliberately absent, matching index.html: a new custom category can never be
    // typed as 'loan' there.
    var PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS = [
        { value: 'fixed', label: 'הוצאה קבועה (סכום קבוע חודשי/שנתי)' },
        // Version 1.4.2: clarified — was 'תשלומים שונים (עסקאות עם תשלומים ותאריך סיום)', easy to
        // misread as an ordinary tracked expense. Same baseType/behavior, label only.
        { value: 'variable', label: 'עסקה בתשלומים — מעקב יתרה בלבד (אינו מופחת שוב בתחזית)' },
        { value: 'income', label: 'הכנסה (מוסיף לתזרים הפנוי)' },
        { value: 'dated', label: 'חיוב חד-פעמי (תאריך וסכום בלבד, למשל כרטיס אשראי)' }
    ];

    // Reason codes returned by deletePreviewCategory() when it refuses to delete — a return value
    // rather than an alert() baked into the logic itself, so the Settings screen can render the
    // "הודעה ברורה" (clear message) the approved product decision calls for as in-UI text.
    var PREVIEW_CATEGORY_DELETE_BLOCKED_REASON = {
        BUILT_IN: 'built-in',
        HAS_ITEMS: 'has-items'
    };

    // Which category key (if any) is currently showing a rename form in the Settings screen,
    // mirroring previewEditingId's role for the Transactions screen (Stage G.4).
    var previewEditingCategoryKey = null;

    // Stage 3ב.2 UI-only state (visual only, never persisted, always resets to its default on
    // page load) — mirrors previewAddMode/previewEditingId's role for the Transactions screen.
    // previewCategoryAddOpen: whether the "add category" inline form is currently shown.
    // previewDeletingCategoryKey: which category key (if any) is showing an inline delete
    // confirmation ("מחיקה" → "אישור מחיקה"/"ביטול"), used instead of a native confirm() per the
    // approved 3ב.2 UI rules.
    var previewCategoryAddOpen = false;
    var previewDeletingCategoryKey = null;

    // Enforces "only one category form open at a time" (rename OR add OR delete-confirmation, not
    // several at once) — same convention already applied between previewAddMode/previewEditingId
    // on the Transactions screen. Called at the start of every "open a form" action below.
    function resetPreviewCategoryFormsState() {
        previewEditingCategoryKey = null;
        previewCategoryAddOpen = false;
        previewDeletingCategoryKey = null;
    }

    // =====================================================================================
    // ===== Stage D.4 (revised, option ג׳): orchestration only — connects buildNarrative()  =====
    // ===== to the REAL Preview items/categoryConfig loaded above (Stage D.2), with a       =====
    // ===== single call. buildNarrative() itself already calls each of the 6 real Stage D.3 =====
    // ===== functions internally exactly once — this function does NOT call them separately =====
    // ===== beforehand, to avoid computing every value twice. Defined here (after            =====
    // ===== items/categoryConfig are assigned) for readability; not called automatically     =====
    // ===== anywhere in this file — no UI, no DOM, no renderMockUI wiring, no localStorage   =====
    // ===== access of its own. buildNarrative() itself is untouched.                         =====
    // =====================================================================================

    function buildPreviewNarrativeData() {
        return { narrative: buildNarrative(items, categoryConfig) };
    }

    // =====================================================================================
    // ===== Stage D.5: Home screen only — replaces its Mock-fed elements with real data    =====
    // ===== from items/categoryConfig via getMonthSnapshot()/getRecentActivity()/           =====
    // ===== buildPreviewNarrativeData(). Reads only items/categoryConfig (already loaded     =====
    // ===== above) — never localStorage directly, never MOCK_DATA/mockItems/mockCategoryConfig=====
    // ===== /mockSnapshot. Touches ONLY: hero-amount, hero-narrative, snapshot-income,        =====
    // ===== snapshot-expenses, snapshot-balance, recent-activity-list. Does NOT touch          =====
    // ===== hero-status, attention-list, transactions-list, insights-feed, or category-list —  =====
    // ===== see the Stage D.5 report for why each of those stays Mock for now.                =====
    // =====================================================================================

    // Originally mirrored index.html's own '#net-balance' convention exactly ('₪' + rounded,
    // locale-formatted number). Stage F.1 follow-up fix: for a negative n, that produced the sign
    // as part of the locale-formatted number AFTER the already-prepended '₪' (e.g. "₪-13,050")
    // — visually wrong regardless of bidi ("-13,050₪" once rendered in the surrounding RTL page).
    // Now explicitly puts a leading '-' before '₪' for negative values (magnitude via Math.abs,
    // same numeric value — display-only change, no calculation touched). Positive values are
    // byte-identical to before.
    function formatHomeCurrency(n) {
        var rounded = Math.round(n);
        return (rounded < 0 ? '-₪' : '₪') + Math.abs(rounded).toLocaleString();
    }

    // Presentational icon-per-type lookup only (no business meaning). Reuses the exact emoji
    // already established elsewhere in this file for the same base types (DEFAULT_CATEGORY_CONFIG_JSON,
    // MOCK_DATA.categories) — 'dated' has no built-in category in the real app, so it gets the
    // same 📅 already used for a dated-like entry in Stage B's MOCK_DATA.recentActivity.
    var HOME_ITEM_ICON_BY_TYPE = { income: '💰', fixed: '🏡', variable: '🛒', loan: '🏦', dated: '📅', cashWithdrawal: '🏧' };

    // Adapts one real item[] entry into the exact {icon,title,date,amount,type} shape that the
    // existing renderTxList()/tx-row markup already expects (unchanged since Stage B) — no HTML,
    // CSS, or structure changes; only the data going in is real instead of Mock.
    function mapItemToHomeTxRow(item) {
        var icon = HOME_ITEM_ICON_BY_TYPE[item.type] || '💳';
        var title = item.title || '';
        // Missing-date convention copied from index.html itself (e.g. renderAll()'s dated/loan/
        // variable cards: `item.start ? new Date(item.start).toLocaleDateString('he-IL') : '-'`).
        // Stage E.2 fix: index.html's own convention assumes `item.start`, when present, is
        // always a valid date string (it's only ever written by the app's own <input type="date">
        // fields) — a guarantee real Preview data upholds too. This function additionally guards
        // against a non-date-parseable `start` (missing entirely, empty string, or a genuinely
        // invalid value) so it never surfaces JS's raw "Invalid Date" text — falls back to the
        // same '-' used for the missing-date case instead.
        var startDate = item.start ? new Date(item.start) : null;
        var date = (startDate && !isNaN(startDate.getTime())) ? startDate.toLocaleDateString('he-IL') : '-';
        var amountNum = (typeof item.amount === 'number' && !isNaN(item.amount)) ? item.amount : 0;
        // Same sign/prefix convention Stage B's MOCK_DATA already used: income shown plain,
        // every other type shown with a leading "-" to read as an outflow.
        var amount = (item.type === 'income') ? formatHomeCurrency(amountNum) : ('-' + formatHomeCurrency(amountNum));
        var cssType = (item.type === 'income') ? 'income' : 'expense';
        // Stage G.2.1: two additive fields only — id/isArchived pass the source item's identity
        // and archive state through, so a future Transactions-only row-menu (Stage G.2.4+) can
        // know which item and which action label to wire up. The 5 fields above are unchanged
        // (same values, same computation) — Home's renderTxList()/recent-activity-list simply
        // ignores these 2 extra fields, exactly as it already ignores any object properties it
        // doesn't read today.
        //
        // Installment-card (Loans + Variable/"תשלומים שונים") collapsed-row summary: both fields
        // are null together for every other item type (and for a loan/variable item missing a
        // usable `total`) — renderTxListWithActions() only renders them when truthy, and
        // renderTxList() (Home) ignores them entirely, same convention as id/isArchived above.
        // Reuses parseDatesAndGetLeft() (payments left) plus getLoanRemainingBalance()/
        // getVariableItemRemainingBalance() (remaining balance, per type's own existing formula —
        // variable stays tracking-only, no cash-flow behavior touched) — no new financial
        // calculation. Kept as two separate short strings (rather than one combined string) so the
        // row can wrap them onto their own line on a narrow screen without ever truncating either
        // value.
        var installmentProgress = null;
        var installmentBalance = null;
        if (item.type === 'loan' || item.type === 'variable') {
            var instTotalN = parseInt(item.total, 10);
            if (instTotalN && instTotalN > 0) {
                var instDay = (item.type === 'loan') ? item.day : resolveEffectiveDay(item);
                var instDt = parseDatesAndGetLeft(item.start, item.total, instDay);
                var instPaid = instTotalN - instDt.left;
                if (instPaid < 0) { instPaid = 0; }
                if (instPaid > instTotalN) { instPaid = instTotalN; }
                var instBalanceTotal = (item.type === 'loan') ?
                    getLoanRemainingBalance(item).total : getVariableItemRemainingBalance(item).total;
                installmentProgress = 'תשלום ' + instPaid + '/' + instTotalN;
                installmentBalance = 'יתרה ' + formatHomeCurrency(instBalanceTotal);
            }
        }
        // Version 1.4.6: the note is surfaced only for the built-in credit-card settlement category
        // — every other item type/category returns '' here, so renderTxList()/renderTxListWithActions()
        // (both conditional on this being truthy) render byte-identically to before for them.
        var settlementNote = isBuiltinCreditCardSettlement(item) ? (item.notes || '') : '';
        return { icon: icon, title: title, date: date, amount: amount, type: cssType, id: item.id, isArchived: !!item.isArchived, installmentProgress: installmentProgress, installmentBalance: installmentBalance, settlementNote: settlementNote };
    }

    // Version 1.4.2: Home's hero shows the projected daily BALANCE (getProjectedBalanceToday(),
    // itself built on buildProjectedBalanceSeries() — the same authoritative engine the Forecast
    // screen uses), not a movement/net figure — see Version 1.4.2 documentation in
    // CURRENT_STATUS.md for why this replaces the Version 1.4.1 "today's planned net cashflow"
    // hero. hero-status (previously an untouched status pill) is reused for the required
    // supporting line; hero-action-area is populated only in the unconfigured state.
    function renderHomeScreenFromRealData() {
        var heroLabelEl = document.querySelector('#screen-home .hero-label');
        var heroAmountEl = document.getElementById('hero-amount');
        var heroStatusEl = document.getElementById('hero-status');
        var heroActionEl = document.getElementById('hero-action-area');
        if (heroLabelEl) { heroLabelEl.textContent = 'יתרה צפויה להיום'; }
        if (heroAmountEl) { heroAmountEl.classList.remove('positive-amount', 'negative-amount', 'neutral-amount'); }
        if (heroActionEl) { heroActionEl.innerHTML = ''; }

        var projected = getProjectedBalanceToday();
        if (!projected.configured) {
            if (heroAmountEl) { heroAmountEl.textContent = 'לא הוגדרה'; heroAmountEl.classList.add('neutral-amount'); }
            if (heroStatusEl) { heroStatusEl.textContent = 'כדי לחשב יתרה יומית יש להגדיר יתרת התחלה פעם אחת.'; }
            if (heroActionEl) { heroActionEl.innerHTML = '<button type="button" class="cat-add-toggle" onclick="handleHeroBalanceClick()">הגדר יתרת התחלה</button>'; }
        } else if (projected.state === 'future') {
            var futureDateLabel = parseLocalDateStr(projected.openingDateStr).toLocaleDateString('he-IL');
            if (heroAmountEl) { heroAmountEl.textContent = '—'; heroAmountEl.classList.add('neutral-amount'); }
            if (heroStatusEl) { heroStatusEl.textContent = 'החישוב יתחיל בתאריך ' + futureDateLabel + '.'; }
        } else {
            var bal = projected.projectedBalance;
            if (heroAmountEl) {
                heroAmountEl.textContent = formatHomeCurrency(bal);
                heroAmountEl.classList.add(bal > 0 ? 'positive-amount' : (bal < 0 ? 'negative-amount' : 'neutral-amount'));
            }
            if (heroStatusEl) { heroStatusEl.textContent = 'מחושב לפי יתרת ההתחלה והתנועות המתוכננות עד היום — אינה יתרת בנק מאומתת.'; }
        }

        // Home balance-card correction: tapping the (now clickable) hero card opens the same
        // shared opening-balance form/confirmation right here, overriding whichever CTA/nothing
        // the block above just set — reuses buildOpeningBalanceFormFieldsHtml()/
        // buildOpeningBalancePendingReplaceHtml() verbatim (the exact same markup Settings' own
        // detail screen renders), never a second editor. Only rendered when this form was opened
        // FROM Home (openingBalanceFormOpenedFrom==='home') — if it happens to be open from
        // Settings instead, Home stays exactly as the block above already rendered it.
        if (heroActionEl && settingsOpeningBalanceFormOpen && openingBalanceFormOpenedFrom === 'home') {
            heroActionEl.innerHTML = settingsOpeningBalancePendingReplace ? buildOpeningBalancePendingReplaceHtml() : buildOpeningBalanceFormFieldsHtml();
        }

        // snapshot-income/snapshot-expenses stay the existing monthly-total tiles (getMonthSnapshot)
        // — unrelated to the hero above and out of this hotfix's scope; only the hero itself was
        // the "misleading" value this correction targets.
        var snapshot = getMonthSnapshot(items);
        document.getElementById('snapshot-income').textContent = formatHomeCurrency(snapshot.income);
        document.getElementById('snapshot-expenses').textContent = formatHomeCurrency(snapshot.expenses);

        // Same row count the existing (Mock) Home design showed (4).
        var recent = getRecentActivity(items, 4).map(mapItemToHomeTxRow);
        renderTxList('recent-activity-list', recent);

        // Version 1.1, Stage 1: automatic per-category tiles, below income/expenses.
        renderCategoryTilesFromRealData();

        // Version 1.1, Stage 4.0.3: in-app notifications only (no OS push) — see
        // computeHomeNotifications().
        renderHomeNotificationsFromRealData();

        // ATM withdrawals: saved list (this month) + inline quick-add rows, after Recent activity.
        renderHomeAtmSavedList();
        renderHomeAtmWithdrawalRows();
    }

    // =====================================================================================
    // ===== ATM withdrawals — inline quick-add rows on Home, after "פעילות אחרונה". Each row =====
    // ===== is ephemeral, UI-only draft state (never persisted itself) until its own "💾" is    =====
    // ===== pressed, at which point it becomes a REAL item via the exact same data shape,       =====
    // ===== generateCashWithdrawalId(), savePreviewItems(), and cash-flow event branch the      =====
    // ===== Transactions-screen cash-withdrawal add form already uses (addPreviewItem()'s        =====
    // ===== 'cashWithdrawal' branch) — no second persistence/ID/forecast path. Always keeps at   =====
    // ===== least one row so there is always something to fill in; "+" adds another independent =====
    // ===== row, "✕" discards one without saving.                                               =====
    // =====================================================================================

    var homeAtmRows = [];
    var homeAtmNextLocalId = 1;

    function ensureHomeAtmRows() {
        if (homeAtmRows.length === 0) {
            homeAtmRows.push({ localId: homeAtmNextLocalId++, amount: '', date: todayStr(), notes: '' });
        }
    }

    // Uncontrolled inputs (plain HTML, not synced to homeAtmRows on every keystroke) — reads
    // whatever is CURRENTLY in the DOM for every still-rendered row back into homeAtmRows before
    // any add/delete/save re-render, so a row the user is mid-typing in never loses its text just
    // because a DIFFERENT row was added, deleted, or saved. Matched by localId; a row not found in
    // the DOM (shouldn't happen — every row in the array is always rendered) is left as-is.
    function syncHomeAtmRowsFromDom() {
        for (var i = 0; i < homeAtmRows.length; i++) {
            var row = homeAtmRows[i];
            var amountEl = document.getElementById('home-atm-amount-' + row.localId);
            var dateEl = document.getElementById('home-atm-date-' + row.localId);
            var notesEl = document.getElementById('home-atm-notes-' + row.localId);
            if (amountEl) { row.amount = amountEl.value; }
            if (dateEl) { row.date = dateEl.value; }
            if (notesEl) { row.notes = notesEl.value; }
        }
    }

    function renderHomeAtmWithdrawalRows() {
        var container = document.getElementById('home-atm-rows');
        if (!container) { return; }
        ensureHomeAtmRows();
        var html = '';
        for (var i = 0; i < homeAtmRows.length; i++) {
            var row = homeAtmRows[i];
            html += '<div class="home-atm-row">' +
                '<button type="button" class="home-atm-add-btn" onclick="addHomeAtmRow()" aria-label="הוסף שורת משיכה">+</button>' +
                '<input type="number" step="0.01" min="0" class="home-atm-amount-input" id="home-atm-amount-' + row.localId + '" placeholder="סכום" value="' + escapeHtml(row.amount) + '">' +
                '<input type="date" class="home-atm-date-input" id="home-atm-date-' + row.localId + '" value="' + escapeHtml(row.date) + '">' +
                '<input type="text" class="home-atm-notes-input" id="home-atm-notes-' + row.localId + '" placeholder="הערה (אופציונלי)" value="' + escapeHtml(row.notes) + '">' +
                '<button type="button" class="home-atm-save-btn" onclick="saveHomeAtmRow(' + row.localId + ')" aria-label="שמור משיכה">💾</button>' +
                '<button type="button" class="home-atm-delete-btn" onclick="deleteHomeAtmRow(' + row.localId + ')" aria-label="מחק שורה">✕</button>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    function addHomeAtmRow() {
        syncHomeAtmRowsFromDom();
        homeAtmRows.push({ localId: homeAtmNextLocalId++, amount: '', date: todayStr(), notes: '' });
        renderHomeAtmWithdrawalRows();
    }

    function deleteHomeAtmRow(localId) {
        syncHomeAtmRowsFromDom();
        var idx = homeAtmRows.findIndex(function (r) { return r.localId === localId; });
        if (idx === -1) { return; }
        homeAtmRows.splice(idx, 1);
        renderHomeAtmWithdrawalRows();
    }

    // Validates and saves ONE row as a real cashWithdrawal item — same amount/date validation and
    // same "not before the opening balance date" guard as addPreviewItem()'s 'cashWithdrawal'
    // branch, so this second entry point can never create data the first one would have rejected.
    // The `idx === -1` guard at the top is this round's duplicate-submit protection: a row is
    // spliced out of homeAtmRows synchronously the instant it saves successfully, so a second,
    // near-simultaneous click on the same (by-then-stale) save button finds nothing left to save
    // and is a strict no-op — it can never create a second item from one click.
    function saveHomeAtmRow(localId) {
        syncHomeAtmRowsFromDom();
        var idx = homeAtmRows.findIndex(function (r) { return r.localId === localId; });
        if (idx === -1) { return; }
        var row = homeAtmRows[idx];

        var amount = sanitizePositiveAmount(row.amount);
        var dateStr = row.date;
        if (amount === null) { alert('נא להזין סכום תקין (גדול מאפס)'); return; }
        if (!isValidDateStr(dateStr)) { alert('נא להזין תאריך תקין'); return; }
        var opening = getProjectedBalanceOpeningConfig();
        if (opening && cashflowDateOnly(parseLocalDateStr(dateStr)) < cashflowDateOnly(parseLocalDateStr(opening.dateStr))) {
            alert('לא ניתן להזין משיכת מזומן בתאריך שלפני יתרת ההתחלה (' + opening.dateStr + ').');
            return;
        }

        items.push({
            id: generateCashWithdrawalId(),
            type: 'cashWithdrawal',
            title: 'משיכת מזומן',
            amount: amount,
            start: dateStr,
            notes: (row.notes || '').trim(),
            isArchived: false
        });
        savePreviewItems();

        homeAtmRows.splice(idx, 1);
        renderAllPreviewScreens();
    }

    // ===== Saved ATM withdrawals — lists real, already-saved cashWithdrawal items dated in the =====
    // ===== CURRENT calendar month, directly above the draft add-rows. Editing/deleting here     =====
    // ===== reuses the exact same items/savePreviewItems()/deletePreviewItem() as everywhere      =====
    // ===== else in the app — no second data path, no second forecast calculation.                =====

    var homeAtmEditingId = null;

    function getHomeAtmSavedWithdrawalsThisMonth() {
        var now = new Date();
        var y = now.getFullYear(), m = now.getMonth();
        var matches = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type !== 'cashWithdrawal' || it.isArchived || !it.start) { continue; }
            var d = parseLocalDateStr(it.start);
            if (d && d.getFullYear() === y && d.getMonth() === m) { matches.push(it); }
        }
        matches.sort(function (a, b) { return parseLocalDateStr(a.start) - parseLocalDateStr(b.start); });
        return matches;
    }

    function renderHomeAtmSavedList() {
        var container = document.getElementById('home-atm-saved-list');
        if (!container) { return; }
        var saved = getHomeAtmSavedWithdrawalsThisMonth();
        var html = '';
        for (var i = 0; i < saved.length; i++) {
            var wd = saved[i];
            if (homeAtmEditingId === wd.id) {
                html += '<div class="home-atm-saved-row home-atm-saved-row-editing">' +
                    '<div class="tx-edit-group"><label>סכום</label><input type="number" step="0.01" min="0" id="home-atm-edit-amount-' + wd.id + '" value="' + wd.amount + '"></div>' +
                    '<div class="tx-edit-group"><label>תאריך</label><input type="date" id="home-atm-edit-date-' + wd.id + '" value="' + escapeHtml(wd.start || '') + '"></div>' +
                    '<div class="tx-edit-group"><label>הערה</label><input type="text" id="home-atm-edit-notes-' + wd.id + '" value="' + escapeHtml(wd.notes || '') + '"></div>' +
                    '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="saveHomeAtmEdit(' + wd.id + ')">💾 שמור</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="cancelHomeAtmEdit()">ביטול</button>' +
                    '</div></div>';
            } else {
                html += '<div class="home-atm-saved-row">' +
                    '<div class="home-atm-saved-amount">' + escapeHtml(formatHomeCurrency(wd.amount)) + '</div>' +
                    '<div class="home-atm-saved-date">' + escapeHtml(wd.start || '') + '</div>' +
                    '<div class="home-atm-saved-notes">' + escapeHtml(wd.notes || '') + '</div>' +
                    '<button type="button" class="home-atm-edit-btn" onclick="startHomeAtmEdit(' + wd.id + ')" aria-label="ערוך משיכה">✏️</button>' +
                    '<button type="button" class="home-atm-delete-btn" onclick="deleteHomeAtmWithdrawal(' + wd.id + ')" aria-label="מחק משיכה">🗑️</button>' +
                    '</div>';
            }
        }
        container.innerHTML = html;
    }

    function startHomeAtmEdit(id) {
        homeAtmEditingId = id;
        renderHomeAtmSavedList();
    }

    function cancelHomeAtmEdit() {
        homeAtmEditingId = null;
        renderHomeAtmSavedList();
    }

    // Same validation rules as addPreviewItem()'s/savePreviewInlineEdit()'s 'cashWithdrawal'
    // branches (positive amount, valid date, not before the opening-balance date) — kept as its
    // own small copy (matching this file's existing convention of one validation copy per entry
    // point) rather than calling savePreviewInlineEdit() directly, so homeAtmEditingId is only
    // ever cleared on a CONFIRMED success — a failed validation leaves the row open exactly as the
    // user left it, same as every other inline edit in this file.
    function saveHomeAtmEdit(id) {
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) { homeAtmEditingId = null; renderHomeAtmSavedList(); return; }
        var item = items[idx];

        var amount = sanitizePositiveAmount(document.getElementById('home-atm-edit-amount-' + id).value);
        var dateStr = document.getElementById('home-atm-edit-date-' + id).value;
        var notes = document.getElementById('home-atm-edit-notes-' + id).value;
        if (amount === null) { alert('נא להזין סכום תקין (גדול מאפס)'); return; }
        if (!isValidDateStr(dateStr)) { alert('נא להזין תאריך תקין'); return; }
        var opening = getProjectedBalanceOpeningConfig();
        if (opening && cashflowDateOnly(parseLocalDateStr(dateStr)) < cashflowDateOnly(parseLocalDateStr(opening.dateStr))) {
            alert('לא ניתן להזין משיכת מזומן בתאריך שלפני יתרת ההתחלה (' + opening.dateStr + ').');
            return;
        }

        item.amount = amount;
        item.start = dateStr;
        item.notes = notes.trim();
        savePreviewItems();
        homeAtmEditingId = null;
        renderAllPreviewScreens();
    }

    // Native confirm() — the same destructive-action convention already used by
    // handleDeleteMenuAction() elsewhere in this file — before permanently removing a saved
    // withdrawal via the existing deletePreviewItem() (same delete path every other item type
    // already uses; no second removal/forecast logic).
    function deleteHomeAtmWithdrawal(id) {
        if (!confirm('למחוק את המשיכה הזו לצמיתות? לא ניתן לשחזר לאחר מכן.')) { return; }
        if (homeAtmEditingId === id) { homeAtmEditingId = null; }
        deletePreviewItem(id);
    }

    // Called once, after items/categoryConfig (and everything Stage D.3/D.4 depend on) are
    // already loaded — this is the only ordering guarantee needed; see the Stage D.5 report for
    // why renderMockUI()'s own (earlier, unmoved) call site is not a problem in practice.
    renderHomeScreenFromRealData();

    // =====================================================================================
    // ===== Stage E.3: Home screen only — replaces attention-list's Mock-fed rows with the  =====
    // ===== two already-built, already-tested real functions from Stage D.6                 =====
    // ===== (getBiggestUpcomingCharge, getForecastWarning) — no new business logic invented. =====
    // ===== Explicit scoping decision (approved before this stage was written): the Mock      =====
    // ===== showed 3 items with day-level "בעוד X ימים" phrasing, but no such function exists =====
    // ===== anywhere (in index.html or in this file) — building one would require inventing   =====
    // ===== an undefined time window and item cap. Per the approved decision, this stage      =====
    // ===== deliberately stays to the 0–2 cards these two existing functions already produce;  =====
    // ===== broader "upcoming charges" logic is explicitly deferred to a future stage.         =====
    // =====================================================================================

    // =====================================================================================
    // ===== Version 1.3, Phase 2C: UI-only helpers for the cash-flow Insights block. Every    =====
    // ===== number these read comes from ONE buildCashflowSummary() call — no financial        =====
    // ===== calculation is duplicated here, only formatting/display and a pure display-only    =====
    // ===== scan over its already-computed months[] (findFirstNegativeCashflowMonth), which     =====
    // ===== does not change buildCashflowSummary()'s own isNegative (that stays scoped to the   =====
    // ===== current month only, per the approved Phase 2C decision — see report).              =====
    // =====================================================================================

    // Broader, display-only "is anything negative in the next 6 months" signal — approved
    // Phase 2C choice (option B): derived here from summary.months rather than widening
    // buildCashflowSummary()'s own isNegative field, so the engine's contract (isNegative =
    // current-month-only) does not change. Returns the FIRST (soonest) month whose lowest
    // projected balance goes negative, or null if none of the 6 projected months does.
    // Same '₪'+rounded+locale convention as formatHomeCurrency(), with an explicit leading
    // sign — used only for cash-flow EVENT amounts (income vs. expense), where showing the
    // direction of money movement is the point (formatHomeCurrency() alone already reads as
    // negative-for-expenses via its own '-₪' prefix, but a plain positive income event would
    // otherwise show no sign at all next to a signed expense in the same list).
    function formatSignedCurrency(n) {
        var rounded = Math.round(n);
        return (rounded < 0 ? '-₪' : '+₪') + Math.abs(rounded).toLocaleString();
    }

    // =====================================================================================
    // ===== Version 1.4.1: the Forecast screen's "האירוע הכספי הבא" card — the ONLY summary =====
    // ===== card kept on this screen (the old anchor hero + "ההכנסה הבאה"/"צפוי לרדת עד     =====
    // ===== ההכנסה הבאה"/period lowest-balance cards are all removed, per the approved       =====
    // ===== decision to stop presenting anything as a bank balance). Sourced from             =====
    // ===== getNextCashflowEvent() — the same unified event source the daily table/graph use, =====
    // ===== no balance anchor involved anywhere in this function.                             =====
    // =====================================================================================
    function renderCashflowInsightsFromRealData() {
        var nextEvent = getNextCashflowEvent();
        var toneClass = nextEvent ? (nextEvent.amount >= 0 ? ' positive-amount' : ' negative-amount') : '';
        var valueText = nextEvent ? formatSignedCurrency(nextEvent.amount) : 'אין אירועים עתידיים';
        var noteText = nextEvent
            ? ((nextEvent.title || '') + ' · ' + nextEvent.date.toLocaleDateString('he-IL'))
            : 'לא נמצאו אירועים בחודשיים הקרובים';

        var feedHtml = '<div class="insight-card">' +
            '<div class="insight-icon">📊</div>' +
            '<div class="insight-body">' +
                '<div class="insight-title">האירוע הכספי הבא</div>' +
                '<div class="insight-value' + toneClass + '">' + escapeHtml(valueText) + '</div>' +
                '<div class="insight-note">' + escapeHtml(noteText) + '</div>' +
            '</div>' +
        '</div>';
        var feedEl = document.getElementById('cashflow-summary-feed');
        if (feedEl) { feedEl.innerHTML = feedHtml; }
    }

    // =====================================================================================
    // ===== Version 1.4.2 (period redefined in 1.4.6 — see getForecastPeriodBounds()): the       =====
    // ===== projected-daily-balance graph + table for the 5th-to-4th reporting period. ONE       =====
    // ===== buildProjectedBalanceMonthView() call per render feeds both the graph and the        =====
    // ===== table, so they can never disagree — same requirement the Version 1.4.1 section       =====
    // ===== this replaces already satisfied for its own graph/table pair.                        =====
    // =====================================================================================

    // UI-only: which single day-row (by 'YYYY-MM-DD' key) is currently expanded in the daily
    // table, if any. Not persisted — resets on reload, same convention as every other transient,
    // in-memory-only UI flag in this file.
    var expandedForecastDayKey = null;

    // Version 1.4.2: driven by buildProjectedBalanceMonthView() (the authoritative
    // buildProjectedBalanceSeries()-based engine) instead of the retired cumulative-since-month-
    // start model. When no opening balance is configured yet, the graph/table area is hidden
    // entirely and an honest "לא ניתן לחשב..." notice is shown instead — never a fabricated ₪0.
    function renderMonthlyCashflowForecast() {
        var view = buildProjectedBalanceMonthView(new Date());
        var monthLabelEl = document.getElementById('forecast-month-label');
        if (monthLabelEl) { monthLabelEl.textContent = view.periodLabel; }
        var unconfiguredEl = document.getElementById('forecast-unconfigured-notice');
        var configuredAreaEl = document.getElementById('forecast-configured-area');

        if (!view.configured) {
            if (configuredAreaEl) { configuredAreaEl.style.display = 'none'; }
            if (unconfiguredEl) {
                unconfiguredEl.innerHTML = '<div class="insight-note">לא ניתן לחשב יתרה יומית לפני הגדרת יתרת התחלה.</div>' +
                    '<div class="tx-edit-actions"><button type="button" class="tx-edit-save" onclick="goToOpeningBalanceSettings()">הגדר יתרת התחלה</button></div>';
            }
            return;
        }
        if (unconfiguredEl) { unconfiguredEl.innerHTML = ''; }
        if (configuredAreaEl) { configuredAreaEl.style.display = ''; }
        renderMonthlyCashflowChart(view);
        renderMonthlyCashflowTable(view);
    }

    // Projected-daily-balance step chart — same held-rectangle + staircase-outline drawing
    // technique as the retired cumulative chart, now plotting projectedBalance and skipping any
    // day before the opening date entirely (no invented point exists for it). If the opening date
    // falls entirely after the displayed period (every day 'unavailable'), the chart is left empty
    // with an honest textual explanation rather than a misleading blank/zero graph.
    function renderMonthlyCashflowChart(view) {
        var svg = document.getElementById('forecast-period-svg');
        var summaryEl = document.getElementById('forecast-period-chart-summary');
        if (!svg) { return; }

        var plottable = [];
        for (var pi = 0; pi < view.days.length; pi++) { if (view.days[pi].availability !== 'unavailable') { plottable.push(view.days[pi]); } }
        if (plottable.length === 0) {
            svg.innerHTML = '';
            var emptyMsg = 'אין נתון להצגה בתקופה זו — יתרת ההתחלה חלה מתאריך ' + view.openingDateStr + '.';
            svg.setAttribute('aria-label', emptyMsg);
            if (summaryEl) { summaryEl.textContent = emptyMsg; }
            return;
        }

        var W = 300, H = 170, padL = 40, padR = 8, padT = 14, padB = 20;
        var innerW = W - padL - padR, innerH = H - padT - padB;

        var values = [];
        for (var vi = 0; vi < plottable.length; vi++) { values.push(plottable[vi].projectedBalance); }
        var minV = Math.min.apply(null, values);
        var maxV = Math.max.apply(null, values);
        var range = (maxV - minV) || 1;

        function xOf(periodDayIndex) { return padL + (periodDayIndex / view.totalDays) * innerW; }
        function yOf(v) { return padT + innerH - ((v - minV) / range) * innerH; }
        var baselineY = (minV <= 0 && maxV >= 0) ? yOf(0) : yOf(minV);

        var parts = [];
        if (minV <= 0 && maxV >= 0) {
            parts.push('<line x1="' + padL + '" y1="' + baselineY + '" x2="' + (W - padR) + '" y2="' + baselineY + '" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3,3"></line>');
        }

        var prevX = xOf(plottable[0].periodDayIndex), prevY = yOf(plottable[0].projectedBalance);
        var strokePts = [prevX + ',' + prevY];
        for (var i = 0; i < plottable.length; i++) {
            var day = plottable[i];
            var x = xOf(day.periodDayIndex);
            var y = yOf(day.projectedBalance);
            var fill = (day.projectedBalance >= 0) ? 'var(--color-success)' : 'var(--color-danger)';
            parts.push('<rect x="' + Math.min(prevX, x) + '" y="' + Math.min(y, baselineY) + '" width="' + Math.max(1, Math.abs(x - prevX)) + '" height="' + Math.max(1, Math.abs(baselineY - y)) + '" fill="' + fill + '" fill-opacity="0.16"></rect>');
            strokePts.push(x + ',' + prevY);
            strokePts.push(x + ',' + y);
            prevX = x; prevY = y;
        }
        parts.push('<polyline points="' + strokePts.join(' ') + '" fill="none" stroke="var(--color-text)" stroke-width="2" stroke-linejoin="round"></polyline>');

        parts.push('<text x="' + padL + '" y="' + (padT - 2) + '" font-size="7" fill="var(--color-text-muted)">' + escapeHtml(formatHomeCurrency(maxV)) + '</text>');
        parts.push('<text x="' + padL + '" y="' + (H - padB + 12) + '" font-size="7" fill="var(--color-text-muted)">' + escapeHtml(formatHomeCurrency(minV)) + '</text>');
        // Version 1.4.6: axis end-labels show the actual first/last plotted DATE (day.month, same
        // short format the table already uses) instead of a bare period-day-index number — a plain
        // "1"/"30" would no longer correspond to any real calendar day a user recognizes now that
        // the period spans two calendar months (unlike the retired single-calendar-month view,
        // where the day-of-month number alone was already unambiguous).
        parts.push('<text x="' + padL + '" y="' + (H - 4) + '" font-size="7" fill="var(--color-text-muted)">' + escapeHtml(plottable[0].date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })) + '</text>');
        parts.push('<text x="' + (W - padR) + '" y="' + (H - 4) + '" font-size="7" fill="var(--color-text-muted)" text-anchor="end">' + escapeHtml(plottable[plottable.length - 1].date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })) + '</text>');

        svg.innerHTML = parts.join('');

        var lastDay = plottable[plottable.length - 1];
        var a11ySummary = 'יתרה יומית צפויה (' + view.periodLabel + '): בסוף הטווח המוצג ' + formatHomeCurrency(lastDay.projectedBalance) + '. ' +
            'החישוב מבוסס על יתרת ההתחלה ועל התנועות המתוכננות באפליקציה, הוא אינו מחובר לחשבון הבנק.';
        svg.setAttribute('aria-label', a11ySummary);
        if (summaryEl) { summaryEl.textContent = a11ySummary; }
    }

    function buildForecastDayDetailsHtml(day) {
        if (!day.events || day.events.length === 0) {
            return '<div class="insight-note">' + (day.availability === 'opening' ? 'אין תנועות רשומות ביום יתרת ההתחלה.' : 'אין תנועות מתוכננות ביום זה.') + '</div>';
        }
        var html = '';
        // Version 1.4.2 correction: labeling is now PER-EVENT (ev.alreadyIncludedInOpeningSnapshot),
        // not a single blanket day-level message — a cash withdrawal entered after the opening
        // snapshot was saved is genuinely NOT already included, even on the opening date itself,
        // and must not be mislabeled as such.
        if (day.availability === 'opening') {
            var anyAlready = false, anyNew = false;
            for (var k = 0; k < day.events.length; k++) {
                if (day.events[k].alreadyIncludedInOpeningSnapshot) { anyAlready = true; } else { anyNew = true; }
            }
            if (anyAlready && !anyNew) {
                html += '<div class="insight-note">התנועות הבאות כבר כלולות ביתרת ההתחלה ואינן מופחתות שוב:</div>';
            } else if (anyAlready && anyNew) {
                html += '<div class="insight-note">חלק מהתנועות ביום זה כבר כלולות ביתרת ההתחלה (מסומנות); האחרות מופחתות עכשיו לראשונה.</div>';
            }
        }
        for (var i = 0; i < day.events.length; i++) {
            var ev = day.events[i];
            var cls = ev.amount >= 0 ? 'positive-amount' : 'negative-amount';
            var alreadyTag = (day.availability === 'opening' && ev.alreadyIncludedInOpeningSnapshot) ? ' <span class="insight-note">(כלול ביתרת ההתחלה)</span>' : '';
            html += '<div class="forecast-day-event">' +
                '<span class="forecast-day-event-title">' + escapeHtml(ev.title || '') + alreadyTag + '</span>' +
                '<span class="forecast-day-event-amount ' + cls + '">' + escapeHtml(formatSignedCurrency(ev.amount)) + '</span>' +
            '</div>';
        }
        return html;
    }

    // One row per day of the 5th-to-4th reporting period (view.days — see
    // getForecastPeriodBounds()/buildProjectedBalanceMonthView()), always all of them (including
    // past days and days with no events) — never a filtered/paged subset. Each row's summary is a single
    // touch/click/Enter/Space-activatable control with a real aria-expanded state and an
    // explicit accessible name, so its expand/collapse state is never conveyed by color alone.
    // Version 1.4.2: a day before the opening date renders as an explicit unavailable row ("—" /
    // "אין נתון לפני יתרת ההתחלה") — never a calculated value. The opening date itself is tagged
    // "יתרת התחלה" and its balance is exactly the configured opening amount.
    function renderMonthlyCashflowTable(view) {
        var container = document.getElementById('forecast-daily-table');
        if (!container) { return; }
        // Version 1.4.6: compares dateKey directly instead of the retired year/month match — the
        // period can span two different calendar months (or two different years, across Dec/Jan),
        // so "today" is identified by its own exact date key, not by "is this the displayed month".
        var todayKey = cashflowDateKey(new Date());

        var rows = '<div class="forecast-day-row forecast-day-header" aria-hidden="true">' +
            '<div class="forecast-day-cell">תאריך</div>' +
            '<div class="forecast-day-cell">הכנסות</div>' +
            '<div class="forecast-day-cell">הוצאות</div>' +
            '<div class="forecast-day-cell">שינוי יומי</div>' +
            '<div class="forecast-day-cell">יתרה צפויה</div>' +
        '</div>';

        for (var i = 0; i < view.days.length; i++) {
            var day = view.days[i];
            var dateKey = day.dateKey;
            var isToday = (dateKey === todayKey);
            var rowId = 'forecast-day-row-' + dateKey;
            var expanded = (expandedForecastDayKey === dateKey);
            var dateLabel = day.date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

            if (day.availability === 'unavailable') {
                var unavailA11y = dateLabel + ', אין נתון לפני יתרת ההתחלה';
                rows += '<div class="forecast-day-row' + (isToday ? ' is-today' : '') + '" id="' + rowId + '">' +
                    '<div class="forecast-day-summary" role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '" ' +
                        'aria-controls="' + rowId + '-details" aria-label="' + escapeHtml(unavailA11y) + '" ' +
                        'onclick="toggleForecastDayRow(\'' + dateKey + '\')" onkeydown="handleForecastDayRowKeydown(event, \'' + dateKey + '\')">' +
                        '<div class="forecast-day-cell forecast-day-date" data-label="תאריך">' + escapeHtml(dateLabel) + '</div>' +
                        '<div class="forecast-day-cell neutral-amount" data-label="הכנסות">—</div>' +
                        '<div class="forecast-day-cell neutral-amount" data-label="הוצאות">—</div>' +
                        '<div class="forecast-day-cell neutral-amount" data-label="שינוי יומי">—</div>' +
                        '<div class="forecast-day-cell neutral-amount" data-label="יתרה צפויה">—</div>' +
                    '</div>' +
                    '<div class="forecast-day-details" id="' + rowId + '-details" style="display:' + (expanded ? 'block' : 'none') + ';">' +
                        '<div class="insight-note">אין נתון לפני יתרת ההתחלה.</div>' +
                    '</div>' +
                '</div>';
                continue;
            }

            var isOpening = (day.availability === 'opening');
            var netClass = day.net > 0 ? 'positive-amount' : (day.net < 0 ? 'negative-amount' : 'neutral-amount');
            var balClass = day.projectedBalance > 0 ? 'positive-amount' : (day.projectedBalance < 0 ? 'negative-amount' : 'neutral-amount');
            var balText = formatHomeCurrency(day.projectedBalance) + (day.projectedBalance < 0 ? ' ⚠' : '');
            var dateCellLabel = dateLabel + (isOpening ? ' · יתרת התחלה' : '');
            var a11yLabel = dateLabel + (isOpening ? ', יתרת התחלה' : ', שינוי יומי ' + formatSignedCurrency(day.net)) + ', יתרה צפויה ' + formatHomeCurrency(day.projectedBalance);

            rows += '<div class="forecast-day-row' + (isToday ? ' is-today' : '') + '" id="' + rowId + '">' +
                '<div class="forecast-day-summary" role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '" ' +
                    'aria-controls="' + rowId + '-details" aria-label="' + escapeHtml(a11yLabel) + '" ' +
                    'onclick="toggleForecastDayRow(\'' + dateKey + '\')" onkeydown="handleForecastDayRowKeydown(event, \'' + dateKey + '\')">' +
                    '<div class="forecast-day-cell forecast-day-date" data-label="תאריך">' + escapeHtml(dateCellLabel) + '</div>' +
                    '<div class="forecast-day-cell positive-amount" data-label="הכנסות">' + (day.income > 0 ? escapeHtml(formatSignedCurrency(day.income)) : '₪0') + '</div>' +
                    '<div class="forecast-day-cell negative-amount" data-label="הוצאות">' + (day.expenses > 0 ? escapeHtml(formatSignedCurrency(-day.expenses)) : '₪0') + '</div>' +
                    '<div class="forecast-day-cell ' + netClass + '" data-label="שינוי יומי">' + (isOpening ? '—' : escapeHtml(formatSignedCurrency(day.net))) + '</div>' +
                    '<div class="forecast-day-cell ' + balClass + '" data-label="יתרה צפויה">' + escapeHtml(balText) + '</div>' +
                '</div>' +
                '<div class="forecast-day-details" id="' + rowId + '-details" style="display:' + (expanded ? 'block' : 'none') + ';">' +
                    buildForecastDayDetailsHtml(day) +
                '</div>' +
            '</div>';
        }

        container.innerHTML = rows;
    }

    // Expanding/collapsing a row never mutates financial data — expandedForecastDayKey is pure,
    // in-memory-only transient UI state. Focus is restored to the SAME row's summary control
    // after the re-render below replaces its DOM node, so keyboard users never lose their place.
    function toggleForecastDayRow(dateKey) {
        var wasExpanded = (expandedForecastDayKey === dateKey);
        expandedForecastDayKey = wasExpanded ? null : dateKey;
        renderMonthlyCashflowForecast();
        var rowEl = document.getElementById('forecast-day-row-' + dateKey);
        if (rowEl) {
            var summary = rowEl.querySelector('.forecast-day-summary');
            if (summary) { try { summary.focus(); } catch (e) { } }
        }
    }

    function handleForecastDayRowKeydown(e, dateKey) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleForecastDayRow(dateKey);
        }
    }


    // charge.month/warning.month are the same short month labels (e.g. "אוג׳") computeForecast()
    // already returns — no day-level date arithmetic is invented here. Amounts reuse
    // formatHomeCurrency() (Stage D.5, unchanged) for the same '₪'+rounded+locale convention
    // used everywhere else on this screen.
    //
    // Version 1.3, Phase 2C: both cards below are now sourced from buildCashflowSummary()
    // instead of getBiggestUpcomingCharge()/getForecastWarning() (both computeForecast-derived).
    // getBiggestUpcomingCharge() picked the single BIGGEST loan/dated charge in 6 months — a
    // different concept from "the next event of any kind", which is what a user reading "מה
    // דורש תשומת לב" actually expects here; per the approved Phase 2C decision, this card now
    // shows the new engine's own coherent nextEvent instead of keeping two different answers to
    // the same question on screen. Milestone 6 update: getBiggestUpcomingCharge()/
    // getForecastWarning() (and computeForecast() itself) were confirmed unreachable and removed
    // — see the removal note near computeForecast()'s former location for the full evidence.
    function renderAttentionListFromRealData() {
        var cards = [];
        // Version 1.4.1: sourced from getNextCashflowEvent() — the same unified-event helper the
        // Forecast screen's own next-event card and daily series use — instead of
        // buildCashflowSummary(items).nextEvent, so Home and Forecast can never compute two
        // different answers to "what's the next event" via two different code paths. Signed
        // amount + explicit green/expense-red color (income vs. expense/loan), per the approved
        // semantic-color correction — previously this showed an unsigned, uncolored amount.
        var nextEvent = getNextCashflowEvent(items);

        if (nextEvent) {
            cards.push({
                title: nextEvent.title || 'אירוע כספי קרוב',
                detail: 'צפוי ב-' + nextEvent.date.toLocaleDateString('he-IL'),
                amount: formatSignedCurrency(nextEvent.amount),
                tone: nextEvent.amount >= 0 ? 'positive-amount' : 'negative-amount'
            });
        }

        // Phase 2C final semantic-consistency gate: the old forward "אזהרת תחזית" card (whether
        // sourced from getForecastWarning()/computeForecast(), tried briefly in an earlier pass
        // of this same gate, or from the new engine, tried before that) is intentionally REMOVED
        // from Home entirely, not just re-sourced. Home's hero-amount is a monthly-snapshot metric
        // (this calendar month's income minus expense, not anchored to a real balance, per the
        // approved "different product concept" decision) — it already directly shows a negative
        // number with the app's existing negative-value styling if this month itself is unhealthy,
        // so a separate same-month warning card would be redundant. And a warning scanning FUTURE
        // months (which is what getForecastWarning's 6-month computeForecast scan actually does)
        // is exactly the authoritative forward cash-flow forecast that the Insights screen now
        // owns exclusively (see its own "אזהרת תחזית" card, sourced from
        // findFirstNegativeCashflowMonth(buildCashflowSummary(...))) — keeping any version of this
        // card on Home, under any engine, would mean two differently-computed "forecast warning"
        // values could disagree for the same real-world month. Home keeps only the "next event"
        // card above (informational, not an evaluative claim) and its unchanged monthly snapshot.

        // Empty state: when neither signal fires (0 cards), attention-list is simply left empty
        // (innerHTML = '') rather than showing invented "everything's fine" copy — the same
        // judgment call already made and documented for the Insights screen's forecast-warning
        // card in Stage D.6 (no empty-state markup exists in the design for this card), kept
        // consistent here rather than inventing new wording unilaterally.
        var html = '';
        for (var i = 0; i < cards.length; i++) {
            var a = cards[i];
            html += '<div class="attention-item">' +
                '<div>' +
                    '<div class="attention-title">' + escapeHtml(a.title) + '</div>' +
                    '<div class="attention-detail">' + escapeHtml(a.detail) + '</div>' +
                '</div>' +
                '<div class="attention-amount ' + a.tone + '">' + escapeHtml(a.amount) + '</div>' +
            '</div>';
        }
        document.getElementById('attention-list').innerHTML = html;
    }

    // Called once, after items/categoryConfig and the Home render above — same ordering
    // guarantee, no code moved.
    renderAttentionListFromRealData();

    // =====================================================================================
    // ===== Stage D.6 Part D: Insights screen only — replaces insights-feed's Mock-fed      =====
    // ===== cards with real ones, reusing the exact same insight-card markup/classes         =====
    // ===== (unchanged since Stage B). Does not touch the Home, Transactions, or Settings     =====
    // ===== screens, MOCK_DATA, or localStorage.                                              =====
    // =====================================================================================

    function renderInsightsScreenFromRealData() {
        var narrativeResult = buildPreviewNarrativeData().narrative;
        var cards = [];

        // Same 3 topics the original Mock cards showed, same order, same titles — only the
        // dynamic content (value/note) is now real.
        cards.push({
            title: 'סך חיובי כרטיס אשראי החודש',
            value: formatHomeCurrency(getFixedCreditCardTotals(items)),
            note: narrativeResult.creditCardTotal,
            tone: 'normal'
        });

        cards.push({
            title: 'יתרת הלוואות שנותרו',
            value: formatHomeCurrency(getLoansRemainingSummary(items).totalRemaining),
            note: narrativeResult.loansRemaining,
            tone: 'normal'
        });

        // Version 1.4.1: the "אזהרת תחזית" card that used to sit here (findFirstNegativeCashflowMonth
        // over buildCashflowSummary(items)) is REMOVED — it was a "lowest projected balance goes
        // negative" warning derived from the retired balance anchor, exactly the kind of
        // anchor-derived card this correction removes. The two cards above (credit-card total,
        // loans remaining) are unrelated tracking totals, not anchor-derived, and are unchanged.

        // Markup below is byte-for-byte identical to renderMockUI()'s insights-block (Stage B) —
        // same classes, same nesting, same tone-icon logic — only `cards` is a real-data array
        // instead of MOCK_DATA.insights.
        var html = '';
        for (var k = 0; k < cards.length; k++) {
            var c = cards[k];
            var isWarning = c.tone === 'warning';
            var toneClass = isWarning ? ' warning' : '';
            var toneIcon = isWarning ? '⚠️' : '📊';
            html += '<div class="insight-card' + toneClass + '">' +
                '<div class="insight-icon">' + toneIcon + '</div>' +
                '<div class="insight-body">' +
                    '<div class="insight-title">' + escapeHtml(c.title) + '</div>' +
                    '<div class="insight-value">' + escapeHtml(c.value) + '</div>' +
                    '<div class="insight-note">' + escapeHtml(c.note) + '</div>' +
                '</div>' +
            '</div>';
        }
        document.getElementById('insights-feed').innerHTML = html;
    }

    // Called once, after items/categoryConfig and the Home render above — same ordering
    // guarantee, no code moved.
    renderInsightsScreenFromRealData();

    // Renders the Forecast screen's single "האירוע הכספי הבא" card, same ordering guarantee
    // (items/categoryConfig/appSettings already loaded).
    renderCashflowInsightsFromRealData();

    // Version 1.4.1 correction: the 6-month "תחזית חודשית מורחבת" section (renderForecast(),
    // anchor-dependent via buildCashflowSummary()) is REMOVED, not called — see CURRENT_STATUS.md.

    // Version 1.4.1: draws the calendar-month daily cashflow graph + table (replaces the retired
    // 30/60/90-day period-scoped section). Same ordering guarantee as the two render calls
    // directly above; also called from renderAllPreviewScreens() below.
    renderMonthlyCashflowForecast();

    // Milestone 4: draws the Goals screen. Same ordering guarantee (goals/items/categoryConfig
    // already loaded above); also called from renderAllPreviewScreens() below.
    renderGoalsScreenFromRealData();

    // Version 1.4.1: establish the base History-API entry (and, in standalone/installed-PWA mode,
    // the Home boundary) BEFORE anything that could push a transient overlay entry on top of it
    // — in particular, before the automatic reminder check directly below, which can open the
    // Goals reminder overlay on a completely fresh load.
    initNavHistory();

    // Milestone 5: the ONE automatic trigger point for the consolidated Goals reminder — checked
    // once per fresh page load, after goals/goalsState are fully loaded. See
    // checkAndShowGoalsReminder() for the full eligibility contract (function hoisting makes this
    // forward reference safe, same pattern already used throughout this file).
    checkAndShowGoalsReminder();

    // =====================================================================================
    // ===== Milestone 4: Goals screen — collapsed/expanded cards, create/edit/archive forms, =====
    // ===== component add/edit/remove, and inline validation. Reuses existing UI patterns    =====
    // ===== verbatim: .filter-toggle/.filter-btn (active/archived toggle, same as Transactions),=====
    // ===== .tx-edit-form/.tx-edit-group/.tx-edit-actions (forms), .cat-row-actions/.cat-edit-btn/=====
    // ===== .cat-delete-btn (compact row actions), and the category-delete inline two-button    =====
    // ===== confirm pattern (archive/remove-component confirmations). No second "add form"      =====
    // ===== engine, no second validation convention beyond the two small DOM helpers below.      =====
    // =====================================================================================

    function findGoalById(id) {
        for (var i = 0; i < goals.length; i++) { if (goals[i].id === id) { return goals[i]; } }
        return null;
    }

    function findComponentById(goal, componentId) {
        if (!goal) { return null; }
        for (var i = 0; i < goal.components.length; i++) { if (goal.components[i].id === componentId) { return goal.components[i]; } }
        return null;
    }

    // Small, reusable inline-validation DOM helpers shared by every Goals form (create/edit goal,
    // add/edit component) — add/remove a `.invalid` class plus a `.field-error` message node
    // directly next to the offending field, WITHOUT re-rendering the form, so whatever the user
    // already typed in every field is never lost/reset by a failed validation attempt.
    function clearFieldError(inputEl) {
        if (!inputEl) { return; }
        inputEl.classList.remove('invalid');
        var next = inputEl.nextSibling;
        if (next && next.classList && next.classList.contains('field-error')) { next.parentNode.removeChild(next); }
    }
    function setFieldError(inputEl, message) {
        if (!inputEl) { return; }
        clearFieldError(inputEl);
        inputEl.classList.add('invalid');
        var err = document.createElement('div');
        err.className = 'field-error';
        err.textContent = message;
        inputEl.parentNode.insertBefore(err, inputEl.nextSibling);
    }

    function setGoalsShowArchived(showArchived) {
        goalsShowArchived = !!showArchived;
        goalsExpandedId = null;
        goalCreateFormOpen = false;
        goalEditingId = null;
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        goalArchiveConfirmId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
    }

    function toggleGoalExpand(id) {
        goalsExpandedId = (goalsExpandedId === id) ? null : id;
        goalEditingId = null;
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        goalArchiveConfirmId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        // Audit correction: renderGoalsScreenFromRealData() rebuilds #goals-list-area's innerHTML
        // from scratch, which discards and replaces the very .goal-card-head element the user just
        // activated (by click OR keyboard) — the browser drops focus to <body> when its focused
        // element is removed from the DOM. Re-focusing the freshly-rendered head for this SAME goal
        // keeps a keyboard user's place after both expanding and collapsing a card, instead of
        // forcing them to Tab from the top of the screen again.
        var headEl = document.querySelector('.goal-card-head[data-goal-id="' + id + '"]');
        if (headEl) { headEl.focus(); }
    }

    // Version 1.4.1 correction: exactly one Goals-screen inline sub-state (create/edit-goal,
    // create/edit-component, archive-confirm, remove-component-confirm) can be open at a time —
    // already enforced by every start*/ask* function below nulling out the others. One shared
    // history entry ('goalInline') covers all of them: ensureGoalInlineTransient() pushes it only
    // when nothing in the group is already open (switching between sibling states does NOT push a
    // second entry); cancelCurrentGoalInlineState() — the onClose Back actually calls — dispatches
    // to whichever state's OWN existing cancelX() is currently relevant, so Back can never do
    // anything other than that exact same safe cancel. Every cancel/save/confirm function in this
    // group calls consumeTransient('goalInline') so a direct click balances the stack exactly like
    // Back would.
    function ensureGoalInlineTransient() {
        if (transientStack.length === 0 || transientStack[transientStack.length - 1].type !== 'goalInline') {
            pushTransientState('goalInline', cancelCurrentGoalInlineState);
        }
    }
    function cancelCurrentGoalInlineState() {
        if (goalRemoveComponentConfirm !== null) { cancelRemoveComponent(); return; }
        if (goalArchiveConfirmId !== null) { cancelArchiveGoal(); return; }
        if (goalComponentFormFor !== null) { cancelComponentForm(); return; }
        if (goalEditingId !== null) { cancelGoalEdit(); return; }
        if (goalCreateFormOpen) { cancelGoalCreate(); return; }
    }

    function startGoalCreate() {
        goalCreateFormOpen = true;
        goalsExpandedId = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function cancelGoalCreate() {
        goalCreateFormOpen = false;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function startGoalEdit(id) {
        goalEditingId = id;
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        goalArchiveConfirmId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function cancelGoalEdit() {
        goalEditingId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    // Shared by both the create form and the edit form — identical fields, only the pre-filled
    // values and the save/cancel handlers differ. When `existingGoal` already has components,
    // the target-amount field becomes a read-only computed display instead of an input (the
    // "never two independently editable totals" rule) rather than being hidden entirely, so the
    // user always sees where the number comes from.
    function buildGoalFormHtml(existingGoal) {
        var isEdit = !!existingGoal;
        var hasComponents = isEdit && existingGoal.components && existingGoal.components.length > 0;
        var titleVal = isEdit ? escapeHtml(existingGoal.title) : '';
        var dateVal = isEdit ? existingGoal.dueDate : '';
        var amountVal = isEdit ? existingGoal.targetAmount : '';
        var savedVal = isEdit ? existingGoal.savedAmount : '';
        var saveOnclick = isEdit ? ('saveGoalEdit(\'' + existingGoal.id + '\')') : 'saveNewGoal()';
        var cancelOnclick = isEdit ? 'cancelGoalEdit()' : 'cancelGoalCreate()';

        var amountFieldHtml;
        if (hasComponents) {
            amountFieldHtml = '<div class="tx-edit-group"><label>סכום יעד (מחושב אוטומטית מסכום הרכיבים)</label>' +
                '<div style="padding:9px 12px;font-size:14px;color:var(--color-text-muted);">' + escapeHtml(formatHomeCurrency(goalTargetAmount(existingGoal))) + '</div></div>';
        } else {
            amountFieldHtml = '<div class="tx-edit-group"><label>סכום יעד</label><input type="number" id="goal-form-amount" placeholder="₪" value="' + (amountVal === '' ? '' : amountVal) + '"></div>';
        }

        return '<div class="tx-edit-form">' +
            '<div style="font-size:14.5px;font-weight:700;margin-bottom:12px;">' + (isEdit ? 'עריכת יעד' : 'יעד חיסכון חדש') + '</div>' +
            '<div class="tx-edit-group"><label>שם היעד</label><input type="text" id="goal-form-title" placeholder="לדוגמה: ביטוח רכב" value="' + titleVal + '"></div>' +
            amountFieldHtml +
            '<div class="tx-edit-group"><label>תאריך יעד</label><input type="date" id="goal-form-date" value="' + dateVal + '"></div>' +
            '<div class="tx-edit-group"><label>נחסך כבר (לא חובה)</label><input type="number" id="goal-form-saved" placeholder="₪0" value="' + (savedVal === '' ? '' : savedVal) + '"></div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="' + saveOnclick + '">💾 שמור יעד</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="' + cancelOnclick + '">ביטול</button>' +
            '</div></div>';
    }

    function saveNewGoal() {
        var titleEl = document.getElementById('goal-form-title');
        var dateEl = document.getElementById('goal-form-date');
        var amountEl = document.getElementById('goal-form-amount');
        var savedEl = document.getElementById('goal-form-saved');
        clearFieldError(titleEl); clearFieldError(dateEl); clearFieldError(amountEl); clearFieldError(savedEl);

        var valid = true;
        var title = titleEl.value.trim();
        if (!title) { setFieldError(titleEl, 'נא להזין שם ליעד.'); valid = false; }

        var dueDate = dateEl.value;
        if (!isValidDateStr(dueDate)) { setFieldError(dateEl, 'נא לבחור תאריך יעד תקין.'); valid = false; }

        var amount = sanitizePositiveAmount(amountEl.value);
        if (amount === null) { setFieldError(amountEl, 'נא להזין סכום יעד תקין (גדול מאפס).'); valid = false; }

        var savedRaw = (savedEl.value === '') ? '0' : savedEl.value;
        var saved = sanitizeNonNegativeAmount(savedRaw);
        if (saved === null) { setFieldError(savedEl, 'נא להזין סכום שנחסך תקין (0 ומעלה).'); valid = false; }

        if (!valid) { return; }

        var now = nowIsoTimestamp();
        goals.push({
            id: generateGoalsId('goal'), title: title, dueDate: dueDate, targetAmount: amount,
            savedAmount: saved, components: [], isArchived: false, createdAt: now, updatedAt: now,
            confirmedTransfers: []
        });
        saveGoals();
        goalCreateFormOpen = false;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');

        // Milestone 5: "a new active, incomplete goal created after the 2nd becomes reminder-
        // eligible immediately... show the consolidated reminder during the same application
        // session." checkAndShowGoalsReminder() itself decides whether this specific new goal
        // (or any other currently-due goal) actually warrants showing it right now — e.g. a goal
        // created on day 1 correctly stays quiet until the 2nd, per getReminderEligibleTransferDates().
        checkAndShowGoalsReminder();
    }

    function saveGoalEdit(id) {
        var goal = findGoalById(id);
        if (!goal) { return; }
        var titleEl = document.getElementById('goal-form-title');
        var dateEl = document.getElementById('goal-form-date');
        var savedEl = document.getElementById('goal-form-saved');
        var amountEl = document.getElementById('goal-form-amount'); // null when the goal already has components
        clearFieldError(titleEl); clearFieldError(dateEl); clearFieldError(savedEl); clearFieldError(amountEl);

        var valid = true;
        var title = titleEl.value.trim();
        if (!title) { setFieldError(titleEl, 'נא להזין שם ליעד.'); valid = false; }

        var dueDate = dateEl.value;
        if (!isValidDateStr(dueDate)) { setFieldError(dateEl, 'נא לבחור תאריך יעד תקין.'); valid = false; }

        var savedRaw = (savedEl.value === '') ? '0' : savedEl.value;
        var saved = sanitizeNonNegativeAmount(savedRaw);
        if (saved === null) { setFieldError(savedEl, 'נא להזין סכום שנחסך תקין (0 ומעלה).'); valid = false; }

        var hasComponents = goal.components && goal.components.length > 0;
        var amount = goal.targetAmount;
        if (!hasComponents) {
            amount = sanitizePositiveAmount(amountEl.value);
            if (amount === null) { setFieldError(amountEl, 'נא להזין סכום יעד תקין (גדול מאפס).'); valid = false; }
        }

        if (!valid) { return; }

        goal.title = title;
        goal.dueDate = dueDate;
        goal.savedAmount = saved;
        if (!hasComponents) { goal.targetAmount = amount; }
        goal.updatedAt = nowIsoTimestamp();
        saveGoals();
        goalEditingId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function startComponentCreate(goalId) {
        goalComponentFormFor = goalId;
        goalComponentEditingId = null;
        goalArchiveConfirmId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function startComponentEdit(goalId, componentId) {
        goalComponentFormFor = goalId;
        goalComponentEditingId = componentId;
        goalArchiveConfirmId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function cancelComponentForm() {
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function buildComponentFormHtml(goalId, existingComponent) {
        var isEdit = !!existingComponent;
        var nameVal = isEdit ? escapeHtml(existingComponent.name) : '';
        var amountVal = isEdit ? existingComponent.amount : '';
        var dateVal = (isEdit && existingComponent.dueDate) ? existingComponent.dueDate : '';
        var saveOnclick = isEdit ? ('saveComponentEdit(\'' + goalId + '\',\'' + existingComponent.id + '\')') : ('saveNewComponent(\'' + goalId + '\')');
        return '<div class="tx-edit-form" style="margin-top:10px;">' +
            '<div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">' + (isEdit ? 'עריכת רכיב' : 'רכיב חדש') + '</div>' +
            '<div class="tx-edit-group"><label>שם הרכיב</label><input type="text" id="comp-form-name" placeholder="לדוגמה: ביטוח מקיף" value="' + nameVal + '"></div>' +
            '<div class="tx-edit-group"><label>סכום</label><input type="number" id="comp-form-amount" placeholder="₪" value="' + (amountVal === '' ? '' : amountVal) + '"></div>' +
            '<div class="tx-edit-group"><label>תאריך יעד לרכיב זה (לא חובה — ברירת מחדל: תאריך היעד הראשי)</label><input type="date" id="comp-form-date" value="' + dateVal + '"></div>' +
            '<div class="insight-note">לדוגמה: עבור ביטוח רכב יש להוסיף רק את הכיסויים שנבחרו בפועל — חובה + צד ג׳, או חובה + מקיף.</div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="' + saveOnclick + '">💾 שמור רכיב</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelComponentForm()">ביטול</button>' +
            '</div></div>';
    }

    function readComponentFormFields() {
        var nameEl = document.getElementById('comp-form-name');
        var amountEl = document.getElementById('comp-form-amount');
        var dateEl = document.getElementById('comp-form-date');
        clearFieldError(nameEl); clearFieldError(amountEl); clearFieldError(dateEl);

        var valid = true;
        var name = nameEl.value.trim();
        if (!name) { setFieldError(nameEl, 'נא להזין שם לרכיב.'); valid = false; }
        var amount = sanitizePositiveAmount(amountEl.value);
        if (amount === null) { setFieldError(amountEl, 'נא להזין סכום תקין (גדול מאפס).'); valid = false; }
        var dueDate = null;
        if (dateEl.value) {
            if (!isValidDateStr(dateEl.value)) { setFieldError(dateEl, 'תאריך לא תקין.'); valid = false; }
            else { dueDate = dateEl.value; }
        }
        if (!valid) { return null; }
        return { name: name, amount: amount, dueDate: dueDate };
    }

    function saveNewComponent(goalId) {
        var goal = findGoalById(goalId);
        if (!goal) { return; }
        var fields = readComponentFormFields();
        if (!fields) { return; }
        goal.components.push({ id: generateGoalsId('comp'), name: fields.name, amount: fields.amount, dueDate: fields.dueDate });
        // Keep the STORED targetAmount in sync with the component sum, not just the display layer
        // (buildGoalCardHtml() already always calls goalTargetAmount() fresh) — otherwise an
        // exported backup, or any future code reading goal.targetAmount directly, would see a
        // stale flat value left over from before this goal had any components. This is the one
        // and only place goal.targetAmount is derived from components; it is never independently
        // user-editable once components exist (see buildGoalFormHtml()).
        goal.targetAmount = goalTargetAmount(goal);
        goal.updatedAt = nowIsoTimestamp();
        saveGoals();
        goalComponentFormFor = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function saveComponentEdit(goalId, componentId) {
        var goal = findGoalById(goalId);
        if (!goal) { return; }
        var comp = findComponentById(goal, componentId);
        if (!comp) { return; }
        var fields = readComponentFormFields();
        if (!fields) { return; }
        comp.name = fields.name;
        comp.amount = fields.amount;
        comp.dueDate = fields.dueDate;
        goal.targetAmount = goalTargetAmount(goal);
        goal.updatedAt = nowIsoTimestamp();
        saveGoals();
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function askRemoveComponent(goalId, componentId) {
        goalRemoveComponentConfirm = { goalId: goalId, componentId: componentId };
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        goalArchiveConfirmId = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function cancelRemoveComponent() {
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }
    function confirmRemoveComponent() {
        if (!goalRemoveComponentConfirm) { return; }
        var goal = findGoalById(goalRemoveComponentConfirm.goalId);
        if (goal) {
            for (var i = 0; i < goal.components.length; i++) {
                if (goal.components[i].id === goalRemoveComponentConfirm.componentId) { goal.components.splice(i, 1); break; }
            }
            // If components remain, keep targetAmount in sync with their new sum (same reasoning
            // as saveNewComponent/saveComponentEdit). If that was the LAST component, there is no
            // user-entered flat amount to fall back to — deliberately leave targetAmount at its
            // last known value (the sum just before this removal) rather than zeroing it out, so
            // the goal isn't left with an undefined/zero target; the edit form's amount field
            // becomes directly editable again from this point since components.length is now 0.
            if (goal.components.length > 0) { goal.targetAmount = goalTargetAmount(goal); }
            goal.updatedAt = nowIsoTimestamp();
            saveGoals();
        }
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    function askArchiveGoal(id) {
        goalArchiveConfirmId = id;
        goalComponentFormFor = null;
        goalComponentEditingId = null;
        goalRemoveComponentConfirm = null;
        renderGoalsScreenFromRealData();
        ensureGoalInlineTransient();
    }
    function cancelArchiveGoal() {
        goalArchiveConfirmId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }
    function confirmArchiveToggle(id) {
        var goal = findGoalById(id);
        if (goal) {
            goal.isArchived = !goal.isArchived;
            goal.updatedAt = nowIsoTimestamp();
            saveGoals();
        }
        goalArchiveConfirmId = null;
        goalsExpandedId = null;
        renderGoalsScreenFromRealData();
        consumeTransient('goalInline');
    }

    // Builds one collapsed/expanded goal card. Every user-controlled string (goal.title,
    // component.name) goes through escapeHtml() before insertion; every onclick argument is a
    // system-generated id (generateGoalsId()), never raw title/name text.
    function buildGoalCardHtml(goal) {
        var target = goalTargetAmount(goal);
        var saved = round2(goal.savedAmount || 0) + goalConfirmedTransfersTotal(goal);
        var remaining = goalRemainingAmount(goal);
        var pct = goalProgressPercent(goal);
        var schedule = buildGoalScheduleInfo(goal);
        var expanded = (goalsExpandedId === goal.id);
        var dueDateObj = parseLocalDateStr(goal.dueDate);
        var dueDateLabel = dueDateObj ? dueDateObj.toLocaleDateString('he-IL') : '';

        var headerBadge = '';
        if (schedule.isCompleted) { headerBadge = '<span class="goal-badge goal-badge-completed">הושלם</span>'; }
        else if (schedule.isOverdue) { headerBadge = '<span class="goal-badge goal-badge-overdue">באיחור</span>'; }

        var headHtml =
            '<div class="goal-card-head" role="button" tabindex="0" aria-expanded="' + expanded + '" aria-label="' + escapeHtml('יעד: ' + goal.title) + '" data-goal-id="' + goal.id + '" ' +
                'onclick="toggleGoalExpand(\'' + goal.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();toggleGoalExpand(\'' + goal.id + '\');}">' +
                '<div class="goal-head-main">' +
                    '<div class="goal-name">' + escapeHtml(goal.title) + headerBadge + '</div>' +
                    '<div class="goal-meta-row"><span>יעד: <b>' + escapeHtml(formatHomeCurrency(target)) + '</b></span><span>נותר: <b>' + escapeHtml(formatHomeCurrency(remaining)) + '</b></span></div>' +
                    '<div class="goal-meta-row"><span>נחסך: <b>' + escapeHtml(formatHomeCurrency(saved)) + '</b></span><span>תאריך יעד: <b>' + escapeHtml(dueDateLabel) + '</b></span></div>' +
                    '<div class="goal-progress-track"><div class="goal-progress-fill" style="width:' + pct + '%;"></div></div>' +
                '</div>' +
                '<div class="goal-chevron">▾</div>' +
            '</div>';

        var bodyHtml = '';
        if (expanded) {
            if (goalEditingId === goal.id) {
                bodyHtml = '<div class="goal-body-inner">' + buildGoalFormHtml(goal) + '</div>';
            } else {
                var compHtml = '';
                for (var i = 0; i < goal.components.length; i++) {
                    var c = goal.components[i];
                    var effDate = resolveComponentEffectiveDueDate(c, goal);
                    var effDateObj = parseLocalDateStr(effDate);
                    var effLabel = effDateObj ? effDateObj.toLocaleDateString('he-IL') : '';
                    var inherited = !c.dueDate;
                    var isEarly = !inherited && c.dueDate < goal.dueDate;
                    var badge = inherited ? '<span class="goal-badge goal-badge-inherited">מתאריך היעד</span>' : (isEarly ? '<span class="goal-badge goal-badge-early">מוקדם מתאריך היעד</span>' : '');

                    // Milestone 4 correction: each component now has its own funding bucket (see
                    // buildGoalScheduleInfo()) — show what's actually still needed for THIS
                    // component specifically, not just its full face amount, so component-specific
                    // deadline planning is visible on the component itself, not only in aggregate.
                    var bucketForComp = null;
                    for (var bi = 0; bi < schedule.buckets.length; bi++) { if (schedule.buckets[bi].key === c.id) { bucketForComp = schedule.buckets[bi]; break; } }
                    var fundingBadge = '';
                    var fundingLine = '';
                    if (bucketForComp) {
                        if (bucketForComp.isCompleted) {
                            fundingBadge = '<span class="goal-badge goal-badge-completed">מומן</span>';
                        } else if (bucketForComp.isOverdue) {
                            fundingBadge = '<span class="goal-badge goal-badge-overdue">באיחור</span>';
                            fundingLine = '<div class="goal-component-date">נותר: ' + escapeHtml(formatHomeCurrency(bucketForComp.remaining)) + '</div>';
                        } else if (bucketForComp.saved > 0) {
                            fundingLine = '<div class="goal-component-date">נותר: ' + escapeHtml(formatHomeCurrency(bucketForComp.remaining)) + '</div>';
                        }
                    }

                    compHtml += '<div class="goal-component-row">' +
                        '<div class="goal-component-main">' +
                            '<div class="goal-component-name">' + escapeHtml(c.name) + '</div>' +
                            '<div class="goal-component-date">' + escapeHtml(effLabel) + badge + fundingBadge + '</div>' +
                            fundingLine +
                        '</div>' +
                        '<div class="goal-component-amount">' + escapeHtml(formatHomeCurrency(c.amount)) + '</div>' +
                        '<div class="cat-row-actions">' +
                            '<button type="button" class="cat-edit-btn" onclick="event.stopPropagation();startComponentEdit(\'' + goal.id + '\',\'' + c.id + '\')">✏️</button>' +
                            '<button type="button" class="cat-delete-btn" onclick="event.stopPropagation();askRemoveComponent(\'' + goal.id + '\',\'' + c.id + '\')">🗑️</button>' +
                        '</div>' +
                    '</div>';
                }
                if (goal.components.length > 0) {
                    compHtml += '<div class="goal-component-total"><span>סה״כ יעד (מרכיבים)</span><span class="goal-total-amount">' + escapeHtml(formatHomeCurrency(target)) + '</span></div>';
                } else {
                    compHtml += '<div class="insight-note">אין רכיבים — היעד משתמש בסכום שהוזן ישירות.</div>';
                }

                // Milestone 4 correction: component-specific deadline planning — each bucket
                // (component, or the flat goal when it has none) is funded by its OWN due date.
                // An overdue bucket is named explicitly (only when there is more than one real
                // component — a single flat goal doesn't need to repeat its own title back to
                // itself); the combined next-transfer figure covers every still-open bucket at
                // once, so it can never silently omit an earlier component's own requirement.
                var scheduleHtml;
                if (schedule.isCompleted) {
                    scheduleHtml = '<div class="goal-schedule-note">✅ היעד הושלם — לא נדרשת העברה נוספת.</div>';
                } else {
                    var hasRealComponents = goal.components && goal.components.length > 1;
                    var overdueHtml = '';
                    for (var oi = 0; oi < schedule.buckets.length; oi++) {
                        var ob = schedule.buckets[oi];
                        if (!ob.isOverdue) { continue; }
                        var obDueObj = parseLocalDateStr(ob.dueDate);
                        var obDueLabel = obDueObj ? obDueObj.toLocaleDateString('he-IL') : '';
                        var obLabelPrefix = hasRealComponents ? (escapeHtml(ob.label) + ' — ') : '';
                        overdueHtml += '<div class="goal-schedule-note danger">⚠️ ' + obLabelPrefix + 'באיחור (' + escapeHtml(formatHomeCurrency(ob.remaining)) + ' נדרש עד ' + escapeHtml(obDueLabel) + ', לא נותרו מועדי העברה).</div>';
                    }
                    var nextHtml = '';
                    if (schedule.nextTransferAmount !== null && schedule.nextTransferAmount > 0) {
                        var ntLabel = schedule.nextTransferDate.toLocaleDateString('he-IL');
                        nextHtml = '<div class="goal-schedule-note">💡 העברה קרובה מומלצת: ' + escapeHtml(formatHomeCurrency(schedule.nextTransferAmount)) + ' ב-' + escapeHtml(ntLabel) + '.</div>';
                    }
                    scheduleHtml = overdueHtml + nextHtml;
                    if (!scheduleHtml) { scheduleHtml = '<div class="insight-note">אין מידע תזמון להצגה.</div>'; }
                }

                var componentFormHtml = '';
                if (goalComponentFormFor === goal.id) {
                    componentFormHtml = buildComponentFormHtml(goal.id, goalComponentEditingId ? findComponentById(goal, goalComponentEditingId) : null);
                }

                var removeConfirmHtml = '';
                if (goalRemoveComponentConfirm && goalRemoveComponentConfirm.goalId === goal.id) {
                    var compToRemove = findComponentById(goal, goalRemoveComponentConfirm.componentId);
                    if (compToRemove) {
                        removeConfirmHtml = '<div class="goal-inline-confirm">' + escapeHtml('להסיר את הרכיב "' + compToRemove.name + '"?') +
                            '<div class="tx-edit-actions">' +
                            '<button type="button" class="settings-danger-btn" onclick="confirmRemoveComponent()">אישור הסרה</button>' +
                            '<button type="button" class="tx-edit-cancel" onclick="cancelRemoveComponent()">ביטול</button>' +
                            '</div></div>';
                    }
                }

                var archiveConfirmHtml = '';
                if (goalArchiveConfirmId === goal.id) {
                    archiveConfirmHtml = '<div class="goal-inline-confirm">' + (goal.isArchived ? 'לשחזר את היעד מהארכיון?' : 'להעביר את היעד לארכיון?') +
                        '<div class="tx-edit-actions">' +
                        '<button type="button" class="settings-danger-btn" onclick="confirmArchiveToggle(\'' + goal.id + '\')">' + (goal.isArchived ? 'אישור שחזור' : 'אישור העברה לארכיון') + '</button>' +
                        '<button type="button" class="tx-edit-cancel" onclick="cancelArchiveGoal()">ביטול</button>' +
                        '</div></div>';
                }

                var actionsHtml = '';
                if (!componentFormHtml && !removeConfirmHtml && !archiveConfirmHtml) {
                    actionsHtml = '<div class="goal-actions-row">' +
                        '<button type="button" class="cat-edit-btn" onclick="startGoalEdit(\'' + goal.id + '\')">✏️ עריכה</button>' +
                        '<button type="button" class="cat-add-toggle" style="padding:6px 10px;font-size:12px;" onclick="startComponentCreate(\'' + goal.id + '\')">+ הוסף רכיב</button>' +
                        '<button type="button" class="cat-delete-btn" onclick="askArchiveGoal(\'' + goal.id + '\')">' + (goal.isArchived ? '↩️ שחזר מארכיון' : '🗄️ העבר לארכיון') + '</button>' +
                        '</div>';
                }

                bodyHtml = '<div class="goal-body-inner">' + compHtml + scheduleHtml + componentFormHtml + removeConfirmHtml + archiveConfirmHtml + actionsHtml + '</div>';
            }
        }

        return '<div class="goal-card' + (expanded ? ' expanded' : '') + '">' + headHtml + '<div class="goal-body">' + bodyHtml + '</div></div>';
    }

    // Milestone 4 correction: destructive, explicit "reset only the corrupted Goals data" recovery
    // path — the ONE other sanctioned way (besides a restore) to change GOALS_KEY while
    // goalsState.valid is false. Cancel never touches storage (the corrupted raw value is
    // preserved byte-for-byte by construction — nothing is written). Confirm writes a valid
    // serialized empty array and touches no other key, then reloads so every in-memory variable
    // (goalsState/goals included) is re-derived fresh from the now-valid storage state.
    function askResetGoalsIntegrity() {
        goalsIntegrityResetConfirm = true;
        renderGoalsScreenFromRealData();
        pushTransientState('goalsIntegrityReset', cancelResetGoalsIntegrity);
    }
    function cancelResetGoalsIntegrity() {
        goalsIntegrityResetConfirm = false;
        renderGoalsScreenFromRealData();
        consumeTransient('goalsIntegrityReset');
    }
    function confirmResetGoalsIntegrity() {
        try { localStorage.setItem(GOALS_KEY, '[]'); } catch (e) { console.log('שגיאה באיפוס נתוני יעדים'); return; }
        location.reload();
    }

    // Shown INSTEAD OF the normal list/create-form whenever goalsState.valid is false — never a
    // partial/filtered list. Offers exactly the two sanctioned recovery paths: restore a valid
    // Version 2 backup (via the existing, unmodified restore flow in Settings), or explicitly
    // reset only the corrupted Goals data.
    function buildGoalsIntegrityWarningHtml() {
        var actionHtml = goalsIntegrityResetConfirm ?
            ('<div class="goal-inline-confirm">' +
                'לאפס את נתוני היעדים הפגומים? רק נתוני היעדים יימחקו — שאר הנתונים באפליקציה לא ישתנו. לא ניתן לבטל לאחר הביצוע.' +
                '<div class="tx-edit-actions">' +
                    '<button type="button" class="settings-danger-btn" onclick="confirmResetGoalsIntegrity()">אישור איפוס נתוני יעדים</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="cancelResetGoalsIntegrity()">ביטול</button>' +
                '</div></div>') :
            ('<div class="tx-edit-actions"><button type="button" class="settings-danger-btn" onclick="askResetGoalsIntegrity()">אפס נתוני יעדים פגומים</button></div>');
        return '<div class="goal-inline-confirm" style="margin-bottom:0;">' +
            '<div style="font-weight:700;margin-bottom:6px;">⚠️ לא ניתן לטעון את נתוני היעדים</div>' +
            '<div style="font-size:12.5px;line-height:1.6;margin-bottom:8px;">הנתונים השמורים במכשיר זה פגומים או אינם תקינים. כדי למנוע אובדן מידע, הם לא שונו ולא נמחקו. ניתן:</div>' +
            '<ul class="restore-summary-list">' +
                '<li>לשחזר גיבוי גיבוי תקין (Version 2) דרך הגדרות ⟵ נתונים.</li>' +
                '<li>לאפס אך ורק את נתוני היעדים הפגומים (פעולה בלתי הפיכה).</li>' +
            '</ul>' +
            actionHtml +
        '</div>';
    }

    function renderGoalsScreenFromRealData() {
        var activeBtn = document.getElementById('goals-filter-active');
        var archivedBtn = document.getElementById('goals-filter-archived');
        if (activeBtn) { activeBtn.classList.toggle('active', !goalsShowArchived); }
        if (archivedBtn) { archivedBtn.classList.toggle('active', goalsShowArchived); }

        var createArea = document.getElementById('goal-create-form-area');
        var listEl = document.getElementById('goals-list-area');

        if (!goalsState.valid) {
            if (createArea) { createArea.innerHTML = ''; }
            if (listEl) { listEl.innerHTML = buildGoalsIntegrityWarningHtml(); }
            updateFabVisibility();
            return;
        }

        if (createArea) { createArea.innerHTML = goalCreateFormOpen ? buildGoalFormHtml(null) : ''; }

        if (listEl) {
            var visible = [];
            for (var i = 0; i < goals.length; i++) { if (!!goals[i].isArchived === goalsShowArchived) { visible.push(goals[i]); } }

            if (visible.length === 0) {
                if (goalsShowArchived) {
                    listEl.innerHTML = '<div class="insight-note" style="text-align:center;padding:12px 4px;">אין יעדים בארכיון.</div>';
                } else if (!goalCreateFormOpen) {
                    listEl.innerHTML = '<div class="insight-note" style="text-align:center;padding:12px 4px;">עדיין אין יעדי חיסכון פעילים.<br>הוסף/י יעד ראשון כדי להתחיל לעקוב אחרי חיסכון והעברות חודשיות.</div>' +
                        '<div class="tx-edit-actions" style="justify-content:center;"><button type="button" class="tx-edit-save" style="flex:none;padding:11px 22px;" onclick="startGoalCreate()">הוסף יעד ראשון</button></div>';
                } else {
                    listEl.innerHTML = '';
                }
            } else {
                var html = '';
                for (var j = 0; j < visible.length; j++) { html += buildGoalCardHtml(visible[j]); }
                listEl.innerHTML = html;
            }
        }

        updateFabVisibility();
    }

    // =====================================================================================
    // ===== Milestone 5: consolidated monthly Goals reminder — in-app modal only. No browser/  =====
    // ===== OS notification, no service worker, no background timer of any kind exists         =====
    // ===== anywhere in this file; the reminder is checked ONLY at points the app is already    =====
    // ===== actively running (page load, right after creating a new goal).                     =====
    // =====================================================================================

    // Atomic ledger write: builds a FULL deep-cloned copy of `goals` with every affected goal's
    // new ledger record already appended, attempts ONE localStorage.setItem with that complete
    // proposed state, and only reassigns the live `goals`/`goalsState.goals` references if that
    // single write actually succeeded. On failure, the live in-memory `goals` array is never
    // touched at all — it still points at the exact pre-attempt objects — so "preserve the
    // previous in-memory and stored state, create no partial ledger update" holds by
    // construction, not by manual rollback bookkeeping. `allocations` is an array of
    // {goalId, amount} with amount already guaranteed > 0 by every caller.
    function commitConfirmedTransfers(allocations, source) {
        if (!goalsState.valid) { return { ok: false, error: 'לא ניתן לעדכן יעדים בעוד הנתונים המקומיים פגומים.' }; }
        if (!allocations || allocations.length === 0) { return { ok: false, error: 'לא נמצא סכום חיובי לרישום.' }; }

        var period = getCurrentReminderPeriod();
        var todayD = todayStr();
        var nowIso = nowIsoTimestamp();

        var proposed;
        try { proposed = JSON.parse(JSON.stringify(goals)); } catch (e) { return { ok: false, error: 'שגיאה בהכנת הנתונים לשמירה.' }; }

        var touchedAny = false;
        for (var i = 0; i < allocations.length; i++) {
            var alloc = allocations[i];
            if (!(alloc.amount > 0) || !isFinite(alloc.amount)) { continue; }
            var target = null;
            for (var j = 0; j < proposed.length; j++) { if (proposed[j].id === alloc.goalId) { target = proposed[j]; break; } }
            if (!target) { continue; }
            if (!Array.isArray(target.confirmedTransfers)) { target.confirmedTransfers = []; }
            target.confirmedTransfers.push({
                id: generateGoalsId('ct'),
                amount: round2(alloc.amount),
                date: todayD,
                confirmedAt: nowIso,
                reminderPeriod: period,
                source: 'goals_reminder'
            });
            target.updatedAt = nowIso;
            touchedAny = true;
        }
        if (!touchedAny) { return { ok: false, error: 'לא נמצא סכום חיובי לרישום.' }; }

        var serialized;
        try { serialized = JSON.stringify(proposed); } catch (e) { return { ok: false, error: 'שגיאה בהכנת הנתונים לשמירה.' }; }
        try {
            localStorage.setItem(GOALS_KEY, serialized);
        } catch (e) {
            return { ok: false, error: 'השמירה נכשלה — ייתכן שאין מספיק מקום אחסון במכשיר. הנתונים הקודמים נשמרו ללא שינוי.' };
        }
        goals = proposed;
        goalsState = { valid: true, raw: serialized, goals: proposed };
        return { ok: true };
    }

    function focusFirstReminderElement() {
        var titleEl = document.getElementById('goals-reminder-title');
        if (titleEl) { titleEl.focus(); }
    }

    function handleGoalsReminderKeydown(e) {
        if (!reminderOpen) { return; }
        if (e.key === 'Escape') {
            // Approved, documented choice: Escape follows the SAME session-only postpone
            // semantics as "הזכר לי מאוחר יותר" — it never confirms a transfer, only closes the
            // dialog for the rest of this session (see postponeGoalsReminder()).
            e.preventDefault();
            postponeGoalsReminder();
            return;
        }
        if (e.key === 'Tab') {
            var card = document.getElementById('goals-reminder-card');
            if (!card) { return; }
            var focusable = card.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) { return; }
            var first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }

    function openGoalsReminderOverlayWithList(dueList) {
        reminderDueList = dueList;
        reminderMode = 'summary';
        reminderCustomAmounts = {};
        reminderErrorMessage = null;
        reminderOpen = true;
        reminderPreviouslyFocusedEl = document.activeElement;
        renderGoalsReminderOverlay();
        var overlay = document.getElementById('goals-reminder-overlay');
        if (overlay) { overlay.classList.add('open'); }
        document.addEventListener('keydown', handleGoalsReminderKeydown, true);
        focusFirstReminderElement();
        // Version 1.4.1: Back postpones this reminder exactly like "הזכר לי מאוחר יותר" (calls
        // the very same postponeGoalsReminder — never confirms a transfer, never writes a ledger
        // record). Whichever path actually closes the overlay (postpone, full confirm, custom
        // confirm), closeGoalsReminderOverlay() below is always the one function that runs, and
        // it always calls consumeTransient() — so a confirm click ALSO consumes this same history
        // entry (without invoking postponeGoalsReminder's own logic a second time).
        pushTransientState('reminder', postponeGoalsReminder);
    }

    function closeGoalsReminderOverlay() {
        reminderOpen = false;
        // Cleared so a stray/re-entrant call to a confirm handler AFTER the dialog has already
        // closed (e.g. a second click event that was already queued before the button became
        // disabled) has nothing left to act on — see the reminderOpen guard at the top of both
        // confirm handlers below, which is the primary defense; this is the second layer.
        reminderDueList = [];
        var overlay = document.getElementById('goals-reminder-overlay');
        if (overlay) { overlay.classList.remove('open'); }
        document.removeEventListener('keydown', handleGoalsReminderKeydown, true);
        if (reminderPreviouslyFocusedEl && document.body.contains(reminderPreviouslyFocusedEl)) {
            try { reminderPreviouslyFocusedEl.focus(); } catch (e) { }
        }
        reminderPreviouslyFocusedEl = null;
        consumeTransient('reminder');
    }

    function reminderSuppressionToken(goalId) {
        return getCurrentReminderPeriod() + '::' + goalId;
    }

    // Marks every goal currently in `reminderDueList` as suppressed for the current reminder
    // period — called by BOTH postpone (nothing was written) and a successful confirm (something
    // WAS written for at least one of them, but not necessarily all — see custom allocation). A
    // goal that received a positive ledger record this period is already excluded on its own by
    // isGoalHandledForPeriod(); this additionally covers the custom-allocation case where an
    // entered goal was deliberately left at 0 — it has no ledger record and would otherwise still
    // read as "due" and reopen on the very next navigation-triggered check, which must not happen
    // mid-session (only a fresh reload may bring it back). Must be called BEFORE
    // closeGoalsReminderOverlay() clears reminderDueList.
    function suppressReminderDueList() {
        for (var i = 0; i < reminderDueList.length; i++) {
            reminderSuppressedTokens[reminderSuppressionToken(reminderDueList[i].goal.id)] = true;
        }
    }

    // "הזכר לי מאוחר יותר" AND Escape both call this. Writes nothing, changes no saved amount, no
    // reminder-period completion state — purely closes the dialog for the remainder of THIS
    // session, and only for the goals it was actually showing (reminderSuppressedTokens is an
    // in-memory var only, never persisted).
    function postponeGoalsReminder() {
        suppressReminderDueList();
        closeGoalsReminderOverlay();
    }

    // Milestone 5 trigger check — the ONLY place the reminder ever opens itself automatically.
    // Called once at initial page load and once right after a new goal is successfully created.
    // Deliberately NOT wired into showScreen()/navigation, so ordinary screen changes during a
    // session never reopen it, per the approved "must not repeatedly reopen during ordinary
    // navigation" requirement — once shown and dismissed by ANY exit path (postpone, full
    // confirm, or a partial/custom confirm that leaves some goals still at zero), it stays closed
    // until the next fresh application opening.
    function checkAndShowGoalsReminder() {
        if (reminderOpen) { return; }
        if (!goalsState.valid) { return; }
        var due = getGoalsDueForReminder();
        var eligible = [];
        for (var i = 0; i < due.length; i++) {
            if (!reminderSuppressedTokens[reminderSuppressionToken(due[i].goal.id)]) { eligible.push(due[i]); }
        }
        if (eligible.length === 0) { return; }
        openGoalsReminderOverlayWithList(eligible);
    }

    function switchReminderToCustomMode() {
        reminderMode = 'custom';
        reminderErrorMessage = null;
        for (var i = 0; i < reminderDueList.length; i++) {
            var item = reminderDueList[i];
            reminderCustomAmounts[item.goal.id] = String(item.info.suggestedTotal);
        }
        renderGoalsReminderOverlay();
        focusFirstReminderElement();
    }

    function cancelReminderCustomMode() {
        reminderMode = 'summary';
        reminderErrorMessage = null;
        renderGoalsReminderOverlay();
        focusFirstReminderElement();
    }

    // Live per-row update without a full re-render — same "never lose focus/cursor mid-type"
    // convention already used elsewhere in this file (see updateReminderAmount() precedent from
    // the Milestone 2 design pass). Only patches this row's warning text and the shared total.
    function updateReminderCustomAmount(goalId, rawVal) {
        reminderCustomAmounts[goalId] = rawVal;
        var totalEl = document.getElementById('reminder-custom-total-amount');
        var total = 0;
        for (var i = 0; i < reminderDueList.length; i++) {
            var v = parseFloat(reminderCustomAmounts[reminderDueList[i].goal.id]);
            if (isFinite(v) && v > 0) { total = round2(total + v); }
        }
        if (totalEl) { totalEl.textContent = formatHomeCurrency(total); }

        var inputEl = document.querySelector('.reminder-custom-input[data-goal-id="' + goalId + '"]');
        var warnEl = document.getElementById('reminder-custom-warn-' + goalId);
        var item = null;
        for (var j = 0; j < reminderDueList.length; j++) { if (reminderDueList[j].goal.id === goalId) { item = reminderDueList[j]; break; } }
        var n = parseFloat(rawVal);
        var overRemaining = item && isFinite(n) && n > item.info.remaining;
        if (inputEl) { inputEl.classList.toggle('invalid', rawVal !== '' && (!isFinite(n) || n < 0)); }
        if (warnEl) { warnEl.style.display = overRemaining ? '' : 'none'; }
    }

    // Primary confirmation: "העברתי את הסכום המומלץ" — writes the EXACT already-calculated
    // suggestedTotal for every goal in reminderDueList, one ledger record per goal, never an
    // implicit even split of one combined number. Guarded against duplicate submission by the
    // reminderWriteInProgress flag PLUS immediately disabling the button as the very first DOM
    // action, before any async-feeling work happens (the write itself is synchronous, but this
    // also protects against a theoretical rapid double-dispatch of the click event).
    function confirmReminderFullTransfer() {
        // Primary duplicate-submission guard: a stray re-invocation (a second click event already
        // queued before the button was disabled, a repeated Enter keypress, etc.) after the FIRST
        // call already completed successfully finds reminderOpen already false (set by
        // closeGoalsReminderOverlay()) and reminderDueList already emptied — there is nothing left
        // for it to act on, so it no-ops instead of writing a second ledger record per goal.
        if (reminderWriteInProgress || !reminderOpen || reminderDueList.length === 0) { return; }
        var btn = document.getElementById('reminder-confirm-full-btn');
        var otherBtn = document.getElementById('reminder-confirm-custom-open-btn');
        reminderWriteInProgress = true;
        if (btn) { btn.disabled = true; }
        if (otherBtn) { otherBtn.disabled = true; }

        var allocations = [];
        for (var i = 0; i < reminderDueList.length; i++) {
            var item = reminderDueList[i];
            if (item.info.suggestedTotal > 0) { allocations.push({ goalId: item.goal.id, amount: item.info.suggestedTotal }); }
        }
        var result = commitConfirmedTransfers(allocations, 'goals_reminder');
        reminderWriteInProgress = false;

        if (!result.ok) {
            if (btn) { btn.disabled = false; }
            if (otherBtn) { otherBtn.disabled = false; }
            reminderErrorMessage = result.error;
            renderGoalsReminderOverlay();
            return;
        }
        suppressReminderDueList();
        closeGoalsReminderOverlay();
        renderGoalsScreenFromRealData();
    }

    // Different-amount confirmation: validates every entered value first (finite, non-negative —
    // zero is explicitly allowed per-goal, meaning "not funded this period"), rejects only if
    // EVERY entered amount is zero (nothing to write at all), then writes exactly one ledger
    // record per goal with a positive entered amount — a zero-amount goal is left untouched
    // (still pending, returns on the next fresh opening) and never silently clamped/altered.
    function confirmReminderCustomAllocation() {
        // Same primary duplicate-submission guard as confirmReminderFullTransfer() — see there.
        if (reminderWriteInProgress || !reminderOpen || reminderDueList.length === 0) { return; }
        var allocations = [];
        var anyInvalid = false;
        for (var i = 0; i < reminderDueList.length; i++) {
            var goalId = reminderDueList[i].goal.id;
            var raw = reminderCustomAmounts[goalId];
            var n = parseFloat(raw);
            if (raw === undefined || raw === '' || !isFinite(n) || n < 0) { anyInvalid = true; continue; }
            if (n > 0) { allocations.push({ goalId: goalId, amount: round2(n) }); }
        }
        if (anyInvalid) {
            reminderErrorMessage = 'נא להזין סכום תקין (0 ומעלה) עבור כל יעד.';
            renderGoalsReminderOverlay();
            return;
        }
        if (allocations.length === 0) {
            reminderErrorMessage = 'כל הסכומים שהוזנו הם אפס — לא נרשמה אף העברה. ניתן להזין סכום חיובי לפחות עבור יעד אחד, או לסגור ולנסות שוב מאוחר יותר.';
            renderGoalsReminderOverlay();
            return;
        }

        var btn = document.getElementById('reminder-confirm-custom-btn');
        reminderWriteInProgress = true;
        if (btn) { btn.disabled = true; }
        var result = commitConfirmedTransfers(allocations, 'goals_reminder');
        reminderWriteInProgress = false;

        if (!result.ok) {
            if (btn) { btn.disabled = false; }
            reminderErrorMessage = result.error;
            renderGoalsReminderOverlay();
            return;
        }
        suppressReminderDueList();
        closeGoalsReminderOverlay();
        renderGoalsScreenFromRealData();
    }

    function renderGoalsReminderOverlay() {
        var card = document.getElementById('goals-reminder-card');
        if (!card) { return; }
        if (!reminderOpen || reminderDueList.length === 0) { card.innerHTML = ''; return; }

        var errorHtml = reminderErrorMessage ? ('<div class="reminder-error-box">' + escapeHtml(reminderErrorMessage) + '</div>') : '';

        if (reminderMode === 'custom') {
            var rowsHtml = '';
            var liveTotal = 0;
            for (var i = 0; i < reminderDueList.length; i++) {
                var item = reminderDueList[i];
                var val = (reminderCustomAmounts[item.goal.id] !== undefined) ? reminderCustomAmounts[item.goal.id] : String(item.info.suggestedTotal);
                var vNum = parseFloat(val);
                if (isFinite(vNum) && vNum > 0) { liveTotal = round2(liveTotal + vNum); }
                var overRemaining = isFinite(vNum) && vNum > item.info.remaining;
                rowsHtml += '<div class="reminder-custom-row">' +
                    '<div class="reminder-custom-label">' +
                        '<div class="reminder-custom-name">' + escapeHtml(item.goal.title) + '</div>' +
                        '<div class="reminder-custom-hint">נותר ביעד: ' + escapeHtml(formatHomeCurrency(item.info.remaining)) + '</div>' +
                        '<div class="reminder-custom-warn" id="reminder-custom-warn-' + item.goal.id + '" style="display:' + (overRemaining ? '' : 'none') + ';">הסכום גבוה מהיתרה הנדרשת ליעד זה</div>' +
                    '</div>' +
                    '<input type="number" class="reminder-custom-input" data-goal-id="' + item.goal.id + '" min="0" step="0.01" value="' + escapeHtml(val) + '" oninput="updateReminderCustomAmount(\'' + item.goal.id + '\', this.value)" aria-label="' + escapeHtml('סכום עבור ' + item.goal.title) + '">' +
                '</div>';
            }
            card.innerHTML =
                '<div class="reminder-icon">✏️</div>' +
                '<div class="reminder-title" id="goals-reminder-title" tabindex="-1">עדכון סכום שהועבר בפועל</div>' +
                '<div class="reminder-subtitle">ניתן לעדכן כל יעד בנפרד, כולל הזנת 0 עבור יעד שלא מומן החודש.</div>' +
                rowsHtml +
                '<div class="reminder-total-row"><span>סה״כ</span><span class="reminder-total-amount" id="reminder-custom-total-amount">' + escapeHtml(formatHomeCurrency(liveTotal)) + '</span></div>' +
                errorHtml +
                '<div class="reminder-actions">' +
                    '<button type="button" class="reminder-btn-primary" id="reminder-confirm-custom-btn" onclick="confirmReminderCustomAllocation()">אישור הקצאה</button>' +
                    '<button type="button" class="reminder-btn-secondary" onclick="cancelReminderCustomMode()">חזרה לסיכום</button>' +
                '</div>' +
                '<div class="reminder-fineprint">האפליקציה אינה מבצעת את ההעברה בפועל — אישור זה מתעד שההעברה בוצעה על ידך מחוץ לאפליקציה.</div>';
            return;
        }

        var goalsHtml = '';
        var grandTotal = 0;
        for (var g = 0; g < reminderDueList.length; g++) {
            var it = reminderDueList[g];
            grandTotal = round2(grandTotal + it.info.suggestedTotal);
            var overdueLine = it.info.overdueAmount > 0 ?
                ('<div class="reminder-goal-sub danger">מתוכם ' + escapeHtml(formatHomeCurrency(it.info.overdueAmount)) + ' באיחור</div>') : '';
            goalsHtml += '<div class="reminder-goal-row">' +
                '<div class="reminder-goal-row-head">' +
                    '<span class="reminder-goal-name">' + escapeHtml(it.goal.title) + '</span>' +
                    '<span class="reminder-goal-amount">' + escapeHtml(formatHomeCurrency(it.info.suggestedTotal)) + '</span>' +
                '</div>' +
                overdueLine +
                '<div class="reminder-goal-sub">נותר לאחר ההעברה: ' + escapeHtml(formatHomeCurrency(it.info.remainingAfterSuggested)) + '</div>' +
            '</div>';
        }

        card.innerHTML =
            '<div class="reminder-icon">💰</div>' +
            '<div class="reminder-title" id="goals-reminder-title" tabindex="-1">תזכורת חיסכון חודשית</div>' +
            '<div class="reminder-subtitle">יש להעביר את הסכומים הבאים לחשבון החיסכון שלך.</div>' +
            goalsHtml +
            '<div class="reminder-total-row"><span>סה״כ מומלץ להעביר</span><span class="reminder-total-amount">' + escapeHtml(formatHomeCurrency(grandTotal)) + '</span></div>' +
            errorHtml +
            '<div class="reminder-actions">' +
                '<button type="button" class="reminder-btn-primary" id="reminder-confirm-full-btn" onclick="confirmReminderFullTransfer()">העברתי את הסכום המומלץ</button>' +
                '<button type="button" class="reminder-btn-secondary" id="reminder-confirm-custom-open-btn" onclick="switchReminderToCustomMode()">העברתי סכום אחר</button>' +
            '</div>' +
            '<div class="reminder-fineprint">האפליקציה אינה מבצעת את ההעברה בפועל — היא רק רושמת שאישרת שביצעת אותה בעצמך, מחוץ לאפליקציה.</div>' +
            '<div style="text-align:center;"><button type="button" class="reminder-btn-postpone" onclick="postponeGoalsReminder()">הזכר לי מאוחר יותר</button></div>';
    }

    // =====================================================================================
    // ===== Stage E.1 (display-only) → Stage 3ב.2 (full add/rename/delete UI): Settings      =====
    // ===== screen, replacing category-list's original Mock-fed rows with the real            =====
    // ===== categoryConfig loaded above (Stage D.2's loadPreviewCategoryConfig()). As of Stage =====
    // ===== 3ב.2, each row's markup and the add-category area are built by                    =====
    // ===== buildPreviewCategoryRowHtml()/buildPreviewCategoryAddAreaHtml() below, which read   =====
    // ===== the Stage 3ב.2 UI state (previewEditingCategoryKey/previewCategoryAddOpen/          =====
    // ===== previewDeletingCategoryKey) and call the unmodified Stage 3ב.1 logic functions.     =====
    // ===== Still does not touch Home, Transactions, or Insights screens, or MOCK_DATA.        =====
    // =====================================================================================

    // categoryConfig keys are iterated in whatever order Object.keys() returns them (insertion
    // order in practice) — no sorting logic invented.
    function renderCategoriesScreenFromRealData() {
        var html = '';
        var keys = Object.keys(categoryConfig || {});
        for (var i = 0; i < keys.length; i++) {
            html += buildPreviewCategoryRowHtml(keys[i]);
        }
        html += buildPreviewCategoryAddAreaHtml();
        document.getElementById('category-list').innerHTML = html;
    }

    // Called once, after items/categoryConfig and the two renders above — same ordering
    // guarantee, no code moved.
    renderCategoriesScreenFromRealData();

    // Version 1.1, Stage 4.0.3: the new, separate Settings screen — see
    // renderSettingsScreenFromRealData() further below (Stage 4.0.3 section) for the full
    // implementation; declared as a function statement so this forward reference is safe (same
    // hoisting pattern used throughout this file).
    renderSettingsScreenFromRealData();

    // =====================================================================================
    // ===== Stage E.2: Transactions screen only — replaces transactions-list's Mock-fed    =====
    // ===== rows with real items from Preview data (items, loaded above via Stage D.2's     =====
    // ===== loadPreviewItems()), and makes the active/archived filter functional (previously =====
    // ===== cosmetic-only: setTxFilter() only toggled the button's CSS class). Reuses         =====
    // ===== mapItemToHomeTxRow()/renderTxList() unchanged from Stage D.5 — same row markup,   =====
    // ===== same icon/date/amount conventions already established and tested for Home's       =====
    // ===== recent-activity-list. Search stays disabled (out of scope for this stage; the      =====
    // ===== input's `disabled` attribute in the HTML is untouched). Display only: no add/      =====
    // ===== edit/archive/restore/delete logic, no localStorage writes of its own.              =====
    // =====================================================================================

    // `id` is assigned as Date.now() at creation in the real app (see addNewItem() in
    // index.html) and items are always appended via items.push() — so `id` order already matches
    // insertion/chronological order for every real item, regardless of type. This is the same
    // convention getRecentActivity() (Stage C) already relies on implicitly (array order); sorting
    // explicitly by `id` here (rather than trusting array order) is a defensive equivalent that's
    // needed because this renders the FULL filtered list, not just a slice off the end. Crucially,
    // `id` exists on every item type (unlike `start`, which income/fixed items don't have at
    // all) — so this is a safe, universal chronological key that never depends on a type-specific
    // date field being present. A missing/non-numeric `id` (corrupt data) is treated as 0 (sorts
    // as the oldest possible item) rather than producing NaN-driven order or throwing.
    function safeItemId(item) {
        var n = item && item.id;
        return (typeof n === 'number' && isFinite(n)) ? n : 0;
    }

    // Filters by isArchived to match the real app's own convention exactly (currentView
    // active/archived test in renderAll(): `(currentView === 'active' && !item.isArchived) ||
    // (currentView === 'archived' && item.isArchived)`) — a missing/undefined `isArchived` on a
    // malformed item is treated as falsy (active), same as `!item.isArchived` would evaluate.
    // Sorted newest-first (descending `id`) — the same "most recent first" direction
    // getRecentActivity()'s `.slice(-n).reverse()` already shows for the Home screen, kept
    // consistent here. mapItemToHomeTxRow() (Stage D.5, unchanged) converts each real item into
    // the exact {icon,title,date,amount,type} shape renderTxList() already expects; items with no
    // `start` (income/fixed) fall back to '-' for the date column via that same existing function
    // — no new date-formatting logic invented here.
    // Stage G.2.6: renders via renderTxListWithActions() (Stage G.2.4/G.2.5) instead of plain
    // renderTxList() — this is the ONLY change in this function, and the only place in the whole
    // file where renderTxListWithActions() is actually invoked. renderHomeScreenFromRealData()
    // (recent-activity-list) still calls plain renderTxList() and is completely untouched, so the
    // ⋮ menu appears on the Transactions screen only, per the approved decision.
    // Version 1.1, Stage 3.6: the Transactions screen's own title reflects whether it's currently
    // a category page or the general list — "תנועות" with no filter, the category's own label
    // (emoji included, unlike the Home tiles' stripped display) while one is active. Called from
    // inside renderTransactionsScreenFromRealData(), after that function's own stale-filter
    // self-heal, so this never shows a deleted category's name.
    function updateTransactionsScreenTitle() {
        var titleEl = document.getElementById('transactions-screen-title');
        if (!titleEl) { return; }
        var cfg = (currentCategoryFilterKey !== null) ? categoryConfig[currentCategoryFilterKey] : null;
        var label = (cfg && typeof cfg.label === 'string' && cfg.label) ? cfg.label : currentCategoryFilterKey;
        titleEl.textContent = cfg ? label : 'תנועות';
    }

    function renderTransactionsScreenFromRealData(filterName) {
        // Version 1.4.1 correction: this rebuild recreates the row-menu dropdown DOM from scratch
        // (discarding any 'open' class along with it) WITHOUT going through closeAllRowMenus() —
        // e.g. after archivePreviewItem()/unarchivePreviewItem(). Defensive safety net so an open
        // 'rowMenu' history entry is never left stranded when that happens.
        consumeTransient('rowMenu');
        // Version 1.1, Stage 1: self-heal a stale category filter (e.g. the category was deleted
        // from Settings in the meantime) — categoryHasPreviewItems() already blocks deleting a
        // category that still has items, so this only ever clears a filter that would otherwise
        // show a permanently-empty list with no way back to "all categories" from the UI.
        if (currentCategoryFilterKey !== null && !categoryConfig[currentCategoryFilterKey]) {
            currentCategoryFilterKey = null;
        }
        updateTransactionsScreenTitle();

        var wantArchived = (filterName === 'archived');
        var filtered = items.filter(function (it) {
            return !!(it && it.isArchived) === wantArchived;
        });
        if (currentCategoryFilterKey !== null) {
            filtered = filtered.filter(function (it) {
                var cKey = (it && it.displayCategory) || (it && it.type);
                if (!categoryConfig[cKey]) { cKey = it.type; }
                return cKey === currentCategoryFilterKey;
            });
        }
        filtered.sort(function (a, b) { return safeItemId(b) - safeItemId(a); });
        renderTxListWithActions('transactions-list', filtered.map(mapItemToHomeTxRow));
        renderCategoryFilterIndicator();
        // Version 1.1, Stage 3: single choke point for FAB visibility on this screen — covers the
        // stale-filter self-heal above, an explicit filter change (filterTransactionsByCategory()/
        // clearCategoryFilter()), and every render triggered by renderAllPreviewScreens() after a
        // mutation, without each of those call sites needing its own updateFabVisibility() call.
        updateFabVisibility();
    }

    // Called once, after items/categoryConfig and the renders above — same ordering guarantee.
    // 'active' matches the filter button that already has the `active` CSS class by default in
    // the HTML (filter-active), so the initial render matches the initially-selected filter.
    renderTransactionsScreenFromRealData('active');

    // =====================================================================================
    // ===== Stage G.1 (originally Preview-only, now Stage 4.4 candidate): write               =====
    // ===== infrastructure. savePreviewItems()/savePreviewCategoryConfig() mirror index.html's =====
    // ===== own saveToLocalStorage()/saveConfigToLocalStorage() exactly (same JSON.stringify +  =====
    // ===== try/catch shape), and write to DATA_KEY/CONFIG_KEY — the real                      =====
    // ===== family_finance_data/family_finance_cat_config keys directly, no other key.          =====
    // ===== renderAllPreviewScreens() re-runs the 5 existing real-data render functions in      =====
    // ===== sequence; none of their internal logic is changed.                                  =====
    // =====================================================================================

    function savePreviewItems() {
        try { localStorage.setItem(DATA_KEY, JSON.stringify(items)); } catch (e) { console.log('שגיאה בשמירת נתונים'); }
    }

    function savePreviewCategoryConfig() {
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(categoryConfig)); } catch (e) { console.log('שגיאה בשמירת תצורת קטגוריות'); }
    }

    // Mirrors setTxFilter()'s own DOM-based selection — there is no separate JS variable
    // anywhere in this file tracking which filter is currently active. Reads which filter
    // button currently has the 'active' CSS class, defaulting to 'active' if neither is found
    // (the same default the initial page-load render above already uses). Read-only DOM query;
    // does not add new persisted state and does not change any existing function.
    function getCurrentTxFilterName() {
        var archivedBtn = document.getElementById('filter-archived');
        return (archivedBtn && archivedBtn.classList.contains('active')) ? 'archived' : 'active';
    }

    // =====================================================================================
    // ===== Version 1.1, Stage 1: Home screen automatic category tiles — order persistence,  =====
    // ===== rendering, click-to-filter, and long-press drag-to-reorder. Additive only: does   =====
    // ===== not touch items/categoryConfig, DATA_KEY, or CONFIG_KEY. Tile order is stored      =====
    // ===== under its own new key (CATEGORY_TILE_ORDER_KEY) so it never collides with, and     =====
    // ===== never needs to be read by, the existing data/config structures.                    =====
    // =====================================================================================

    // CATEGORY_TILE_ORDER_KEY/categoryTileOrder/categoryTileTotalsCache are declared earlier
    // (alongside items/categoryConfig/currentCategoryFilterKey), before the initial
    // renderHomeScreenFromRealData() call — see the comment there for why.

    function loadCategoryTileOrder() {
        try {
            var raw = localStorage.getItem(CATEGORY_TILE_ORDER_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveCategoryTileOrder(order) {
        try { localStorage.setItem(CATEGORY_TILE_ORDER_KEY, JSON.stringify(order)); } catch (e) { console.log('שגיאה בשמירת סדר אריחי קטגוריות'); }
    }

    // Version 1.1, Stage 3.5: persists the "יתרת הלוואות" stat tile's toggle choice (קרן/סה"כ)
    // under its own dedicated key — never mixed into DATA_KEY/CONFIG_KEY/CATEGORY_TILE_ORDER_KEY.
    // Any stored value other than the literal 'principal' falls back to 'total' (also the default
    // for a first-ever visit, matching the metric this Home screen already showed before this
    // stage via getLoansRemainingSummary — the new "principal-only" breakdown is the one the user
    // has to opt into).
    //
    // Data-restore fix: this key was originally written as a raw, non-JSON-encoded string
    // ('total'/'principal', no quote characters) — every OTHER family_finance_* key is
    // JSON-encoded, and isValidBackupShape() requires every backup value to be JSON.parse-able,
    // so any backup containing this key was rejected outright, even one the app itself had just
    // produced. saveLoanBalanceView() now writes JSON.stringify(view) instead. loadLoanBalanceView()
    // reads the new JSON-encoded form first; if that fails to parse (a legacy raw value already
    // sitting in an existing user's browser), it falls back to treating the raw string itself as
    // the value — read-only, no rewrite-on-read, no migration write, exactly the "lazy fallback,
    // no migration" convention already used elsewhere in this file (e.g. resolveEffectiveDay()).
    function loadLoanBalanceView() {
        try {
            var raw = localStorage.getItem(LOAN_BALANCE_VIEW_KEY);
            var value;
            try { value = JSON.parse(raw); } catch (e) { value = raw; }
            return (value === 'principal') ? 'principal' : 'total';
        } catch (e) {
            return 'total';
        }
    }

    function saveLoanBalanceView(view) {
        try { localStorage.setItem(LOAN_BALANCE_VIEW_KEY, JSON.stringify(view)); } catch (e) { console.log('שגיאה בשמירת מצב תצוגת יתרת הלוואות'); }
    }

    // Reconciles the persisted order against the current categoryConfig: a category present in
    // categoryConfig but missing from the saved order (new category) is appended at the end, in
    // Object.keys(categoryConfig) order; a key present in the saved order but no longer in
    // categoryConfig (deleted category) is dropped. Persists the reconciled order back only when
    // it actually differs from what was stored, so a normal render with nothing to reconcile never
    // triggers an extra write. Version 1.1, Stage 3.5: 'income' is excluded from validKeys — its
    // Home tile was removed by product decision (the hero/snapshot cards already show income), so
    // it self-heals out of any previously-saved order the same way a deleted category already did,
    // and is never re-added even though it still exists (and stays fully usable) in categoryConfig
    // itself — Settings and its own category page are untouched by this exclusion.
    function reconcileCategoryTileOrder() {
        var stored = loadCategoryTileOrder();
        var validKeys = Object.keys(categoryConfig || {}).filter(function (k) { return k !== 'income'; });
        var validSet = {};
        for (var i = 0; i < validKeys.length; i++) { validSet[validKeys[i]] = true; }

        var reconciled = [];
        var seen = {};
        for (var j = 0; j < stored.length; j++) {
            var k = stored[j];
            if (validSet[k] && !seen[k]) { reconciled.push(k); seen[k] = true; }
        }
        for (var m = 0; m < validKeys.length; m++) {
            var vk = validKeys[m];
            if (!seen[vk]) { reconciled.push(vk); seen[vk] = true; }
        }

        var changed = (reconciled.length !== stored.length) || reconciled.some(function (key, idx) { return key !== stored[idx]; });
        if (changed) { saveCategoryTileOrder(reconciled); }
        categoryTileOrder = reconciled;
        return reconciled;
    }

    function getHomeTileDisplayLabel(key, cfg) {
        if (HOME_TILE_LABEL_OVERRIDE_BY_KEY[key]) { return HOME_TILE_LABEL_OVERRIDE_BY_KEY[key]; }
        var label = (cfg && typeof cfg.label === 'string' && cfg.label) ? cfg.label : key;
        return label.replace(HOME_TILE_LEADING_EMOJI_RE, '');
    }

    // Version 1.1, Stage 3.5, item 6 ("הכנה לעתיד"): both new stat tiles already call this single
    // handler on click, so a future stage can open a detail screen per `statId` without touching
    // this stage's markup/CSS again. Deliberately empty for now — no action, no message, no
    // navigation.
    function handleStatTileClick(statId) {
    }

    // Version 1.1, Stage 3.5: "יתרת תשלומים שונים" — a plain, non-draggable .stat-tile (see its CSS
    // comment for why it's not .category-tile), rendered immediately after the 'variable' category
    // tile so it always sits next to it regardless of drag history.
    function buildVariableRemainingStatTileHtml() {
        var amount = formatHomeCurrency(categoryTileVariableRemainingCache);
        return '<div class="stat-tile" role="button" tabindex="0" aria-label="יתרת תשלומים שונים" ' +
            'onclick="handleStatTileClick(\'variable-remaining\')" ' +
            'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();handleStatTileClick(\'variable-remaining\');}">' +
            '<div class="category-tile-icon"></div>' +
            '<div class="category-tile-label">יתרת תשלומים שונים</div>' +
            '<div class="category-tile-value">' + amount + '</div>' +
        '</div>';
    }

    // Version 1.1, Stage 3.5: "יתרת הלוואות" — same non-draggable .stat-tile treatment, plus a
    // small קרן/סה"כ toggle. The toggle buttons stop propagation so tapping them never also fires
    // the tile's own (currently no-op) click handler, same convention already used elsewhere in
    // this file for a nested button inside a clickable row/card.
    function buildLoanBalanceStatTileHtml() {
        var isPrincipal = (loanBalanceView === 'principal');
        var shownAmount = isPrincipal ? categoryTileLoanBalanceCache.principal : categoryTileLoanBalanceCache.total;
        var amount = formatHomeCurrency(shownAmount);
        return '<div class="stat-tile" role="button" tabindex="0" aria-label="יתרת הלוואות" ' +
            'onclick="handleStatTileClick(\'loan-balance\')" ' +
            'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();handleStatTileClick(\'loan-balance\');}">' +
            '<div class="category-tile-icon"></div>' +
            '<div class="category-tile-label">יתרת הלוואות</div>' +
            '<div class="category-tile-value">' + amount + '</div>' +
            '<div class="stat-tile-toggle">' +
            '<button type="button" class="stat-tile-toggle-btn' + (isPrincipal ? ' active' : '') + '" onclick="event.stopPropagation(); setLoanBalanceView(\'principal\')">קרן</button>' +
            '<button type="button" class="stat-tile-toggle-btn' + (!isPrincipal ? ' active' : '') + '" onclick="event.stopPropagation(); setLoanBalanceView(\'total\')">סה"כ</button>' +
            '</div></div>';
    }

    // Version 1.1, Stage 3.5: switches the "יתרת הלוואות" tile's toggle and persists the choice.
    // Reuses renderCategoryTileGridOnly() (Stage 1) as-is to redraw the grid from the already-
    // cached order/totals — this toggle never changes which categories are shown or their amounts,
    // so no reconciliation or recomputation is needed.
    function setLoanBalanceView(view) {
        loanBalanceView = (view === 'principal') ? 'principal' : 'total';
        saveLoanBalanceView(loanBalanceView);
        renderCategoryTileGridOnly();
    }

    // Builds the grid markup for a given order + totals snapshot — used both by the full render
    // below and by the lightweight in-drag re-render, which reuses the same cached totals rather
    // than recomputing them on every pointermove. Version 1.1, Stage 3.5: no longer renders any
    // emoji (the icon circle is kept, empty, to preserve the tile's existing layout/design exactly
    // — only its emoji content is dropped); inserts the two new stat tiles right after their
    // sibling category ('variable'/'loan') regardless of where those fall in `order`.
    function renderCategoryTileGridHtml(order, totals) {
        var html = '';
        for (var i = 0; i < order.length; i++) {
            var key = order[i];
            var cfg = categoryConfig[key];
            if (!cfg) { continue; }
            var rawTotal = totals[key] || 0;
            // Credit-card tile correction: the default "💳 חיוב כרטיס אשראי" category (built-in key
            // 'dated' specifically — never the user's own separately-created "כרטיסי אשראי"
            // category, which keeps the rule below unchanged) always shows a tile, with an honest
            // "הזן חיוב" placeholder instead of a permanent ₪0 when nothing was charged yet — never
            // hidden. Any OTHER dated-baseType category (the user's own, or a future custom one)
            // keeps the prior Version 1.4.2 behavior: no tile at all when nothing was charged this
            // month, rather than a permanent ₪0.
            if (key !== 'dated' && cfg.baseType === 'dated' && !rawTotal) { continue; }
            var amount = (key === 'dated' && !rawTotal) ? 'הזן חיוב' : formatHomeCurrency(rawTotal);
            var safeKey = escapeHtml(key);
            var label = getHomeTileDisplayLabel(key, cfg);
            // Credit-card tile correction (Version 1.4.6): the built-in settlement tile only (key
            // 'dated' specifically — never a custom dated-baseType category, same distinction
            // isBuiltinCreditCardSettlement() draws for items) additionally shows a large, centered
            // amount and an "עודכן:" line sourced from appSettings.creditCardSettlementUpdatedAt —
            // set only by a successful add/edit to this category (see addPreviewItem()/
            // savePreviewInlineEdit()), never by delete, never the charge date or "today". Title and
            // icon markup are otherwise byte-identical to every other tile.
            if (key === 'dated') {
                html += '<div class="category-tile" data-category-key="' + safeKey + '">' +
                    '<div class="category-tile-icon"></div>' +
                    '<div class="category-tile-label">' + escapeHtml(label) + '</div>' +
                    '<div class="category-tile-value credit-settlement-amount">' + amount + '</div>' +
                    '<div class="credit-settlement-updated">' + escapeHtml(formatCreditSettlementUpdatedLabel(appSettings.creditCardSettlementUpdatedAt)) + '</div>' +
                '</div>';
            } else {
                html += '<div class="category-tile" data-category-key="' + safeKey + '">' +
                    '<div class="category-tile-icon"></div>' +
                    '<div class="category-tile-label">' + escapeHtml(label) + '</div>' +
                    '<div class="category-tile-value">' + amount + '</div>' +
                '</div>';
            }
            if (key === 'variable') { html += buildVariableRemainingStatTileHtml(); }
            if (key === 'loan') { html += buildLoanBalanceStatTileHtml(); }
        }
        return html;
    }

    function renderCategoryTilesFromRealData() {
        var order = reconcileCategoryTileOrder();
        categoryTileTotalsCache = getCategoryMonthlyTotals(items, categoryConfig);
        categoryTileVariableRemainingCache = getVariableRemainingBalance(items);
        categoryTileLoanBalanceCache = getLoansBalanceSummary(items);
        var gridEl = document.getElementById('category-tiles-grid');
        if (gridEl) { gridEl.innerHTML = renderCategoryTileGridHtml(order, categoryTileTotalsCache); }
    }

    // Only rebuilds the grid from the current in-memory categoryTileOrder/categoryTileTotalsCache
    // — no reconciliation, no totals recomputation. Used exclusively while a drag is in progress,
    // so intermediate reorders stay fast and never write to localStorage until the drop.
    function renderCategoryTileGridOnly() {
        var gridEl = document.getElementById('category-tiles-grid');
        if (gridEl) { gridEl.innerHTML = renderCategoryTileGridHtml(categoryTileOrder, categoryTileTotalsCache); }
    }

    // Click (short press, no drag) on a category tile: navigate to Transactions and filter by that
    // category. Does not change the active/archived toggle — combines with whichever is currently
    // selected, matching the approved minimal-scope decision (no forced reset).
    function filterTransactionsByCategory(key) {
        currentCategoryFilterKey = key;
        showScreen('transactions');
        renderTransactionsScreenFromRealData(getCurrentTxFilterName());
    }

    function clearCategoryFilter() {
        // Collapse-on-leave: this is the one path that leaves a category's page (the ✕ on its
        // filter chip) without going through showScreen() — see the identical reasoning there,
        // including the same defensive consumeTransient('txInline') safety net.
        consumeTransient('txInline');
        previewEditingId = null;
        currentCategoryFilterKey = null;
        renderTransactionsScreenFromRealData(getCurrentTxFilterName());
    }

    // Shows/hides the small category-name + monthly-total chip above the Transactions list — this
    // IS the "category page" header (Version 1.1, Stage 3): name, monthly summary, and — new in
    // Stage 3 — the category's own edit/delete actions, which moved here from the Settings list
    // (built-in/has-items restrictions unchanged, still enforced by the same underlying
    // renamePreviewCategory()/deletePreviewCategory() Stage 3ב.1 functions). Called from inside
    // renderTransactionsScreenFromRealData() itself, so it always stays in sync with the filter
    // that function just applied (including the stale-key self-heal at its top). The monthly total
    // is computed fresh via the existing getCategoryMonthlyTotals() (Stage 1) — no new calculation
    // logic, same figures the Home tile for this category shows. Renders one of 3 mutually-
    // exclusive states, mirroring buildPreviewCategoryRowHtml()'s pre-Stage-3 states (delete-
    // confirmation, rename form, normal) — same markup/classes, just reused inside the chip.
    function renderCategoryFilterIndicator() {
        var el = document.getElementById('category-filter-indicator');
        if (!el) { return; }
        if (currentCategoryFilterKey === null || !categoryConfig[currentCategoryFilterKey]) {
            el.innerHTML = '';
            return;
        }
        var key = currentCategoryFilterKey;
        var cfg = categoryConfig[key];
        var label = (cfg && typeof cfg.label === 'string' && cfg.label) ? cfg.label : key;

        if (previewDeletingCategoryKey === key) {
            el.innerHTML = '<div class="category-filter-chip">' +
                '<span class="cat-delete-confirm-text">למחוק קטגוריה זו?</span>' +
                '<div class="cat-row-actions">' +
                '<button type="button" class="cat-confirm-delete-btn" onclick="confirmPreviewDeleteCategory(\'' + key + '\')">אישור מחיקה</button>' +
                '<button type="button" class="cat-cancel-btn" onclick="cancelPreviewDeleteCategory()">ביטול</button>' +
                '</div></div>';
            return;
        }

        if (previewEditingCategoryKey === key) {
            // Version 1.1, Stage 4.0.2: the optional defaultDayOfMonth field, worded per this
            // category's own (fixed, unchangeable-here) baseType — omitted entirely for 'dated'.
            // Pre-filled with the currently stored value only when it's already a valid 1–31
            // number; otherwise left blank (blank reads back as "no default", not as 1 — the
            // field only ever shows a value the category actually has stored).
            var dayFieldHtml = '';
            var dayLabel = getCategoryDefaultDayFieldLabel(cfg.baseType);
            if (dayLabel !== null) {
                var storedDay = cfg.defaultDayOfMonth;
                var dayValueAttr = (typeof storedDay === 'number' && storedDay >= 1 && storedDay <= 31) ? storedDay : '';
                dayFieldHtml = '<div class="tx-edit-group"><label>' + escapeHtml(dayLabel) + ' (אופציונלי)</label><input type="number" id="cat-edit-day-' + key + '" min="1" max="31" value="' + dayValueAttr + '"></div>';
            }
            el.innerHTML = '<div class="tx-edit-form">' +
                '<div class="tx-edit-group"><label>שם קטגוריה</label><input type="text" id="cat-edit-label-' + key + '" value="' + escapeHtml(label) + '"></div>' +
                dayFieldHtml +
                '<div class="tx-edit-actions">' +
                '<button type="button" class="tx-edit-save" onclick="submitPreviewEditCategory(\'' + key + '\')">💾 שמור שינויים</button>' +
                '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewEditCategory()">ביטול</button>' +
                '</div></div>';
            return;
        }

        var monthlyTotal = getCategoryMonthlyTotals(items, categoryConfig)[key] || 0;
        var actionsHtml = '<button type="button" class="cat-edit-btn" onclick="startPreviewEditCategory(\'' + key + '\')">✏️ עריכה</button>';
        if (!isBuiltInPreviewCategoryKey(key)) {
            actionsHtml += '<button type="button" class="cat-delete-btn" onclick="startPreviewDeleteCategory(\'' + key + '\')">🗑️ מחיקה</button>';
        }
        el.innerHTML = '<div class="category-filter-chip"><span>' + escapeHtml(label) + ' — סה"כ החודש: ' + formatHomeCurrency(monthlyTotal) + '</span>' +
            '<div class="cat-row-actions">' + actionsHtml +
            '<button type="button" onclick="clearCategoryFilter()">✕</button>' +
            '</div></div>';
    }

    // ----- Long-press + drag reordering (Pointer Events cover mouse/touch/pen uniformly) -----
    //
    // State machine, per press:
    //   1. pointerdown on a .category-tile starts a CATEGORY_TILE_LONG_PRESS_MS timer.
    //   2. If the pointer moves more than CATEGORY_TILE_MOVE_CANCEL_PX before the timer fires,
    //      the press is cancelled outright — this is a normal scroll/swipe, not a drag attempt,
    //      and nothing is prevented so the browser's native scrolling proceeds untouched.
    //   3. If the timer fires first (no significant movement yet), drag mode engages: the tile
    //      gets a visual '.dragging' class, the grid's touch-action is locked to 'none' (so
    //      subsequent pointermove can safely preventDefault() and take over from native touch
    //      scrolling), and further pointermove calls reorder categoryTileOrder in-memory whenever
    //      the pointer crosses into a different tile's bounding box.
    //   4. On pointerup/pointercancel: if drag mode was ever engaged, the final order is persisted
    //      and the click is suppressed entirely (per the "prevent opening a category when the
    //      action became a drag" requirement) — this holds even for a long-press-then-release
    //      with no actual movement, since drag mode already engaged. Otherwise (short press,
    //      released before the timer fired) it's treated as a genuine tap and navigates.
    var CATEGORY_TILE_LONG_PRESS_MS = 450;
    var CATEGORY_TILE_MOVE_CANCEL_PX = 10;
    var categoryTilePress = null;

    function getCategoryTileIndexAtPoint(clientX, clientY) {
        var tiles = document.querySelectorAll('#category-tiles-grid .category-tile');
        for (var i = 0; i < tiles.length; i++) {
            var rect = tiles[i].getBoundingClientRect();
            if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                return i;
            }
        }
        return -1;
    }

    function cleanupCategoryTilePressListeners() {
        document.removeEventListener('pointermove', onCategoryTilePointerMove);
        document.removeEventListener('pointerup', onCategoryTilePointerUp);
        document.removeEventListener('pointercancel', onCategoryTilePointerUp);
    }

    function onCategoryTilePointerDown(e) {
        var tileEl = e.target.closest ? e.target.closest('.category-tile') : null;
        if (!tileEl) { return; }
        var key = tileEl.getAttribute('data-category-key');
        if (!key) { return; }

        categoryTilePress = {
            key: key,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            tileEl: tileEl,
            timerId: null
        };
        categoryTilePress.timerId = setTimeout(function () {
            if (!categoryTilePress) { return; }
            categoryTilePress.dragging = true;
            if (categoryTilePress.tileEl) { categoryTilePress.tileEl.classList.add('dragging'); }
            var gridEl = document.getElementById('category-tiles-grid');
            if (gridEl) { gridEl.style.touchAction = 'none'; }
        }, CATEGORY_TILE_LONG_PRESS_MS);

        document.addEventListener('pointermove', onCategoryTilePointerMove);
        document.addEventListener('pointerup', onCategoryTilePointerUp);
        document.addEventListener('pointercancel', onCategoryTilePointerUp);
    }

    function onCategoryTilePointerMove(e) {
        if (!categoryTilePress || e.pointerId !== categoryTilePress.pointerId) { return; }

        if (!categoryTilePress.dragging) {
            var dx = e.clientX - categoryTilePress.startX;
            var dy = e.clientY - categoryTilePress.startY;
            if (Math.sqrt(dx * dx + dy * dy) > CATEGORY_TILE_MOVE_CANCEL_PX) {
                // Moved before the long-press engaged: a normal scroll/swipe, not a drag attempt.
                // Nothing was prevented, so native scrolling already proceeded on its own.
                clearTimeout(categoryTilePress.timerId);
                categoryTilePress = null;
                cleanupCategoryTilePressListeners();
            }
            return;
        }

        // Drag mode is active: take over from native touch scrolling.
        e.preventDefault();

        var fromIndex = categoryTileOrder.indexOf(categoryTilePress.key);
        var toIndex = getCategoryTileIndexAtPoint(e.clientX, e.clientY);
        if (fromIndex === -1 || toIndex === -1 || toIndex === fromIndex) { return; }

        categoryTileOrder.splice(fromIndex, 1);
        categoryTileOrder.splice(toIndex, 0, categoryTilePress.key);
        renderCategoryTileGridOnly();

        var refreshedEl = document.querySelector('#category-tiles-grid .category-tile[data-category-key="' + categoryTilePress.key + '"]');
        if (refreshedEl) {
            refreshedEl.classList.add('dragging');
            categoryTilePress.tileEl = refreshedEl;
        }
    }

    function onCategoryTilePointerUp(e) {
        if (!categoryTilePress || e.pointerId !== categoryTilePress.pointerId) { return; }

        var wasDragging = categoryTilePress.dragging;
        var key = categoryTilePress.key;

        clearTimeout(categoryTilePress.timerId);
        if (categoryTilePress.tileEl) { categoryTilePress.tileEl.classList.remove('dragging'); }
        var gridEl = document.getElementById('category-tiles-grid');
        if (gridEl) { gridEl.style.touchAction = ''; }

        categoryTilePress = null;
        cleanupCategoryTilePressListeners();

        if (wasDragging) {
            saveCategoryTileOrder(categoryTileOrder);
            return;
        }

        filterTransactionsByCategory(key);
    }

    // Registered once on the stable grid container (not on individual tiles, which are destroyed
    // and recreated on every render) — the same delegation pattern already used elsewhere in this
    // file (e.g. the document-level 'click' listener that closes row menus).
    //
    // Root-cause fix (real-device Android report, "category already has an item open right after
    // tapping its tile"): proven via a real Edge/CDP touch-event trace that this is a genuine
    // browser-native compatibility click, not app logic. onCategoryTilePointerUp() already
    // navigates on a plain tap (no drag) via filterTransactionsByCategory() — but a touch tap that
    // is never preventDefault()-ed also makes the browser synthesize a trailing click shortly
    // after touchend, targeted via elementFromPoint AT THE TIME IT FIRES — i.e. against whatever
    // now occupies that same screen position on the NEW screen the tap just navigated to. If a
    // transaction row happens to land there, that trailing click reaches it exactly like a real
    // tap would and opens its inline edit form — a "same item every time" result, since it depends
    // only on fixed page geometry, not on which item, category, or how the tap itself was handled.
    // Traced empirically: calling preventDefault() on the synthesized pointerdown/pointerup events
    // is NOT sufficient to suppress it (confirmed: the trailing click still fired); only
    // preventDefault() on the underlying raw touchend event itself reliably suppresses it, so that
    // is the only new listener added here. touch-action: pan-y on .category-tile already governs
    // scroll independently of this — preventDefault() on touchend cannot block a scroll that (if
    // any) already completed via touchmove beforehand, so native scrolling is unaffected. Scoped to
    // touches that started and ended on a .category-tile (same closest()-based check used
    // throughout this file), so it never touches any other touch/click anywhere else in the app.
    (function () {
        var gridEl = document.getElementById('category-tiles-grid');
        if (!gridEl) { return; }
        gridEl.addEventListener('pointerdown', onCategoryTilePointerDown);
        gridEl.addEventListener('touchend', function (e) {
            if (e.cancelable && e.target && e.target.closest && e.target.closest('.category-tile')) { e.preventDefault(); }
        }, { passive: false });
    })();

    function renderAllPreviewScreens() {
        renderHomeScreenFromRealData();
        renderAttentionListFromRealData();
        renderInsightsScreenFromRealData();
        renderCashflowInsightsFromRealData();
        renderMonthlyCashflowForecast();
        renderGoalsScreenFromRealData();
        renderCategoriesScreenFromRealData();
        renderSettingsScreenFromRealData();
        renderTransactionsScreenFromRealData(getCurrentTxFilterName());
        // Stage G.5: keeps the add-transaction form area in sync with previewAddMode across any
        // re-render triggered by another action (archive/restore/delete/inline-edit-save) — same
        // "survives unrelated re-renders" reasoning already applied to previewEditingId elsewhere
        // in this file.
        renderAddFormArea();
    }

    // =====================================================================================
    // ===== Stage G.2.2: archive/restore logic only — NOT wired to any UI yet (no ⋮ menu,   =====
    // ===== no onclick, no toggleRowMenu). Mirrors index.html's own archiveItem()/           =====
    // ===== unarchiveItem() exactly (find by id, flip isArchived, save, re-render) — same    =====
    // ===== find-by-id/no-op-if-missing shape, just against the Preview-only items array and =====
    // ===== the Stage G.1 save/render infrastructure instead of index.html's own              =====
    // ===== saveToLocalStorage()/renderAll(). No direct localStorage access here — persistence =====
    // ===== goes exclusively through savePreviewItems() (Stage G.1), which itself only ever    =====
    // ===== writes DATA_KEY. No other field on the found item is touched, categoryConfig      =====
    // ===== is never read or written, and a missing id is a strict no-op (no save, no render). =====
    // =====================================================================================

    // Version 1.1, Stage 4.0.2.2: manual archiving now also records archiveReason='manual' and
    // archivedAt (today, via the existing todayStr()) — the same two bookkeeping fields
    // runAutoArchiveSweep() writes for an automatic archive, so both paths are distinguishable
    // afterward. No other field, and no other archiving behavior, changed.
    function archivePreviewItem(id) {
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        items[idx].isArchived = true;
        items[idx].archiveReason = 'manual';
        items[idx].archivedAt = todayStr();
        appendActivityLog('manual_archive', items[idx].title || '');
        savePreviewItems();
        renderAllPreviewScreens();
    }

    // Restoring clears archiveReason/archivedAt along with isArchived — the item is no longer
    // archived at all, so neither field describes anything true anymore; this also means a
    // restored loan/variable that still meets the automatic-archive criteria is eligible for
    // runAutoArchiveSweep() to reconsider on a future load, rather than being permanently skipped
    // by its now-stale archiveReason.
    function unarchivePreviewItem(id) {
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        items[idx].isArchived = false;
        delete items[idx].archiveReason;
        delete items[idx].archivedAt;
        appendActivityLog('restore', items[idx].title || '');
        savePreviewItems();
        renderAllPreviewScreens();
    }

    // Stage G.3: permanent delete — removes the item from the in-memory `items` array entirely
    // (not just an isArchived flip), then persists/re-renders through the same Stage G.1
    // infrastructure as archive/restore. A missing id is a strict no-op, same as above.
    function deletePreviewItem(id) {
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        items.splice(idx, 1);
        savePreviewItems();
        renderAllPreviewScreens();
    }

    // =====================================================================================
    // ===== Stage G.2.5: row-menu open/close, scoped to the Transactions screen only (the    =====
    // ===== .tx-menu-toggle/.tx-menu-dropdown markup only exists inside renderTxListWithActions=====
    // ===== output — Home's renderTxList() output has none, so this logic has nothing to find =====
    // ===== or affect there). closeAllRowMenus() always reads menu-open state directly from    =====
    // ===== the DOM's own .open class (document.querySelectorAll) rather than a separate JS    =====
    // ===== variable — a full renderTxListWithActions() re-render (e.g. after an archive/       =====
    // ===== restore action, or a filter switch) always rebuilds every dropdown without the      =====
    // ===== .open class, so there is nothing that can go stale to track. =====
    // =====================================================================================

    // Version 1.4.1 correction: the single choke-point for closing any open row menu — used
    // directly (outside click, re-click-to-close) and reused as the onClose Back itself calls, so
    // both paths consume the exact same 'rowMenu' history entry. consumeTransient() is safe to
    // call even when nothing was actually open (the overwhelming majority of its calls, since this
    // also runs on every single document click) — it only pops when the stack top is 'rowMenu'.
    function closeAllRowMenus() {
        var openDropdowns = document.querySelectorAll('.tx-menu-dropdown.open');
        for (var i = 0; i < openDropdowns.length; i++) {
            openDropdowns[i].classList.remove('open');
        }
        consumeTransient('rowMenu');
    }

    // Called via onclick="toggleRowMenu(this)" (the button element itself, never a concatenated
    // id string). Closes any other open row menu first (Stage G.2's approved "only one open at a
    // time" requirement), then opens this row's own dropdown — unless it was the one already
    // open, in which case closeAllRowMenus() above already closed it and nothing more happens
    // (a second click on the same ⋮ toggles it shut).
    function toggleRowMenu(toggleBtn) {
        var row = toggleBtn.closest('.tx-row');
        var dropdown = row ? row.querySelector('.tx-menu-dropdown') : null;
        if (!dropdown) return;
        var wasOpen = dropdown.classList.contains('open');
        closeAllRowMenus();
        if (!wasOpen) {
            dropdown.classList.add('open');
            pushTransientState('rowMenu', closeAllRowMenus);
        }
    }

    // Single delegated listener, registered once at script-load time (this script only ever runs
    // once per page load, so no re-registration/guard is needed). Ignores any click that
    // originated on a .tx-menu-toggle or inside a .tx-menu-dropdown — those are handled by
    // toggleRowMenu()/handleRowMenuAction() themselves via their own onclick — so this only ever
    // fires for genuine "click elsewhere" cases, which is exactly what closes an open row menu.
    document.addEventListener('click', function (e) {
        if (e.target.closest && (e.target.closest('.tx-menu-toggle') || e.target.closest('.tx-menu-dropdown'))) { return; }
        closeAllRowMenus();
    });

    // =====================================================================================
    // ===== Stage G.2.6: the single dropdown action, wired to the two Stage G.2.2 functions  =====
    // ===== (archivePreviewItem/unarchivePreviewItem) — no new mutation logic here. Called via =====
    // ===== onclick="handleRowMenuAction(this)"; the id travels only through data-item-id      =====
    // ===== (parsed back to a number here, matching the numeric `id` archivePreviewItem()/      =====
    // ===== unarchivePreviewItem() already expect), never through a concatenated onclick        =====
    // ===== string. The action to take (archive vs. restore) is looked up fresh from the live    =====
    // ===== `items` array by id — not trusted from the button's own rendered label — so it is    =====
    // ===== always correct even if `items` changed since this row was last rendered. Both target =====
    // ===== functions already call savePreviewItems() (DATA_KEY only) and                        =====
    // ===== renderAllPreviewScreens() internally, which fully rebuilds transactions-list (once    =====
    // ===== Stage G.2.6 below wires renderTransactionsScreenFromRealData() to                     =====
    // ===== renderTxListWithActions) — that rebuild is what closes this row's menu; no separate   =====
    // ===== closeAllRowMenus() call is needed here. =====
    // =====================================================================================

    function handleRowMenuAction(actionBtn) {
        var id = parseInt(actionBtn.getAttribute('data-item-id'), 10);
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        if (items[idx].isArchived) { unarchivePreviewItem(id); } else { archivePreviewItem(id); }
    }

    // Stage G.3: the destructive dropdown action — reads the id the same way
    // handleRowMenuAction() does above (data-item-id only, parsed to a number, never trusted
    // from anywhere else). Uses the browser's own confirm() — no custom dialog, per approved
    // product decision — and only calls deletePreviewItem() if the user confirms. Cancelling is
    // a strict no-op: deletePreviewItem() is never called, so nothing is saved or re-rendered,
    // and the row menu (this click originated inside .tx-menu-dropdown, which the document-level
    // listener above already ignores) is left open exactly as it was.
    function handleDeleteMenuAction(actionBtn) {
        var id = parseInt(actionBtn.getAttribute('data-item-id'), 10);
        if (!confirm('למחוק את התנועה הזו לצמיתות? לא ניתן לשחזר לאחר מכן.')) return;
        deletePreviewItem(id);
    }

    // =====================================================================================
    // ===== Stage G.4: inline editing — Transactions screen only. The 3 dropdown actions     =====
    // ===== above (edit/archive-restore/delete) are unchanged; this section adds the fourth   =====
    // ===== capability: "✏️ עריכה" opens an inline form in place of the row (rendered by       =====
    // ===== renderTxListWithActions() above), and the two functions below save or discard it.  =====
    // =====================================================================================

    // Mirrors index.html's own toggleCardLast4Field(groupId, whereValue) exactly — only the
    // group id it is called with differs (edit-card-last4-group-<id> here vs. the add-form's
    // fix-card-last4-group / an edit-card-last4-group-<id> in index.html itself). Purely a
    // display toggle; touches no data.
    function togglePreviewCardLast4Field(groupId, whereValue) {
        var group = document.getElementById(groupId);
        if (group) { group.style.display = (whereValue === 'credit') ? 'block' : 'none'; }
    }

    var HEBREW_MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

    function buildMonthSelectOptionsHtml(selectedMonth1to12) {
        var html = '';
        for (var m = 1; m <= 12; m++) {
            html += '<option value="' + m + '"' + (m === selectedMonth1to12 ? ' selected' : '') + '>' + HEBREW_MONTH_NAMES[m - 1] + '</option>';
        }
        return html;
    }

    // Frequency-UI correction: one "תדירות" select (monthly/bimonthly/annual) replaces the earlier
    // separate bimonthly checkbox + period select. Selecting "bimonthly" immediately reveals the
    // required starting-month select; any other choice hides it. Takes an explicit element id (same
    // convention as togglePreviewCardLast4Field(groupId, ...) above) so one function serves both
    // the add form and every edit form (per-item <id>-suffixed ids). Purely a display toggle — it
    // never touches any other field's value, so switching frequency back and forth never loses
    // whatever the user already typed into title/amount/day/notes/etc. addPreviewItem()/
    // savePreviewInlineEdit() alone decide what's actually saved, from whichever frequency is
    // selected at save time.
    function togglePreviewFixedFrequencyFields(startGroupId, frequencyValue) {
        var startGroup = document.getElementById(startGroupId);
        if (startGroup) { startGroup.style.display = (frequencyValue === 'bimonthly') ? 'block' : 'none'; }
    }

    // Shared 3-option frequency <select> markup for both the add and edit forms — one place
    // deciding which of the three values is pre-selected, so the two forms can never disagree.
    function buildFixedFrequencySelectHtml(selectId, onchangeStartGroupId, currentFrequency) {
        return '<select id="' + selectId + '" onchange="togglePreviewFixedFrequencyFields(\'' + onchangeStartGroupId + '\', this.value)">' +
            '<option value="monthly"' + (currentFrequency === 'monthly' ? ' selected' : '') + '>חודשי</option>' +
            '<option value="bimonthly"' + (currentFrequency === 'bimonthly' ? ' selected' : '') + '>דו-חודשי</option>' +
            '<option value="annual"' + (currentFrequency === 'annual' ? ' selected' : '') + '>שנתי</option>' +
            '</select>';
    }

    // Resolves the single frequency value ('monthly'/'bimonthly'/'annual') an existing fixed item
    // should reopen with — the one place both buildPreviewEditFormHtml() and any future consumer
    // derive it from, so an item can never be shown with a different frequency than it actually has.
    function resolveFixedFrequency(item) {
        if (resolveFixedIsBimonthly(item)) { return 'bimonthly'; }
        return (item && item.period === 'שנתי') ? 'annual' : 'monthly';
    }

    // Builds the inline edit form for one item, branching by item.type exactly like index.html's
    // own renderAll() does inline (isEditing branch) — copied literally per type (dated / fixed /
    // variable / loan / default-for-income), same field ids (edit-title-<id>, edit-amount-<id>,
    // etc.) so savePreviewInlineEdit() below can read them back the same way saveInlineEdit()
    // does in index.html. Read-only with respect to `items`/localStorage — building this markup
    // never saves or mutates anything by itself.
    function buildPreviewEditFormHtml(item) {
        var id = item.id;
        var html = '<div class="tx-edit-form">';

        if (item.type === 'dated') {
            var isEditingBuiltinSettlement = isBuiltinCreditCardSettlement(item);
            var isCreditDated = (resolveEffectiveWhere(item) === 'credit');
            html += '<div class="tx-edit-group"><label>שם ההוצאה</label><input type="text" id="edit-title-' + id + '" value="' + escapeHtml(item.title || '') + '"></div>' +
                '<div class="tx-edit-group"><label>סכום</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>תאריך החיוב</label><input type="date" id="edit-date-' + id + '" value="' + (item.start || '') + '"></div>';
            if (isEditingBuiltinSettlement) {
                // Settlement-identification correction: the built-in settlement category is always
                // a bank outflow — no payment-method choice, only its own always-required
                // last-4-digits field, matching the add form's identical special-case.
                html += '<div class="tx-edit-group"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="edit-card-last4-' + id + '" maxlength="4" inputmode="numeric" value="' + escapeHtml(item.cardLast4 || '') + '"></div>' +
                    '<div class="tx-edit-group"><label>הערות (אופציונלי)</label><textarea id="edit-dated-notes-' + id + '">' + escapeHtml(item.notes || '') + '</textarea></div>';
            } else {
                html += '<div class="tx-edit-group"><label>אמצעי תשלום</label><select id="edit-where-' + id + '" onchange="togglePreviewCardLast4Field(\'edit-card-last4-group-' + id + '\', this.value)">' +
                        '<option value="bank"' + (!isCreditDated ? ' selected' : '') + '>חשבון בנק</option>' +
                        '<option value="credit"' + (isCreditDated ? ' selected' : '') + '>כרטיס אשראי</option>' +
                    '</select></div>' +
                    '<div class="tx-edit-group" id="edit-card-last4-group-' + id + '" style="display:' + (isCreditDated ? 'block' : 'none') + ';"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="edit-card-last4-' + id + '" maxlength="4" inputmode="numeric" value="' + escapeHtml(item.cardLast4 || '') + '"></div>';
            }
            html += '<div class="tx-edit-actions">' +
                '<button type="button" class="tx-edit-save" onclick="savePreviewInlineEdit(' + id + ')">💾 שמור שינויים</button>' +
                '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewEdit()">ביטול</button>' +
                '</div></div>';
            return html;
        }

        if (item.type === 'cashWithdrawal') {
            // Version 1.4.2: no title field (fixed "משיכת מזומן" title, not user-editable) and no
            // category field — mirrors the 'dated' early-return pattern above, minus those two.
            html += '<div class="tx-edit-group"><label>סכום</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>תאריך</label><input type="date" id="edit-date-' + id + '" value="' + (item.start || '') + '"></div>' +
                '<div class="tx-edit-group"><label>הערה (אופציונלי)</label><input type="text" id="edit-notes-cash-' + id + '" value="' + escapeHtml(item.notes || '') + '"></div>';
            html += '<div class="tx-edit-actions">' +
                '<button type="button" class="tx-edit-save" onclick="savePreviewInlineEdit(' + id + ')">💾 שמור שינויים</button>' +
                '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewEdit()">ביטול</button>' +
                '</div></div>';
            return html;
        }

        html += '<div class="tx-edit-group"><label>שם / כותרת</label><input type="text" id="edit-title-' + id + '" value="' + escapeHtml(item.title || '') + '"></div>';

        if (item.type === 'fixed') {
            var isCreditFixed = (item.where === 'credit');
            var isBimonthlyFixedEdit = resolveFixedIsBimonthly(item);
            var editFrequency = resolveFixedFrequency(item);
            html += '<div class="tx-edit-group"><label>סכום</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>יום ירידה</label><input type="number" id="edit-day-' + id + '" min="1" max="31" value="' + resolveEffectiveDay(item) + '"></div>' +
                '<div class="tx-edit-group"><label>איפה יורד</label><select id="edit-where-' + id + '" onchange="togglePreviewCardLast4Field(\'edit-card-last4-group-' + id + '\', this.value)">' +
                    '<option value="bank"' + (!isCreditFixed ? ' selected' : '') + '>חשבון בנק</option>' +
                    '<option value="credit"' + (isCreditFixed ? ' selected' : '') + '>כרטיס אשראי</option>' +
                '</select></div>' +
                '<div class="tx-edit-group" id="edit-card-last4-group-' + id + '" style="display:' + (isCreditFixed ? 'block' : 'none') + ';"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="edit-card-last4-' + id + '" maxlength="4" inputmode="numeric" value="' + escapeHtml(item.cardLast4 || '') + '"></div>' +
                '<div class="tx-edit-group"><label>תדירות</label>' + buildFixedFrequencySelectHtml('edit-fix-frequency-' + id, 'edit-fix-bimonthly-start-group-' + id, editFrequency) + '</div>' +
                '<div class="tx-edit-group" id="edit-fix-bimonthly-start-group-' + id + '" style="display:' + (isBimonthlyFixedEdit ? 'block' : 'none') + ';"><label>חודש התחלה</label><select id="edit-fix-bimonthly-start-' + id + '">' + buildMonthSelectOptionsHtml(resolveFixedBimonthlyStartMonth(item)) + '</select></div>' +
                '<div class="tx-edit-group"><label>הערות</label><textarea id="edit-notes-' + id + '">' + escapeHtml(item.notes || '') + '</textarea></div>';
        } else if (item.type === 'variable') {
            // Version 1.4.5: legacy item (no explicit payment method saved yet) gets no pre-selected
            // option at all — a disabled placeholder is shown instead — forcing the user to make an
            // explicit choice before this form can be saved (savePreviewInlineEdit() rejects a blank
            // value). An item that already has a valid stored method just re-shows it, same pattern
            // as 'fixed'/'dated' above.
            var varMethod = resolveVariablePaymentMethod(item);
            var isCreditVar = (varMethod === 'credit');
            html += '<div class="tx-edit-group"><label>סכום מקור</label><input type="number" id="edit-original-' + id + '" value="' + (item.originalAmount || '') + '"></div>' +
                '<div class="tx-edit-group"><label>עלות חודשית</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>יום ירידה</label><input type="number" id="edit-day-' + id + '" min="1" max="31" value="' + resolveEffectiveDay(item) + '"></div>' +
                '<div class="tx-edit-group"><label>סך תשלומים</label><input type="number" id="edit-total-' + id + '" value="' + (item.total || '') + '"></div>' +
                '<div class="tx-edit-group"><label>תאריך התחלה</label><input type="date" id="edit-start-' + id + '" value="' + (item.start || '') + '"></div>' +
                '<div class="tx-edit-group"><label>אמצעי תשלום</label><select id="edit-where-' + id + '" onchange="togglePreviewCardLast4Field(\'edit-card-last4-group-' + id + '\', this.value)">' +
                    (varMethod === null ? '<option value="" disabled selected>יש לבחור אמצעי תשלום</option>' : '') +
                    '<option value="bank"' + (varMethod === 'bank' ? ' selected' : '') + '>חשבון בנק</option>' +
                    '<option value="credit"' + (isCreditVar ? ' selected' : '') + '>כרטיס אשראי</option>' +
                '</select></div>' +
                '<div class="tx-edit-group" id="edit-card-last4-group-' + id + '" style="display:' + (isCreditVar ? 'block' : 'none') + ';"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="edit-card-last4-' + id + '" maxlength="4" inputmode="numeric" value="' + escapeHtml(item.cardLast4 || '') + '"></div>';
        } else if (item.type === 'loan') {
            html += '<div class="tx-edit-group"><label>סכום מקור</label><input type="number" id="edit-original-' + id + '" value="' + (item.originalAmount || '') + '"></div>' +
                '<div class="tx-edit-group"><label>החזר חודשי</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>היכן יורד</label><input type="text" id="edit-where-' + id + '" value="' + escapeHtml(item.where || '') + '"></div>' +
                '<div class="tx-edit-group"><label>ריבית (%)</label><input type="number" step="0.01" id="edit-interest-' + id + '" value="' + (item.interest || '') + '"></div>' +
                '<div class="tx-edit-group"><label>יום בחודש</label><input type="number" id="edit-day-' + id + '" min="1" max="31" value="' + resolveEffectiveDay(item) + '"></div>' +
                '<div class="tx-edit-group"><label>סך תשלומים</label><input type="number" id="edit-total-' + id + '" value="' + (item.total || '') + '"></div>' +
                '<div class="tx-edit-group"><label>תאריך מתחיל</label><input type="date" id="edit-start-' + id + '" value="' + (item.start || '') + '"></div>';
        } else {
            html += '<div class="tx-edit-group"><label>סכום</label><input type="number" id="edit-amount-' + id + '" value="' + item.amount + '"></div>' +
                '<div class="tx-edit-group"><label>יום כניסה</label><input type="number" id="edit-day-' + id + '" min="1" max="31" value="' + resolveEffectiveDay(item) + '"></div>';
        }

        html += '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="savePreviewInlineEdit(' + id + ')">💾 שמור שינויים</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewEdit()">ביטול</button>' +
            '</div></div>';

        return html;
    }

    // Version 1.1, Stage 4.0.2.1: called via onclick="handleTxRowClick(event, <id>)" straight off
    // the .tx-row div itself (rowOpenAttrs in renderTxListWithActions()) — replaces the old
    // dropdown "✏️ עריכה" item (removed) as the way to open a row's edit form. `id` is a literal
    // number baked into the onclick at render time, the same convention already used for
    // savePreviewInlineEdit(<id>) on the edit form's own save button — not a data-item-id lookup,
    // since there's no button element here to read one off.
    //
    // First line: if the click actually originated on the ⋮ toggle or inside its dropdown (menu
    // open/close, archive/restore, delete), do nothing — those already have their own onclick
    // handlers, which still run first regardless; this only stops the SAME click from also being
    // treated as "open edit for this row" once it bubbles up to the row. Reuses the identical
    // closest()-based check the existing document-level "close other row menus" listener already
    // uses, so no stopPropagation is needed anywhere for this.
    //
    // A missing/nonexistent id is a strict no-op (previewEditingId is never set, nothing
    // re-renders). Archived items never reach this at all in practice — renderTxListWithActions()
    // gives an archived row no onclick/tabindex whatsoever (rowOpenAttrs is empty for them), same
    // restriction the removed "✏️ עריכה" button used to enforce by simply not existing — but the
    // id is still verified against the live `items` array here rather than trusted blindly.
    // Version 1.4.1 correction: the transaction inline-edit form (previewEditingId) and the
    // quick-add form (previewAddMode) are mutually exclusive (already enforced below in both
    // directions) — one shared 'txInline' history entry covers both, dispatching Back to
    // whichever one's own existing Cancel function is currently relevant.
    function ensureTxInlineTransient() {
        if (transientStack.length === 0 || transientStack[transientStack.length - 1].type !== 'txInline') {
            pushTransientState('txInline', cancelCurrentTxInlineState);
        }
    }
    function cancelCurrentTxInlineState() {
        if (previewEditingId !== null) { cancelPreviewEdit(); return; }
        if (previewAddMode !== null) { cancelPreviewAdd(); return; }
    }

    function handleTxRowClick(event, id) {
        if (event && event.target && event.target.closest && (event.target.closest('.tx-menu-toggle') || event.target.closest('.tx-menu-dropdown'))) { return; }
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        // Stage G.5: enforce "only one form open at a time" in both directions — opening an inline
        // edit discards any in-progress (unsaved) add-transaction form, mirroring
        // startPreviewAddForCategory()'s own symmetric handling of an open inline edit. No data is
        // touched by this discard (pure no-op on `items`, same as cancelPreviewAdd()).
        previewAddMode = null;
        previewAddCategoryKey = null;
        renderAddFormArea();
        previewEditingId = id;
        // Only the Transactions list needs to change (a row is swapping to its edit form) — no
        // data changed, so Home/Insights/Settings are left untouched, same reasoning
        // cancelPreviewEdit() below uses. Preserves whichever filter (active/archived) is
        // currently selected, exactly like every other Transactions re-render in this file.
        renderTransactionsScreenFromRealData(getCurrentTxFilterName());
        ensureTxInlineTransient();
    }

    // Version 1.1, Stage 4.0.2.1: keyboard equivalent of clicking the row — only Enter/Space
    // activate it (native button-activation keys), matching this row's role="button" semantics.
    // preventDefault() stops Space from also scrolling the page, the standard native-button
    // behavior a real <button> gets for free. Delegates to handleTxRowClick() itself rather than
    // duplicating its body — including that same closest()-based bail-out, which matters here too:
    // pressing Enter/Space while focus is on the nested ⋮ button (or a dropdown item) fires this
    // keydown handler as well (it bubbles, same as the click event does), and must be just as
    // harmless there as a mouse click is.
    function handleTxRowKeydown(event, id) {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') { return; }
        event.preventDefault();
        handleTxRowClick(event, id);
    }

    // Called via onclick="cancelPreviewEdit()" from the edit form's own "ביטול" button — takes no
    // argument because, unlike every other row action, the form itself does not carry a
    // data-item-id anywhere (it doesn't need one: previewEditingId already identifies the row).
    // Strict no-op on data: no save, no mutation of `items`, just clears previewEditingId and
    // re-renders the Transactions list so the row reverts to its normal (non-edit) markup —
    // preserving whichever filter is currently selected.
    function cancelPreviewEdit() {
        previewEditingId = null;
        renderTransactionsScreenFromRealData(getCurrentTxFilterName());
        consumeTransient('txInline');
    }

    // Called via onclick="savePreviewInlineEdit(<id>)" — the id here is baked into the form's own
    // buttons at render time (buildPreviewEditFormHtml()), not read from a data-item-id attribute,
    // matching index.html's own saveInlineEdit(id) call convention exactly (index.html's
    // btn-save-edit button is likewise `onclick="saveInlineEdit(item.id)"`, a literal numeric
    // argument, not an attribute lookup). Field-reading and validation below are copied literally,
    // branch-for-branch, from index.html's saveInlineEdit() (dated / fixed / variable / loan /
    // default-for-income) — same required fields, same alert() messages, per approved product
    // decision 3א (no new error UI). On any validation failure: alert() only, previewEditingId is
    // left unchanged and nothing re-renders, so the form stays open with whatever the user typed
    // still in its fields — exactly index.html's own behavior. A missing/nonexistent id is a
    // strict no-op (no alert, no save, no render), mirroring saveInlineEdit()'s own `if (idx ===
    // -1) return;` guard.
    function savePreviewInlineEdit(id) {
        var idx = items.findIndex(function (i) { return i.id === id; });
        if (idx === -1) return;
        var item = items[idx];

        if (item.type === 'dated') {
            var datedTitleVal = document.getElementById('edit-title-' + id).value.trim();
            var dateVal = document.getElementById('edit-date-' + id).value;
            var dAmountVal = parseFloat(document.getElementById('edit-amount-' + id).value);
            if (!datedTitleVal || !dateVal || isNaN(dAmountVal)) {
                alert('נא להזין שם, תאריך וסכום תקינים');
                return;
            }
            // Settlement-identification correction: the built-in settlement category has no
            // 'edit-where-<id>' select at all (see buildPreviewEditFormHtml()'s identical branch)
            // — always bank, last-4-digits always required. Any other dated-baseType category
            // keeps the normal bank/credit select.
            if (isBuiltinCreditCardSettlement(item)) {
                var settlementCardLast4 = document.getElementById('edit-card-last4-' + id).value.trim();
                if (!/^\d{4}$/.test(settlementCardLast4)) {
                    alert('נא להזין בדיוק 4 ספרות אחרונות של הכרטיס עבור חיוב האשראי');
                    return;
                }
                item.where = 'bank';
                item.cardLast4 = settlementCardLast4;
                item.notes = document.getElementById('edit-dated-notes-' + id).value;
            } else {
                var datedNewWhere = document.getElementById('edit-where-' + id).value;
                if (datedNewWhere === 'credit') {
                    var datedNewCardLast4 = document.getElementById('edit-card-last4-' + id).value.trim();
                    if (!/^\d{4}$/.test(datedNewCardLast4)) {
                        alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי');
                        return;
                    }
                    item.cardLast4 = datedNewCardLast4;
                } else {
                    item.cardLast4 = '';
                }
                item.where = datedNewWhere;
            }
            item.title = datedTitleVal;
            item.start = dateVal;
            item.amount = dAmountVal;
            // Version 1.4.6: same "עודכן:" bump as addPreviewItem()'s identical branch — only for
            // THIS item's own stable key (isBuiltinCreditCardSettlement(item), not any other
            // dated-baseType category), on every successful edit, never on delete.
            if (isBuiltinCreditCardSettlement(item)) {
                appSettings.creditCardSettlementUpdatedAt = todayStr();
                saveAppSettings();
            }
            previewEditingId = null;
            savePreviewItems();
            renderAllPreviewScreens();
            consumeTransient('txInline');
            return;
        }

        if (item.type === 'cashWithdrawal') {
            var wdEditAmount = sanitizePositiveAmount(document.getElementById('edit-amount-' + id).value);
            var wdEditDate = document.getElementById('edit-date-' + id).value;
            var wdEditNotes = document.getElementById('edit-notes-cash-' + id).value;
            if (wdEditAmount === null || !isValidDateStr(wdEditDate)) {
                alert('נא להזין תאריך וסכום תקינים (סכום גדול מאפס)');
                return;
            }
            var wdEditOpening = getProjectedBalanceOpeningConfig();
            if (wdEditOpening && cashflowDateOnly(parseLocalDateStr(wdEditDate)) < cashflowDateOnly(parseLocalDateStr(wdEditOpening.dateStr))) {
                alert('לא ניתן להזין משיכת מזומן בתאריך שלפני יתרת ההתחלה (' + wdEditOpening.dateStr + ').');
                return;
            }
            item.amount = wdEditAmount;
            item.start = wdEditDate;
            item.notes = wdEditNotes;
            previewEditingId = null;
            savePreviewItems();
            renderAllPreviewScreens();
            consumeTransient('txInline');
            return;
        }

        var titleVal = document.getElementById('edit-title-' + id).value.trim();
        var amountVal = parseFloat(document.getElementById('edit-amount-' + id).value);

        if (!titleVal || isNaN(amountVal)) {
            alert('נא להזין שם וסכום תקינים');
            return;
        }

        item.title = titleVal;
        item.amount = amountVal;

        if (item.type === 'fixed') {
            var newWhere = document.getElementById('edit-where-' + id).value;
            var newCardLast4 = null;
            if (newWhere === 'credit') {
                newCardLast4 = document.getElementById('edit-card-last4-' + id).value.trim();
                if (!/^\d{4}$/.test(newCardLast4)) {
                    alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי');
                    return;
                }
            }
            // Frequency-UI correction: validated here, BEFORE any field on `item` is mutated below —
            // same "validate everything first, mutate only once every check passed" pattern the
            // where/cardLast4 check above already follows, so a failed validation never leaves
            // `item` partially changed in memory (unsaved) the way mutating-then-validating would.
            var editFrequencyVal = document.getElementById('edit-fix-frequency-' + id).value;
            var editBimonthlyStart = null;
            if (editFrequencyVal === 'bimonthly') {
                editBimonthlyStart = parseInt(document.getElementById('edit-fix-bimonthly-start-' + id).value, 10);
                if (!isFinite(editBimonthlyStart) || editBimonthlyStart < 1 || editBimonthlyStart > 12) {
                    alert('נא לבחור חודש התחלה תקין');
                    return;
                }
            }

            item.cardLast4 = (newWhere === 'credit') ? newCardLast4 : '';
            item.day = document.getElementById('edit-day-' + id).value;
            item.where = newWhere;
            item.notes = document.getElementById('edit-notes-' + id).value;
            if (editFrequencyVal === 'bimonthly') {
                item.bimonthly = true;
                item.bimonthlyStartMonth = editBimonthlyStart;
                item.period = 'חודשי';
            } else {
                item.bimonthly = false;
                item.bimonthlyStartMonth = null;
                item.period = (editFrequencyVal === 'annual') ? 'שנתי' : 'חודשי';
            }
        } else if (item.type === 'variable') {
            // Validated BEFORE any item.* mutation below — same "validate everything first" pattern
            // 'fixed' above already follows, so a failed payment-method check never leaves `item`
            // partially changed in memory. A blank value (the legacy-item placeholder option, still
            // unselected) is rejected exactly like an invalid 'bank'/'credit' value would be.
            var varNewWhere = document.getElementById('edit-where-' + id).value;
            if (varNewWhere !== 'bank' && varNewWhere !== 'credit') {
                alert('יש לבחור אמצעי תשלום (חשבון בנק או כרטיס אשראי)');
                return;
            }
            var varNewCardLast4 = '';
            if (varNewWhere === 'credit') {
                varNewCardLast4 = document.getElementById('edit-card-last4-' + id).value.trim();
                if (!/^\d{4}$/.test(varNewCardLast4)) {
                    alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי');
                    return;
                }
            }

            item.originalAmount = parseFloat(document.getElementById('edit-original-' + id).value) || 0;
            item.day = document.getElementById('edit-day-' + id).value;
            item.total = document.getElementById('edit-total-' + id).value;
            item.start = document.getElementById('edit-start-' + id).value;
            item.where = varNewWhere;
            item.cardLast4 = varNewCardLast4;
        } else if (item.type === 'loan') {
            item.originalAmount = parseFloat(document.getElementById('edit-original-' + id).value) || 0;
            item.where = document.getElementById('edit-where-' + id).value;
            item.interest = document.getElementById('edit-interest-' + id).value;
            item.day = document.getElementById('edit-day-' + id).value;
            item.total = document.getElementById('edit-total-' + id).value;
            item.start = document.getElementById('edit-start-' + id).value;
        } else {
            item.day = document.getElementById('edit-day-' + id).value;
        }

        previewEditingId = null;
        savePreviewItems();
        renderAllPreviewScreens();
        consumeTransient('txInline');
    }

    // =====================================================================================
    // ===== Stage G.5: adding a new income/expense/loan — Transactions screen only, via a    =====
    // ===== category tile's own filtered page (startPreviewAddForCategory() below). A         =====
    // ===== dedicated form area at the top of the Transactions screen (#preview-add-form-area),=====
    // ===== and the same field-by-field validation/logic as index.html's own addNewItem()      =====
    // ===== (copied literally per branch below). Only one form — add OR inline-edit — can be   =====
    // ===== open at a time (enforced from both directions: starting an add discards an open    =====
    // ===== edit, handleTxRowClick() above discards an open add). All writes go through the    =====
    // ===== existing savePreviewItems()/renderAllPreviewScreens() (DATA_KEY only) — no new      =====
    // ===== persistence path.                                                                  =====
    // =====================================================================================

    // Copied verbatim from index.html — used only to pre-fill the "dated" add-form's date field
    // with today's date, matching index.html's own switchFormType() convention for that same field.
    function todayStr() {
        var d = new Date();
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = ('0' + d.getDate()).slice(-2);
        return d.getFullYear() + '-' + mm + '-' + dd;
    }

    // All categoryConfig keys whose baseType matches. Object key order (for..in) is the same
    // insertion-order iteration index.html itself already relies on for this same object
    // (buildFormDropdown/initCategoryInputs) — no sorting invented here.
    function getCategoryKeysForBaseType(baseType) {
        var keys = [];
        for (var key in categoryConfig) {
            if (categoryConfig[key] && categoryConfig[key].baseType === baseType) { keys.push(key); }
        }
        return keys;
    }

    // Opens the add-transaction form area directly for the given category's baseType —
    // previewAddCategoryKey is pre-set to `key`, so buildPreviewAddFormHtml()'s existing category
    // <select> (shown only when more than one category shares that baseType) opens with this
    // category already selected — the user can still change it via that same existing dropdown.
    // Called only while already on the Transactions screen showing this category's filtered list
    // (see handleFabClick() above), so no navigation here. Unknown key is a strict no-op.
    function startPreviewAddForCategory(key) {
        if (!categoryConfig[key]) { return; }
        previewEditingId = null;
        previewAddMode = categoryConfig[key].baseType;
        previewAddCategoryKey = key;
        renderAddFormArea();
        ensureTxInlineTransient();
    }

    // No-argument, mirroring cancelPreviewEdit()'s own convention — there is only ever one add
    // form open at a time, so no id/identifier is needed to know what to discard. Strict no-op on
    // data: no save, no mutation of `items`.
    function cancelPreviewAdd() {
        previewAddMode = null;
        previewAddCategoryKey = null;
        renderAddFormArea();
        consumeTransient('txInline');
    }

    // Builds the markup for whatever previewAddMode currently is: '' when closed, or one of the
    // full add forms (income/loan/variable/fixed/dated/cashWithdrawal) — each a literal
    // field-for-field copy of index.html's own static #form-income/#form-loan/#form-variable/
    // #form-fixed/#form-dated blocks, using new "add-*" element ids (distinct from both
    // index.html's own ids and this file's "edit-*-<id>" inline-edit ids, so none can ever
    // collide). Reuses the existing .tx-edit-form/.tx-edit-group/.tx-edit-actions/.tx-edit-save/
    // .tx-edit-cancel classes (Stage G.4) as-is — no visual reason for a separate class set, since
    // the layout is identical to the inline edit form. A category picker (<select>) is shown for
    // fixed/variable/dated only when more than one categoryConfig key matches that baseType;
    // otherwise the single match is used silently, exactly like the (never-shown-for-just-one-
    // option) reasoning already used elsewhere in this file.
    function buildPreviewAddFormHtml() {
        if (previewAddMode === null) { return ''; }

        var categoryPickerHtml = '';
        if (previewAddMode === 'fixed' || previewAddMode === 'variable' || previewAddMode === 'dated') {
            var matchingKeys = getCategoryKeysForBaseType(previewAddMode);
            if (matchingKeys.length > 1) {
                categoryPickerHtml = '<div class="tx-edit-group"><label>קטגוריה</label><select id="add-category-key" onchange="previewAddCategoryKey = this.value;">';
                for (var k = 0; k < matchingKeys.length; k++) {
                    var mk = matchingKeys[k];
                    var mLabel = (categoryConfig[mk] && categoryConfig[mk].label) ? categoryConfig[mk].label : mk;
                    categoryPickerHtml += '<option value="' + escapeHtml(mk) + '"' + (mk === previewAddCategoryKey ? ' selected' : '') + '>' + escapeHtml(mLabel) + '</option>';
                }
                categoryPickerHtml += '</select></div>';
            }
        }

        var html = '<div class="tx-edit-form">';

        // Version 1.1, Stage 4.0.2: each add-form's day-of-month field is pre-filled via
        // resolveEffectiveDay() against a not-yet-saved pseudo-item ({ displayCategory:
        // previewAddCategoryKey }, no `day` of its own yet) — resolves to that category's
        // defaultDayOfMonth when set, otherwise 1 — and stays fully editable before saving.
        var addDefaultDay = resolveEffectiveDay({ displayCategory: previewAddCategoryKey });

        if (previewAddMode === 'income') {
            html += '<div class="tx-edit-group"><label>שם / תיאור</label><input type="text" id="add-inc-title" placeholder="משכורת, בונוס"></div>' +
                '<div class="tx-edit-group"><label>סכום</label><input type="number" id="add-inc-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>יום כניסה</label><input type="number" id="add-inc-day" min="1" max="31" value="' + addDefaultDay + '"></div>';
        } else if (previewAddMode === 'loan') {
            html += '<div class="tx-edit-group"><label>שם ההלוואה</label><input type="text" id="add-loan-title"></div>' +
                '<div class="tx-edit-group"><label>סכום מקור (סך ההלוואה המקורית)</label><input type="number" id="add-loan-original" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>החזר חודשי</label><input type="number" id="add-loan-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>היכן יורד</label><input type="text" id="add-loan-where"></div>' +
                '<div class="tx-edit-group"><label>ריבית (%)</label><input type="number" id="add-loan-interest" step="0.01"></div>' +
                '<div class="tx-edit-group"><label>מתי יורד (יום בחודש)</label><input type="number" id="add-loan-day" min="1" max="31" value="' + addDefaultDay + '"></div>' +
                '<div class="tx-edit-group"><label>כמה תשלומים (סך הכל)</label><input type="number" id="add-loan-total"></div>' +
                '<div class="tx-edit-group"><label>תאריך לקיחה / פתיחה</label><input type="date" id="add-loan-start"></div>';
        } else if (previewAddMode === 'variable') {
            html += categoryPickerHtml +
                '<div class="settings-hint">תשלום מכרטיס אשראי נשאר למעקב בלבד (אינו מופחת שוב בתחזית — ההשפעה בפועל מגיעה מחיוב הכרטיס). תשלום מחשבון בנק מפחית את היתרה הצפויה בכל תאריך תשלום בפועל.</div>' +
                '<div class="tx-edit-group"><label>שם התשלום</label><input type="text" id="add-var-title"></div>' +
                '<div class="tx-edit-group"><label>סכום מקור (סך כל העסקה המקורית)</label><input type="number" id="add-var-original" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>עלות חודשית</label><input type="number" id="add-var-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>יום ירידה</label><input type="number" id="add-var-day" min="1" max="31" value="' + addDefaultDay + '"></div>' +
                '<div class="tx-edit-group"><label>כמה תשלומים (סך הכל)</label><input type="number" id="add-var-total"></div>' +
                '<div class="tx-edit-group"><label>תאריך התחלה</label><input type="date" id="add-var-start"></div>' +
                '<div class="tx-edit-group"><label>אמצעי תשלום</label><select id="add-var-where" onchange="togglePreviewCardLast4Field(\'add-var-card-last4-group\', this.value)"><option value="bank">חשבון בנק</option><option value="credit">כרטיס אשראי</option></select></div>' +
                '<div class="tx-edit-group" id="add-var-card-last4-group" style="display:none;"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="add-var-card-last4" maxlength="4" inputmode="numeric" placeholder="לדוגמה: 5646"></div>';
        } else if (previewAddMode === 'fixed') {
            html += categoryPickerHtml +
                '<div class="tx-edit-group"><label>שם ההוצאה</label><input type="text" id="add-fix-title"></div>' +
                '<div class="tx-edit-group"><label>סכום</label><input type="number" id="add-fix-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>יום ירידה</label><input type="number" id="add-fix-day" min="1" max="31" value="' + addDefaultDay + '"></div>' +
                '<div class="tx-edit-group"><label>איפה יורד</label><select id="add-fix-where" onchange="togglePreviewCardLast4Field(\'add-fix-card-last4-group\', this.value)"><option value="bank">חשבון בנק</option><option value="credit">כרטיס אשראי</option></select></div>' +
                '<div class="tx-edit-group" id="add-fix-card-last4-group" style="display:none;"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="add-fix-card-last4" maxlength="4" inputmode="numeric" placeholder="לדוגמה: 5646"></div>' +
                '<div class="tx-edit-group"><label>תדירות</label>' + buildFixedFrequencySelectHtml('add-fix-frequency', 'add-fix-bimonthly-start-group', 'monthly') + '</div>' +
                '<div class="tx-edit-group" id="add-fix-bimonthly-start-group" style="display:none;"><label>חודש התחלה</label><select id="add-fix-bimonthly-start">' + buildMonthSelectOptionsHtml(new Date().getMonth() + 1) + '</select></div>' +
                '<div class="tx-edit-group"><label>הערות</label><textarea id="add-fix-notes"></textarea></div>';
        } else if (previewAddMode === 'dated') {
            // Settlement-identification correction: the built-in settlement category (key
            // 'dated' specifically) IS the monthly credit-card bill — it always leaves the bank,
            // so it gets no bank/credit choice at all, just its own always-required last-4-digits
            // field (which card this settlement is for). Any OTHER dated-baseType category (a
            // custom one the user created) keeps the normal bank/credit payment-method choice.
            var isAddingBuiltinSettlement = (previewAddCategoryKey === 'dated');
            html += categoryPickerHtml +
                '<div class="tx-edit-group"><label>שם ההוצאה</label><input type="text" id="add-dated-title" placeholder="לדוגמה: קניות בסופר"></div>' +
                '<div class="tx-edit-group"><label>סכום</label><input type="number" id="add-dated-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>תאריך החיוב</label><input type="date" id="add-dated-date" value="' + todayStr() + '"></div>';
            if (isAddingBuiltinSettlement) {
                html += '<div class="tx-edit-group"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="add-dated-card-last4" maxlength="4" inputmode="numeric" placeholder="לדוגמה: 5646"></div>' +
                    '<div class="tx-edit-group"><label>הערות (אופציונלי)</label><textarea id="add-dated-notes"></textarea></div>';
            } else {
                html += '<div class="tx-edit-group"><label>אמצעי תשלום</label><select id="add-dated-where" onchange="togglePreviewCardLast4Field(\'add-dated-card-last4-group\', this.value)"><option value="bank">חשבון בנק</option><option value="credit">כרטיס אשראי</option></select></div>' +
                    '<div class="tx-edit-group" id="add-dated-card-last4-group" style="display:none;"><label>4 ספרות אחרונות של הכרטיס</label><input type="text" id="add-dated-card-last4" maxlength="4" inputmode="numeric" placeholder="לדוגמה: 5646"></div>';
            }
        } else if (previewAddMode === 'cashWithdrawal') {
            // Version 1.4.2: no category picker — a cash withdrawal is never assigned to a
            // category (never a Home tile, never counted in consumer-spending/category totals).
            html += '<div class="settings-row-label" style="margin-bottom:4px;">משיכת מזומן</div>' +
                '<div class="settings-hint">מפחיתה את היתרה הצפויה בבנק, אך אינה נספרת כהוצאת צריכה רגילה.</div>' +
                '<div class="tx-edit-group"><label>סכום</label><input type="number" id="add-cash-amount" placeholder="₪"></div>' +
                '<div class="tx-edit-group"><label>תאריך המשיכה</label><input type="date" id="add-cash-date" value="' + todayStr() + '"></div>' +
                '<div class="tx-edit-group"><label>הערה (אופציונלי)</label><input type="text" id="add-cash-notes" placeholder="למשל: כספומט"></div>';
        }

        html += '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="addPreviewItem()">הוסף תנועה +</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewAdd()">ביטול</button>' +
            '</div></div>';

        return html;
    }

    function renderAddFormArea() {
        document.getElementById('preview-add-form-area').innerHTML = buildPreviewAddFormHtml();
    }

    // Called once, after every other initial render above — mirrors this file's existing
    // "define, then call once at load" convention. previewAddMode starts null, so this simply
    // confirms #preview-add-form-area starts empty (it already is, in the static HTML).
    renderAddFormArea();

    // Version 1.4.2 correction: plain Date.now() (used unconditionally as `obj.id` below, still
    // true for every OTHER item type — deliberately unchanged) is not collision-resistant against
    // a rapid double-submit/double-click creating two records in the same millisecond. This
    // matters specifically for cash withdrawals because projectedBalanceOpeningIncludedWithdrawalIds
    // identifies records strictly by id — a collision could misclassify two distinct withdrawals
    // as one. Kept as a plain NUMBER on purpose, not a string/UUID: handleRowMenuAction()/
    // handleDeleteMenuAction() parse `data-item-id` via parseInt(...,10), and
    // savePreviewInlineEdit()'s onclick embeds the id as an unquoted numeric literal — both are
    // generic, used by every item type, and assume a number project-wide. Introducing a string id
    // for only this one type would require touching those unrelated generic mechanisms, which is a
    // larger and riskier change than the actual problem (collision resistance) requires. Checked
    // against every existing item id (any type, not just cash withdrawals) before being accepted,
    // so it can never collide with anything already in `items`.
    function generateCashWithdrawalId() {
        var id = Date.now();
        while (items.some(function (it) { return it.id === id; })) { id++; }
        return id;
    }

    // Literal, branch-for-branch copy of index.html's own addNewItem() — same object shape, same
    // required-field checks, same exact alert() messages, same cardLast4 4-digit validation. The
    // only structural difference: `baseType`/`catKey` come from previewAddMode/previewAddCategoryKey
    // (already resolved when the form was opened) rather than from a shared `#main-type` <select>,
    // since Stage G.5 uses 3 separate entry routes instead of index.html's single dropdown+form.
    // On validation failure: alert() only, previewAddMode/previewAddCategoryKey are left untouched
    // and nothing is saved or re-rendered — the form stays open exactly as the user left it, same
    // as index.html's own addNewItem() and this file's own savePreviewInlineEdit() (Stage G.4).
    function addPreviewItem() {
        if (previewAddMode === null) { return; }

        var baseType = previewAddMode;
        var catKey = previewAddCategoryKey;
        // Version 1.4.2: a cash withdrawal is the one type with deliberately NO category — never a
        // Home tile, never a category total.
        if (baseType !== 'cashWithdrawal' && !catKey) { return; }

        var obj = { id: Date.now(), type: baseType, isArchived: false };
        if (baseType !== 'cashWithdrawal') { obj.displayCategory = catKey; }

        if (baseType === 'income') {
            obj.title = document.getElementById('add-inc-title').value.trim();
            obj.amount = parseFloat(document.getElementById('add-inc-amount').value);
            obj.day = document.getElementById('add-inc-day').value;
            if (!obj.title || isNaN(obj.amount)) { alert('מלא שם וסכום'); return; }
        } else if (baseType === 'loan') {
            obj.title = document.getElementById('add-loan-title').value.trim();
            obj.originalAmount = parseFloat(document.getElementById('add-loan-original').value) || 0;
            obj.amount = parseFloat(document.getElementById('add-loan-amount').value);
            obj.where = document.getElementById('add-loan-where').value;
            obj.interest = document.getElementById('add-loan-interest').value;
            obj.day = document.getElementById('add-loan-day').value;
            obj.total = document.getElementById('add-loan-total').value;
            obj.start = document.getElementById('add-loan-start').value;
            if (!obj.title || isNaN(obj.amount)) { alert('מלא שם וסכום החזר'); return; }
        } else if (baseType === 'variable') {
            obj.title = document.getElementById('add-var-title').value.trim();
            obj.originalAmount = parseFloat(document.getElementById('add-var-original').value) || 0;
            obj.amount = parseFloat(document.getElementById('add-var-amount').value);
            obj.day = document.getElementById('add-var-day').value;
            obj.total = document.getElementById('add-var-total').value;
            obj.start = document.getElementById('add-var-start').value;
            if (!obj.title || isNaN(obj.amount)) { alert('מלא שם ועלות חודשית'); return; }
            obj.where = document.getElementById('add-var-where').value;
            if (obj.where === 'credit') {
                obj.cardLast4 = document.getElementById('add-var-card-last4').value.trim();
                if (!/^\d{4}$/.test(obj.cardLast4)) { alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי'); return; }
            } else {
                obj.cardLast4 = '';
            }
        } else if (baseType === 'fixed') {
            obj.title = document.getElementById('add-fix-title').value.trim();
            obj.amount = parseFloat(document.getElementById('add-fix-amount').value);
            obj.day = document.getElementById('add-fix-day').value;
            obj.where = document.getElementById('add-fix-where').value;
            obj.notes = document.getElementById('add-fix-notes').value;
            if (!obj.title || isNaN(obj.amount)) { alert('מלא שם וסכום'); return; }
            if (obj.where === 'credit') {
                obj.cardLast4 = document.getElementById('add-fix-card-last4').value.trim();
                if (!/^\d{4}$/.test(obj.cardLast4)) { alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי'); return; }
            } else {
                obj.cardLast4 = '';
            }
            // Frequency-UI correction: one "תדירות" select (monthly/bimonthly/annual) — bimonthly
            // requires a valid starting month (native <select>, always a valid 1-12 value) and
            // resets period to the harmless default so no stale "שנתי" lingers from a prior
            // selection; monthly/annual set period directly and leave bimonthly fields cleared.
            var addFrequencyVal = document.getElementById('add-fix-frequency').value;
            if (addFrequencyVal === 'bimonthly') {
                var addBimonthlyStart = parseInt(document.getElementById('add-fix-bimonthly-start').value, 10);
                if (!isFinite(addBimonthlyStart) || addBimonthlyStart < 1 || addBimonthlyStart > 12) { alert('נא לבחור חודש התחלה תקין'); return; }
                obj.bimonthly = true;
                obj.bimonthlyStartMonth = addBimonthlyStart;
                obj.period = 'חודשי';
            } else {
                obj.bimonthly = false;
                obj.bimonthlyStartMonth = null;
                obj.period = (addFrequencyVal === 'annual') ? 'שנתי' : 'חודשי';
            }
        } else if (baseType === 'dated') {
            obj.title = document.getElementById('add-dated-title').value.trim();
            obj.start = document.getElementById('add-dated-date').value;
            obj.amount = parseFloat(document.getElementById('add-dated-amount').value);
            if (!obj.title || !obj.start || isNaN(obj.amount)) { alert('מלא שם, תאריך וסכום'); return; }
            // Settlement-identification correction: the built-in settlement category (catKey
            // 'dated') is always a bank outflow — no payment-method choice, last-4-digits always
            // required. Any other dated-baseType category keeps the normal bank/credit choice.
            if (catKey === 'dated') {
                obj.where = 'bank';
                obj.cardLast4 = document.getElementById('add-dated-card-last4').value.trim();
                if (!/^\d{4}$/.test(obj.cardLast4)) { alert('נא להזין בדיוק 4 ספרות אחרונות של הכרטיס עבור חיוב האשראי'); return; }
                obj.notes = document.getElementById('add-dated-notes').value;
            } else {
                obj.where = document.getElementById('add-dated-where').value;
                if (obj.where === 'credit') {
                    obj.cardLast4 = document.getElementById('add-dated-card-last4').value.trim();
                    if (!/^\d{4}$/.test(obj.cardLast4)) { alert('נא להזין בדיוק 4 ספרות עבור כרטיס האשראי'); return; }
                } else {
                    obj.cardLast4 = '';
                }
            }
        } else if (baseType === 'cashWithdrawal') {
            var wdAmount = sanitizePositiveAmount(document.getElementById('add-cash-amount').value);
            var wdDateStr = document.getElementById('add-cash-date').value;
            var wdNotes = document.getElementById('add-cash-notes').value;
            if (wdAmount === null) { alert('נא להזין סכום תקין (גדול מאפס)'); return; }
            if (!isValidDateStr(wdDateStr)) { alert('נא להזין תאריך תקין'); return; }
            var wdOpening = getProjectedBalanceOpeningConfig();
            if (wdOpening && cashflowDateOnly(parseLocalDateStr(wdDateStr)) < cashflowDateOnly(parseLocalDateStr(wdOpening.dateStr))) {
                alert('לא ניתן להזין משיכת מזומן בתאריך שלפני יתרת ההתחלה (' + wdOpening.dateStr + ').');
                return;
            }
            obj.id = generateCashWithdrawalId();
            obj.title = 'משיכת מזומן';
            obj.amount = wdAmount;
            obj.start = wdDateStr;
            obj.notes = wdNotes;
        }

        items.push(obj);
        savePreviewItems();

        // Version 1.4.6: the built-in credit-card settlement tile's "עודכן:" date — updated only on
        // a successful add TO THIS SPECIFIC category (catKey === 'dated', the stable key, not any
        // other dated-baseType category), never on delete (deletePreviewItem() has no code path
        // that touches this field), never using the charge date the user picked above.
        if (baseType === 'dated' && catKey === 'dated') {
            appSettings.creditCardSettlementUpdatedAt = todayStr();
            saveAppSettings();
        }

        previewAddMode = null;
        previewAddCategoryKey = null;

        // Approved clarification (product decision, ז׳.5): switch the Transactions screen to the
        // "active" filter FIRST — a freshly added item is never archived, so this guarantees it is
        // immediately visible — THEN re-render everything, in that exact order.
        setTxFilter('active');
        renderAllPreviewScreens();
        consumeTransient('txInline');
    }

    // =====================================================================================
    // ===== Stage 3ב.1: category management — pure logic functions only (not this file's    =====
    // ===== module-level state, moved up next to items/categoryConfig — see below — so it's  =====
    // ===== assigned before Stage 3ב.2's Settings-screen render runs on page load). All      =====
    // ===== persistence goes exclusively through the existing savePreviewCategoryConfig()     =====
    // ===== (Stage G.1), which itself only ever writes CONFIG_KEY — no other localStorage      =====
    // ===== key is ever read or written here.                                                  =====
    // =====================================================================================

    // Copied verbatim from index.html's own translateBaseType() — pure, no DOM access.
    function translateBaseType(bt) {
        if (bt === 'income') return 'הכנסה';
        if (bt === 'fixed') return 'קבוע';
        if (bt === 'variable') return 'תשלומים';
        if (bt === 'dated') return 'חיוב חד-פעמי';
        return '';
    }

    // Copied verbatim from index.html's own pickEmojiForCategory() — pure, no DOM access. Same
    // keyword-matching rules and baseType fallbacks, unchanged.
    function pickEmojiForCategory(title, baseType) {
        var rules = [
            { emoji: '💳', words: ['כרטיס אשראי', 'אשראי', 'כרטיס'] },
            { emoji: '🚗', words: ['רכב', 'מכונית', 'דלק', 'חניה', 'טסט'] },
            { emoji: '🏠', words: ['דירה', 'שכירות', 'משכנתא', 'בית', 'ועד בית'] },
            { emoji: '🍔', words: ['אוכל', 'מזון', 'סופר', 'מכולת', 'מסעדה', 'משלוחים'] },
            { emoji: '🏥', words: ['בריאות', 'רופא', 'תרופות', 'קופת חולים', 'שיניים'] },
            { emoji: '🎓', words: ['חינוך', 'לימודים', 'בית ספר', 'אוניברסיטה', 'קורס', 'גן'] },
            { emoji: '✈️', words: ['טיול', 'טיולים', 'חופשה', 'נסיעה', 'חול'] },
            { emoji: '🎬', words: ['בידור', 'סרטים', 'קולנוע', 'נטפליקס', 'סטרימינג', 'תיאטרון'] },
            { emoji: '🏋️', words: ['ספורט', 'חדר כושר', 'מכון כושר', 'אימון'] },
            { emoji: '👕', words: ['ביגוד', 'בגדים', 'נעליים', 'אופנה'] },
            { emoji: '💰', words: ['חיסכון', 'השקעות', 'פנסיה', 'קרן'] },
            { emoji: '📱', words: ['טלפון', 'סלולר', 'אינטרנט', 'תקשורת'] },
            { emoji: '💡', words: ['חשמל', 'מים', 'ארנונה', 'גז'] },
            { emoji: '🛡️', words: ['ביטוח'] },
            { emoji: '🎁', words: ['מתנות', 'מתנה'] },
            { emoji: '🐾', words: ['חיות', 'כלב', 'חתול', 'וטרינר'] },
            { emoji: '☕', words: ['קפה'] }
        ];
        for (var i = 0; i < rules.length; i++) {
            for (var j = 0; j < rules[i].words.length; j++) {
                if (title.indexOf(rules[i].words[j]) !== -1) return rules[i].emoji;
            }
        }
        if (baseType === 'income') return '💰';
        if (baseType === 'variable') return '🛍️';
        if (baseType === 'loan') return '🏦';
        if (baseType === 'dated') return '💳';
        return '🏷️';
    }

    // Read-only helper: true for exactly the 4 permanent keys above.
    function isBuiltInPreviewCategoryKey(key) {
        return PREVIEW_BUILTIN_CATEGORY_KEYS.indexOf(key) !== -1;
    }

    // Mirrors index.html's own deleteCustomCategory() membership check
    // (`items.some(function(i){return i.displayCategory === key;})`) exactly — including items
    // currently in the archive, since `items` holds both active and archived items and this does
    // not filter on isArchived. Read-only, no mutation.
    function categoryHasPreviewItems(key) {
        return items.some(function (i) { return i && i.displayCategory === key; });
    }

    // Mirrors index.html's own updateCategoryName(key, newVal) — same "empty/whitespace-only
    // value is a silent no-op" behavior, works for both built-in and custom keys (index.html
    // allows renaming both; only deletion is restricted to custom keys). Unlike
    // updateCategoryName(), takes the new label as a parameter instead of reading a DOM input
    // directly (no such input exists yet — that is Stage 3ב.2's job), and defensively no-ops on
    // an unknown key rather than assuming it always exists. Returns true on success, false on
    // no-op, so a future caller can decide how to react without this function touching the DOM.
    function renamePreviewCategory(key, newLabel) {
        if (!categoryConfig[key]) return false;
        var trimmed = (newLabel == null ? '' : String(newLabel)).trim();
        if (!trimmed) return false;
        categoryConfig[key].label = trimmed;
        savePreviewCategoryConfig();
        appendActivityLog('category_renamed', key + ' → ' + trimmed);
        renderAllPreviewScreens();
        return true;
    }

    // Single source of truth for which baseType values a new custom category may have — derived
    // from PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS (no separate hardcoded list) so the two can never
    // drift apart. Used by addPreviewCategory() below; Stage 3ב.2's <select> will independently
    // only ever offer these same 4 options as markup, but addPreviewCategory() does not rely on
    // that — it re-validates baseType itself regardless of caller.
    function getAllowedPreviewCustomCategoryBaseTypes() {
        return PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS.map(function (opt) { return opt.value; });
    }

    // Version 1.1, Stage 4.0.2: label text for a category's optional defaultDayOfMonth field,
    // worded per baseType per the approved decision — income gets "entry day" wording (money coming
    // in), fixed/variable/loan get "billing day" wording (money going out). Returns null for
    // 'dated', meaning the field must not be shown at all for that baseType — dated items are
    // one-time charges fully described by their own `start` date, so a recurring default day would
    // be a meaningless duplicate concept, not a second way to express the same thing.
    function getCategoryDefaultDayFieldLabel(baseType) {
        if (baseType === 'dated') { return null; }
        if (baseType === 'income') { return 'יום כניסה ברירת מחדל'; }
        return 'יום ירידה ברירת מחדל';
    }

    // Mirrors index.html's own addCustomCategory() — same key format ('custom_' + Date.now()),
    // same emoji-prefixed label construction, same alert() on an empty title (matching this
    // file's existing alert()-based validation convention for item add/edit, e.g. addPreviewItem
    // above). Unlike addCustomCategory(), takes title/baseType as parameters instead of reading
    // #new-cat-title/#new-cat-type directly (those elements do not exist yet — Stage 3ב.2).
    //
    // Two hardening fixes over the original mirror (approved after code review, before this
    // stage's first commit):
    // 1. baseType is validated against getAllowedPreviewCustomCategoryBaseTypes() — an
    //    unrecognized value is rejected (no category created, no categoryConfig mutation, no
    //    localStorage write, returns null) rather than trusted blindly. index.html itself never
    //    validates this (it trusts its <select> unconditionally), but this function does not rely
    //    on Stage 3ב.2's future <select> being the only caller.
    // 2. The candidate key starts as 'custom_' + Date.now() (same as index.html), but if that key
    //    already exists in categoryConfig (two calls landing in the same millisecond — verified
    //    possible in Stage 3ב.1's code review, deterministically reproduced with a fixed
    //    Date.now()), a numeric suffix is appended and incremented ('custom_<ts>_1',
    //    'custom_<ts>_2', ...) until a free key is found. An existing category is never
    //    overwritten. The timestamp is captured once (`ts`) and reused for every suffixed
    //    candidate, so the loop's own iteration speed cannot introduce a second collision.
    //
    // Returns the new key on success, null on any validation failure, so a future caller can react
    // (e.g. select the new category) without this function touching the DOM itself.
    // Version 1.1, Stage 4.0.2: added a 3rd, optional `defaultDayOfMonth` parameter — every
    // existing caller that only passes (title, baseType) is unaffected (defaultDayOfMonth is
    // undefined, the property is simply not set, byte-identical to before). Only a valid 1–31
    // number is ever stored; anything else (undefined, null, out of range, non-numeric) is silently
    // ignored rather than written as a bad value, mirroring this file's existing quiet-ignore
    // convention for optional fields with no dedicated alert() of their own.
    function addPreviewCategory(title, baseType, defaultDayOfMonth) {
        var trimmedTitle = (title == null ? '' : String(title)).trim();
        if (!trimmedTitle) { alert('נא להזין שם לקטגוריה'); return null; }
        if (getAllowedPreviewCustomCategoryBaseTypes().indexOf(baseType) === -1) { return null; }

        var ts = Date.now();
        var newKey = 'custom_' + ts;
        var suffix = 1;
        while (categoryConfig[newKey]) {
            newKey = 'custom_' + ts + '_' + suffix;
            suffix++;
        }

        var emoji = pickEmojiForCategory(trimmedTitle, baseType);
        categoryConfig[newKey] = { label: emoji + ' ' + trimmedTitle, baseType: baseType };
        if (typeof defaultDayOfMonth === 'number' && defaultDayOfMonth >= 1 && defaultDayOfMonth <= 31) {
            categoryConfig[newKey].defaultDayOfMonth = defaultDayOfMonth;
        }
        savePreviewCategoryConfig();
        appendActivityLog('category_created', categoryConfig[newKey].label);
        renderAllPreviewScreens();
        return newKey;
    }

    // Deliberately DOES NOT mirror index.html's own deleteCustomCategory(), which (after a native
    // confirm()) deletes a category's items along with the category itself. That behavior was
    // reviewed against the approved product decisions for Stage 3ב and is intentionally NOT
    // carried over here: built-in categories are never deletable, and a custom category that still
    // has items (active or archived) is also refused rather than silently deleting those items —
    // transactions are never auto-deleted by this function under any circumstance. The blocked
    // reason is returned (see PREVIEW_CATEGORY_DELETE_BLOCKED_REASON above) rather than shown via
    // alert()/confirm(), so Stage 3ב.2 can render the "clear message" the product decision calls
    // for as in-UI text. An unknown key is a strict no-op (no save, no render), same convention as
    // every other id/key-based mutation function in this file.
    function deletePreviewCategory(key) {
        if (!categoryConfig[key]) { return { success: false, reason: null }; }
        if (isBuiltInPreviewCategoryKey(key)) {
            return { success: false, reason: PREVIEW_CATEGORY_DELETE_BLOCKED_REASON.BUILT_IN };
        }
        if (categoryHasPreviewItems(key)) {
            return { success: false, reason: PREVIEW_CATEGORY_DELETE_BLOCKED_REASON.HAS_ITEMS };
        }
        var deletedLabel = (categoryConfig[key] && categoryConfig[key].label) || key;
        delete categoryConfig[key];
        savePreviewCategoryConfig();
        appendActivityLog('category_deleted', deletedLabel);
        renderAllPreviewScreens();
        return { success: true, reason: null };
    }

    // =====================================================================================
    // ===== Stage 3ב.2: category management UI — wires the Stage 3ב.1 logic above to real  =====
    // ===== Settings-screen forms. index-preview-v2.html only; no change to index.html/app.js/ =====
    // ===== styles.css. No forecast logic. No change to the Stage 3ב.1 functions themselves    =====
    // ===== (addPreviewCategory/renamePreviewCategory/deletePreviewCategory/etc. are called    =====
    // ===== exactly as they were left, unmodified). All persistence still goes exclusively     =====
    // ===== through savePreviewCategoryConfig() (CONFIG_KEY only), invoked from inside          =====
    // ===== those unmodified functions — nothing here touches localStorage directly.           =====
    // =====================================================================================

    // Renders the <option> list for the "type" <select> in the add-category form, from the same
    // PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS array addPreviewCategory() itself validates against —
    // so the picker can never offer a value the logic layer would reject.
    function buildPreviewCategoryTypeOptionsHtml() {
        var html = '';
        for (var i = 0; i < PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS.length; i++) {
            var opt = PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS[i];
            html += '<option value="' + opt.value + '">' + escapeHtml(opt.label) + '</option>';
        }
        return html;
    }

    // Opens the add-category form. Closes any other open category form first (rename/delete-
    // confirmation), same "one form at a time" rule already used for previewAddMode/
    // previewEditingId on the Transactions screen.
    // Version 1.4.1 correction: exactly one category-page inline sub-state (add/edit/delete-
    // confirm) can be open at a time (already enforced by resetPreviewCategoryFormsState() above,
    // called by every start* function below). One shared history entry ('categoryInline') covers
    // all three, dispatching Back to whichever state's own existing cancelX() is currently open —
    // same pattern as the Goals-screen group above.
    function ensureCategoryInlineTransient() {
        if (transientStack.length === 0 || transientStack[transientStack.length - 1].type !== 'categoryInline') {
            pushTransientState('categoryInline', cancelCurrentCategoryInlineState);
        }
    }
    function cancelCurrentCategoryInlineState() {
        if (previewDeletingCategoryKey !== null) { cancelPreviewDeleteCategory(); return; }
        if (previewEditingCategoryKey !== null) { cancelPreviewEditCategory(); return; }
        if (previewCategoryAddOpen) { cancelPreviewAddCategory(); return; }
    }

    function startPreviewAddCategory() {
        resetPreviewCategoryFormsState();
        previewCategoryAddOpen = true;
        renderCategoriesScreenFromRealData();
        ensureCategoryInlineTransient();
    }

    // Strict no-op on data: clears the open flag and re-renders, same convention as
    // cancelPreviewAdd()/cancelPreviewEdit() elsewhere in this file.
    function cancelPreviewAddCategory() {
        previewCategoryAddOpen = false;
        renderCategoriesScreenFromRealData();
        consumeTransient('categoryInline');
    }

    // Reads the add-category form's two inputs and calls the unmodified addPreviewCategory()
    // logic. On failure (empty title → addPreviewCategory() already alerts; invalid baseType →
    // silent, unreachable via this <select> since it only ever offers the allowed values) this
    // deliberately does NOT re-render — the form stays open exactly as the user left it, same
    // convention as addPreviewItem()/savePreviewInlineEdit() elsewhere in this file. On success,
    // addPreviewCategory() has already saved+re-rendered internally (with the form still marked
    // open at that point); this only needs to close the form and render once more.
    // Version 1.1, Stage 4.0.2: reads the optional day field (hidden entirely when the selected
    // type is 'dated', per getCategoryDefaultDayFieldLabel()'s null return — updatePreviewCategoryAddDayField()
    // below keeps the group's visibility in sync with the type <select>). An out-of-range or
    // non-numeric value the user typed anyway (e.g. by re-selecting a non-dated type after typing
    // something odd) blocks submission with an alert, same convention as every other validated
    // field in this file; an empty value is a legitimate "no default" and is simply passed through
    // as null.
    function submitPreviewAddCategory() {
        var titleInput = document.getElementById('cat-add-title');
        var typeSelect = document.getElementById('cat-add-basetype');
        var dayInput = document.getElementById('cat-add-day');
        var title = titleInput ? titleInput.value : '';
        var baseType = typeSelect ? typeSelect.value : '';

        var defaultDayOfMonth = null;
        if (baseType !== 'dated' && dayInput) {
            var dayRaw = dayInput.value.trim();
            if (dayRaw !== '') {
                var dayNum = parseInt(dayRaw, 10);
                if (!isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
                    alert('נא להזין יום בין 1 ל-31, או להשאיר את השדה ריק');
                    return;
                }
                defaultDayOfMonth = dayNum;
            }
        }

        var newKey = addPreviewCategory(title, baseType, defaultDayOfMonth);
        if (newKey === null) { return; }
        previewCategoryAddOpen = false;
        renderCategoriesScreenFromRealData();
        consumeTransient('categoryInline');
    }

    // Opens the rename form for one category. Available for both built-in and custom categories
    // (approved 3ב.2 product decision — only baseType change and deletion are restricted to/from
    // built-ins, not renaming). Unknown key is a strict no-op. Version 1.1, Stage 3: the rename
    // form now renders inside the category page's chip (renderCategoryFilterIndicator()) instead
    // of the Settings list — category editing/deleting moved there entirely; the Settings list
    // itself no longer shows or reacts to this state.
    function startPreviewEditCategory(key) {
        if (!categoryConfig[key]) { return; }
        resetPreviewCategoryFormsState();
        previewEditingCategoryKey = key;
        renderCategoryFilterIndicator();
        ensureCategoryInlineTransient();
    }

    function cancelPreviewEditCategory() {
        previewEditingCategoryKey = null;
        renderCategoryFilterIndicator();
        consumeTransient('categoryInline');
    }

    // Reads the rename form's input and calls the unmodified renamePreviewCategory() logic.
    // renamePreviewCategory() itself has no alert() of its own (Stage 3ב.1 left it a silent no-op
    // on an empty/whitespace value) — this UI-layer wrapper adds the alert() so the user gets the
    // same "empty required field" feedback as every other form in this file, without touching the
    // Stage 3ב.1 function itself. On failure: alert only, form stays open, nothing re-rendered. On
    // success, renamePreviewCategory() has already saved+re-rendered everything (list/total/Home
    // tile/chip label) internally via renderAllPreviewScreens() — this only needs to close the form
    // and render the chip once more to drop out of the rename state.
    // Version 1.1, Stage 4.0.2: in addition to the rename this already did, also reads the optional
    // day field (present only for non-'dated' categories — see renderCategoryFilterIndicator()) and
    // updates categoryConfig[key].defaultDayOfMonth accordingly: a blank value clears any existing
    // default (falls back to 1, per the "no default → 1" rule), an out-of-range/non-numeric value
    // blocks saving with an alert (matching this file's existing validation convention), and a
    // valid 1–31 value is stored. Per the approved decision, changing this default never touches
    // any already-saved item's own `item.day` — only categoryConfig[key] is written here, and every
    // existing item keeps whatever `day` (or lack of one) it already had.
    //
    // The day input's value is read and validated BEFORE calling renamePreviewCategory(), not
    // after: renamePreviewCategory() saves+re-renders internally (via renderAllPreviewScreens()),
    // which rebuilds this entire edit form from scratch (previewEditingCategoryKey is still `key`
    // at that point) — including a fresh #cat-edit-day-<key> element reset to categoryConfig's
    // still-unchanged value. Reading the DOM for the day field only after that render would silently
    // discard whatever the user had just typed. Capturing it first avoids that entirely.
    function submitPreviewEditCategory(key) {
        var input = document.getElementById('cat-edit-label-' + key);
        var newLabel = input ? input.value : '';

        var dayInputEl = document.getElementById('cat-edit-day-' + key);
        var dayRaw = dayInputEl ? dayInputEl.value.trim() : null;
        var dayNum = null;
        if (dayInputEl && dayRaw !== '') {
            dayNum = parseInt(dayRaw, 10);
            if (!isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
                alert('נא להזין יום בין 1 ל-31, או להשאיר את השדה ריק');
                return;
            }
        }

        var previousDay = categoryConfig[key] ? categoryConfig[key].defaultDayOfMonth : undefined;

        var ok = renamePreviewCategory(key, newLabel);
        if (!ok) { alert('נא להזין שם לקטגוריה'); return; }

        if (dayInputEl && categoryConfig[key]) {
            if (dayRaw === '') {
                delete categoryConfig[key].defaultDayOfMonth;
            } else {
                categoryConfig[key].defaultDayOfMonth = dayNum;
            }
            if (previousDay !== categoryConfig[key].defaultDayOfMonth) {
                appendActivityLog('default_day_changed', key + ' → ' + (categoryConfig[key].defaultDayOfMonth || 'ללא'));
            }
            savePreviewCategoryConfig();
            renderAllPreviewScreens();
        }

        previewEditingCategoryKey = null;
        renderCategoryFilterIndicator();
        consumeTransient('categoryInline');
    }

    // Opens the inline delete-confirmation for one category ("מחיקה" → "אישור מחיקה"/"ביטול")
    // instead of a native confirm(), per the approved 3ב.2 UI rules. The delete button itself is
    // only rendered for non-built-in categories (see renderCategoryFilterIndicator()), but this
    // function still checks isBuiltInPreviewCategoryKey defensively rather than trusting the
    // caller. Unknown key is a strict no-op.
    function startPreviewDeleteCategory(key) {
        if (!categoryConfig[key]) { return; }
        resetPreviewCategoryFormsState();
        previewDeletingCategoryKey = key;
        renderCategoryFilterIndicator();
        ensureCategoryInlineTransient();
    }

    function cancelPreviewDeleteCategory() {
        previewDeletingCategoryKey = null;
        renderCategoryFilterIndicator();
        consumeTransient('categoryInline');
    }

    // Calls the unmodified deletePreviewCategory() logic and turns its returned {success, reason}
    // into the "clear message" the original product decision calls for. On success,
    // deletePreviewCategory() has already saved+re-rendered everything internally (the category is
    // simply gone from Settings/Home from that point on); since the category page the user was
    // just viewing no longer exists, this additionally navigates back to category management
    // (Version 1.1, Stage 3 requirement 4). On failure, an alert() explains why (built-in category,
    // or a custom category that still has items — active or archived) and the chip returns to its
    // normal (non-confirming) state, still showing this same category page. BUILT_IN can only be
    // reached here defensively — the delete button is never rendered for a built-in category.
    function confirmPreviewDeleteCategory(key) {
        var wasCurrentCategory = (currentCategoryFilterKey === key);
        var result = deletePreviewCategory(key);
        previewDeletingCategoryKey = null;
        consumeTransient('categoryInline'); // this dialog closes either way (success, or an alert() explaining why not)
        if (result.success) {
            if (wasCurrentCategory) { showScreen('categories'); }
            renderAllPreviewScreens();
            return;
        }
        if (result.reason === PREVIEW_CATEGORY_DELETE_BLOCKED_REASON.BUILT_IN) {
            alert('לא ניתן למחוק קטגוריה מובנית.');
        } else if (result.reason === PREVIEW_CATEGORY_DELETE_BLOCKED_REASON.HAS_ITEMS) {
            alert('לא ניתן למחוק קטגוריה זו — קיימות לה תנועות (כולל בארכיון). יש להעביר או למחוק את התנועות תחילה.');
        }
        renderCategoryFilterIndicator();
    }

    // Version 1.1, Stage 3: every category is now a full "page" — clicking a row in the Settings
    // list navigates straight there (filterTransactionsByCategory(), the same navigation a Home
    // category tile already triggers — no new mechanism). The list itself is deliberately just a
    // clickable label: no edit/delete affordance here anymore (moved to the category page's chip,
    // see renderCategoryFilterIndicator()). A missing/non-string label falls back to the key
    // itself, same safety net this function has always had.
    function buildPreviewCategoryRowHtml(key) {
        var cfg = categoryConfig[key];
        var label = (cfg && typeof cfg.label === 'string' && cfg.label) ? cfg.label : key;
        return '<div class="category-row" onclick="filterTransactionsByCategory(\'' + key + '\')">' +
            '<div class="cat-label">' + escapeHtml(label) + '</div>' +
            '</div>';
    }

    // Builds the markup for the add-category area: a single toggle button when closed, or the
    // inline form when open. Reuses .tx-edit-form/.tx-edit-group/.tx-edit-actions/.tx-edit-save/
    // .tx-edit-cancel as-is (same reasoning as the add-transaction form, Stage G.5).
    // Version 1.1, Stage 4.0.2: called via the type <select>'s onchange to keep the optional
    // day-field's label/visibility in sync with whichever baseType is currently chosen — hidden
    // entirely for 'dated' (getCategoryDefaultDayFieldLabel() returns null), relabeled otherwise.
    // Purely a display toggle; never touches any stored value.
    function updatePreviewCategoryAddDayField(baseType) {
        var group = document.getElementById('cat-add-day-group');
        var labelEl = document.getElementById('cat-add-day-label');
        if (!group || !labelEl) { return; }
        var label = getCategoryDefaultDayFieldLabel(baseType);
        if (label === null) {
            group.style.display = 'none';
        } else {
            labelEl.textContent = label + ' (אופציונלי)';
            group.style.display = 'block';
        }
    }

    function buildPreviewCategoryAddAreaHtml() {
        if (!previewCategoryAddOpen) {
            // Version 1.4.2: the textual "+ הוסף קטגוריה" toggle button is removed — the shared
            // circular FAB (#fab-button, visible on this screen via updateFabVisibility()'s new
            // isOnCategoriesScreen() context) now opens the exact same startPreviewAddCategory()
            // form. The accessible name "הוסף קטגוריה" is preserved on the FAB itself, not deleted.
            return '';
        }
        // The type <select>'s first <option> (from PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS) is always
        // the browser's initial selection, so the day field's initial label/visibility must match
        // that same option, not a hardcoded assumption — kept in sync via
        // getCategoryDefaultDayFieldLabel(), the same function the onchange handler uses.
        var initialBaseType = PREVIEW_CUSTOM_CATEGORY_TYPE_OPTIONS[0].value;
        var initialDayLabel = getCategoryDefaultDayFieldLabel(initialBaseType);
        return '<div class="tx-edit-form">' +
            '<div class="tx-edit-group"><label>שם הקטגוריה</label><input type="text" id="cat-add-title"></div>' +
            '<div class="tx-edit-group"><label>סוג</label><select id="cat-add-basetype" onchange="updatePreviewCategoryAddDayField(this.value)">' + buildPreviewCategoryTypeOptionsHtml() + '</select></div>' +
            '<div class="tx-edit-group" id="cat-add-day-group" style="display:' + (initialDayLabel ? 'block' : 'none') + ';"><label id="cat-add-day-label">' + escapeHtml(initialDayLabel || '') + ' (אופציונלי)</label><input type="number" id="cat-add-day" min="1" max="31"></div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="submitPreviewAddCategory()">הוסף קטגוריה +</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelPreviewAddCategory()">ביטול</button>' +
            '</div></div>';
    }

    // =====================================================================================
    // ===== Version 1.1, Stage 4.0.3: the new, separate Settings screen — security (PIN/    =====
    // ===== auto-lock), appearance (theme/color/font size), in-app notifications, data       =====
    // ===== (backup/restore/CSV export/reset), experimental (empty registry), about, and     =====
    // ===== activity log. Category management itself is unchanged (see                       =====
    // ===== renderCategoriesScreenFromRealData() above) — nothing here touches items/         =====
    // ===== categoryConfig other than reading them for notifications/CSV export.              =====
    // =====================================================================================

    // ----- In-app notifications (Home screen) -----------------------------------------------

    function getTomorrowDateOnly() {
        var t = new Date();
        return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    }

    // Read-only: "upcoming payment/income tomorrow" reuses resolveEffectiveDay() (Stage 4.0.2) —
    // no new date logic. "completed obligation" reuses lastAutoArchivedTitles, set by this same
    // page load's runAutoArchiveSweep() run — i.e. only obligations that finished just now, not
    // every already-archived item ever.
    function computeHomeNotifications() {
        var notes = [];
        if (!appSettings || !appSettings.notifications) { return notes; }
        var tomorrowDay = getTomorrowDateOnly().getDate();

        if (appSettings.notifications.upcomingPayment) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (!it || it.isArchived) { continue; }
                if (it.type !== 'fixed' && it.type !== 'variable' && it.type !== 'loan') { continue; }
                if (resolveEffectiveDay(it) === tomorrowDay) {
                    notes.push({ title: 'תשלום צפוי מחר', detail: it.title || '', amount: it.amount });
                }
            }
        }
        if (appSettings.notifications.upcomingIncome) {
            for (var j = 0; j < items.length; j++) {
                var it2 = items[j];
                if (!it2 || it2.isArchived) { continue; }
                if (it2.type !== 'income') { continue; }
                if (resolveEffectiveDay(it2) === tomorrowDay) {
                    notes.push({ title: 'הכנסה צפויה מחר', detail: it2.title || '', amount: it2.amount });
                }
            }
        }
        if (appSettings.notifications.completedObligation && lastAutoArchivedTitles.length) {
            for (var k = 0; k < lastAutoArchivedTitles.length; k++) {
                notes.push({ title: 'התחייבות הסתיימה', detail: lastAutoArchivedTitles[k], amount: null });
            }
        }
        return notes;
    }

    // Reuses .attention-item/.attention-title/.attention-detail/.attention-amount — the same
    // card markup renderAttentionListFromRealData() already uses — for visual consistency.
    function renderHomeNotificationsFromRealData() {
        var el = document.getElementById('home-notifications-list');
        if (!el) { return; }
        var notes = computeHomeNotifications();
        var html = '';
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            html += '<div class="attention-item">' +
                '<div>' +
                    '<div class="attention-title">' + escapeHtml(n.title) + '</div>' +
                    '<div class="attention-detail">' + escapeHtml(n.detail) + '</div>' +
                '</div>' +
                (n.amount != null ? '<div class="attention-amount">' + escapeHtml(formatHomeCurrency(n.amount)) + '</div>' : '') +
            '</div>';
        }
        el.innerHTML = html;
    }

    // ----- Appearance: theme / primary color / font size -----------------------------------

    function setThemeSetting(theme) {
        appSettings.theme = theme;
        saveAppSettings();
        applySettingsToDom();
        refreshSettingsUI();
    }
    function setPrimaryColorSetting(colorKey) {
        appSettings.primaryColor = colorKey;
        saveAppSettings();
        applySettingsToDom();
        refreshSettingsUI();
    }
    function setFontSizeSetting(size) {
        appSettings.fontSize = size;
        saveAppSettings();
        applySettingsToDom();
        refreshSettingsUI();
    }

    function buildAppearanceSectionHtml() {
        var html = '<div class="settings-row-label">ערכת נושא</div><div class="settings-choice-row">';
        for (var i = 0; i < THEME_OPTIONS.length; i++) {
            var t = THEME_OPTIONS[i];
            html += '<button type="button" class="settings-choice-btn' + (appSettings.theme === t.key ? ' active' : '') + '" onclick="setThemeSetting(\'' + t.key + '\')">' + escapeHtml(t.label) + '</button>';
        }
        html += '</div>';

        html += '<div class="settings-row-label">צבע ראשי</div><div class="settings-color-row">';
        for (var j = 0; j < PRIMARY_COLOR_OPTIONS.length; j++) {
            var c = PRIMARY_COLOR_OPTIONS[j];
            html += '<button type="button" class="settings-color-swatch settings-color-' + c.key + (appSettings.primaryColor === c.key ? ' active' : '') + '" onclick="setPrimaryColorSetting(\'' + c.key + '\')" title="' + escapeHtml(c.label) + '" aria-label="' + escapeHtml(c.label) + '"></button>';
        }
        html += '</div>';

        html += '<div class="settings-row-label">גודל גופן</div><div class="settings-choice-row">';
        for (var k = 0; k < FONT_SIZE_OPTIONS.length; k++) {
            var f = FONT_SIZE_OPTIONS[k];
            html += '<button type="button" class="settings-choice-btn' + (appSettings.fontSize === f.key ? ' active' : '') + '" onclick="setFontSizeSetting(\'' + f.key + '\')">' + escapeHtml(f.label) + '</button>';
        }
        html += '</div>';
        return html;
    }

    // ----- Notifications toggles ------------------------------------------------------------

    function toggleNotificationSetting(key) {
        if (!appSettings.notifications) { appSettings.notifications = {}; }
        appSettings.notifications[key] = !appSettings.notifications[key];
        saveAppSettings();
        refreshSettingsUI();
        renderHomeNotificationsFromRealData();
    }

    function buildNotificationsSectionHtml() {
        var defs = [
            { key: 'upcomingPayment', label: 'תשלום שצפוי מחר' },
            { key: 'upcomingIncome', label: 'הכנסה שצפויה מחר' },
            { key: 'completedObligation', label: 'התחייבות שהסתיימה' }
        ];
        var html = '<div class="settings-hint">התראות אלה מוצגות בתוך האפליקציה בלבד, כשהיא פתוחה — אינן התראות מערכת (Push).</div>';
        for (var i = 0; i < defs.length; i++) {
            var d = defs[i];
            var on = !!(appSettings.notifications && appSettings.notifications[d.key]);
            html += '<div class="settings-row">' +
                '<div class="settings-row-label">' + escapeHtml(d.label) + '</div>' +
                '<button type="button" class="settings-toggle-btn' + (on ? ' on' : '') + '" onclick="toggleNotificationSetting(\'' + d.key + '\')" aria-pressed="' + on + '">' + (on ? 'פעיל' : 'כבוי') + '</button>' +
            '</div>';
        }
        return html;
    }

    // ----- Security: PIN ("privacy lock", not encryption) + auto-lock ----------------------

    function openPinForm(mode) {
        settingsPinFormMode = mode;
        refreshSettingsUI();
        pushTransientState('pinForm', closePinForm);
    }
    function closePinForm() {
        settingsPinFormMode = null;
        refreshSettingsUI();
        consumeTransient('pinForm');
    }

    async function submitSetPin() {
        var p1 = document.getElementById('pin-set-new');
        var p2 = document.getElementById('pin-set-confirm');
        var v1 = p1 ? p1.value : '';
        var v2 = p2 ? p2.value : '';
        if (!/^\d{4,6}$/.test(v1)) { alert('PIN חייב להכיל 4 עד 6 ספרות'); return; }
        if (v1 !== v2) { alert('הקודים אינם תואמים'); return; }
        var hash = await hashPin(v1);
        appSettings.pinHash = hash;
        appSettings.pinEnabled = true;
        saveAppSettings();
        closePinForm();
    }

    async function submitChangePin() {
        var cur = document.getElementById('pin-change-current');
        var p1 = document.getElementById('pin-change-new');
        var p2 = document.getElementById('pin-change-confirm');
        var curVal = cur ? cur.value : '';
        var v1 = p1 ? p1.value : '';
        var v2 = p2 ? p2.value : '';
        var curHash = await hashPin(curVal);
        if (curHash !== appSettings.pinHash) { alert('קוד נוכחי שגוי'); return; }
        if (!/^\d{4,6}$/.test(v1)) { alert('PIN חייב להכיל 4 עד 6 ספרות'); return; }
        if (v1 !== v2) { alert('הקודים אינם תואמים'); return; }
        appSettings.pinHash = await hashPin(v1);
        saveAppSettings();
        closePinForm();
    }

    async function submitRemovePin() {
        var cur = document.getElementById('pin-remove-current');
        var curVal = cur ? cur.value : '';
        var curHash = await hashPin(curVal);
        if (curHash !== appSettings.pinHash) { alert('קוד נוכחי שגוי'); return; }
        appSettings.pinHash = null;
        appSettings.pinEnabled = false;
        saveAppSettings();
        closePinForm();
    }

    // "שכחתי PIN": no current-PIN verification (that is the entire point) — requires typing the
    // exact word "איפוס" instead of a native confirm(), matching this file's existing typed-
    // confirmation convention. Cancels the PIN only; never touches items/categoryConfig.
    function submitForgotPin() {
        var input = document.getElementById('pin-forgot-word');
        var val = input ? input.value.trim() : '';
        if (val !== 'איפוס') { alert('יש להקליד בדיוק את המילה "איפוס" כדי לאשר'); return; }
        appSettings.pinHash = null;
        appSettings.pinEnabled = false;
        saveAppSettings();
        closePinForm();
    }

    function handleAutoLockChange(value) {
        appSettings.autoLockMinutes = (value === '') ? null : parseInt(value, 10);
        saveAppSettings();
    }

    function buildSettingsPinSectionHtml() {
        var html = '';
        if (appSettings.pinEnabled && appSettings.pinHash) {
            html += '<div class="settings-hint">PIN פעיל. הנתונים המקומיים אינם מוצפנים — זו נעילת פרטיות למסך בלבד.</div>';
            if (settingsPinFormMode === 'change') {
                html += '<div class="tx-edit-form">' +
                    '<div class="tx-edit-group"><label>קוד נוכחי</label><input type="password" inputmode="numeric" id="pin-change-current"></div>' +
                    '<div class="tx-edit-group"><label>קוד חדש (4–6 ספרות)</label><input type="password" inputmode="numeric" id="pin-change-new"></div>' +
                    '<div class="tx-edit-group"><label>אימות קוד חדש</label><input type="password" inputmode="numeric" id="pin-change-confirm"></div>' +
                    '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="submitChangePin()">שמור קוד חדש</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="closePinForm()">ביטול</button>' +
                    '</div></div>';
            } else if (settingsPinFormMode === 'remove') {
                html += '<div class="tx-edit-form">' +
                    '<div class="tx-edit-group"><label>קוד נוכחי</label><input type="password" inputmode="numeric" id="pin-remove-current"></div>' +
                    '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="submitRemovePin()">בטל PIN</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="closePinForm()">ביטול</button>' +
                    '</div></div>';
            } else if (settingsPinFormMode === 'forgot') {
                html += '<div class="tx-edit-form">' +
                    '<div class="settings-hint">שכחת/ה את הקוד? הקלד/י את המילה "איפוס" כדי לבטל את ה-PIN. הנתונים הפיננסיים לא יימחקו.</div>' +
                    '<div class="tx-edit-group"><label>הקלד/י "איפוס"</label><input type="text" id="pin-forgot-word"></div>' +
                    '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="submitForgotPin()">בטל PIN</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="closePinForm()">ביטול</button>' +
                    '</div></div>';
            } else {
                html += '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="openPinForm(\'change\')">שנה קוד</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="openPinForm(\'remove\')">בטל PIN</button>' +
                    '</div>' +
                    '<button type="button" class="cat-add-toggle" onclick="openPinForm(\'forgot\')">שכחתי את הקוד</button>';
            }
        } else {
            html += '<div class="settings-hint">PIN כבוי. הנתונים המקומיים אינם מוצפנים — PIN מוסיף נעילת פרטיות למסך בלבד.</div>';
            if (settingsPinFormMode === 'set') {
                html += '<div class="tx-edit-form">' +
                    '<div class="tx-edit-group"><label>קוד חדש (4–6 ספרות)</label><input type="password" inputmode="numeric" id="pin-set-new"></div>' +
                    '<div class="tx-edit-group"><label>אימות קוד</label><input type="password" inputmode="numeric" id="pin-set-confirm"></div>' +
                    '<div class="tx-edit-actions">' +
                    '<button type="button" class="tx-edit-save" onclick="submitSetPin()">הפעל PIN</button>' +
                    '<button type="button" class="tx-edit-cancel" onclick="closePinForm()">ביטול</button>' +
                    '</div></div>';
            } else {
                html += '<button type="button" class="cat-add-toggle" onclick="openPinForm(\'set\')">+ הגדר PIN</button>';
            }
        }
        return html;
    }

    function buildAutoLockSectionHtml() {
        var disabled = !(appSettings.pinEnabled && appSettings.pinHash);
        var val = (appSettings.autoLockMinutes === null || appSettings.autoLockMinutes === undefined) ? '' : String(appSettings.autoLockMinutes);
        var html = '<div class="settings-row" style="margin-top:6px;"><div class="settings-row-label">נעילה אוטומטית</div></div>';
        if (disabled) {
            html += '<div class="settings-hint">יש להפעיל PIN כדי להשתמש בנעילה אוטומטית.</div>';
        }
        html += '<select id="settings-autolock-select" ' + (disabled ? 'disabled' : '') + ' onchange="handleAutoLockChange(this.value)">' +
            '<option value=""' + (val === '' ? ' selected' : '') + '>כבויה</option>' +
            '<option value="0"' + (val === '0' ? ' selected' : '') + '>מיד</option>' +
            '<option value="1"' + (val === '1' ? ' selected' : '') + '>1 דקה</option>' +
            '<option value="5"' + (val === '5' ? ' selected' : '') + '>5 דקות</option>' +
            '<option value="15"' + (val === '15' ? ' selected' : '') + '>15 דקות</option>' +
            '<option value="30"' + (val === '30' ? ' selected' : '') + '>30 דקות</option>' +
            '</select>';
        return html;
    }

    // Lock overlay: shown at load when a PIN is set, and again after backgrounding past the
    // auto-lock threshold (see the visibilitychange listener below). isAppCurrentlyLocked() reads
    // the overlay's own display style as the single source of truth rather than a separate
    // tracked variable, so there is nothing that can go stale between the two.
    function isAppCurrentlyLocked() {
        var overlay = document.getElementById('lock-overlay');
        return !!(overlay && overlay.style.display === 'flex');
    }

    function shouldShowLockScreenOnLoad() {
        return !!(appSettings.pinEnabled && appSettings.pinHash);
    }

    function lockApp() {
        var overlay = document.getElementById('lock-overlay');
        if (overlay) { overlay.style.display = 'flex'; }
        var errEl = document.getElementById('lock-error');
        if (errEl) { errEl.textContent = ''; }
        var input = document.getElementById('lock-pin-input');
        if (input) {
            input.value = '';
            setTimeout(function () { input.focus(); }, 0);
        }
    }

    function unlockApp() {
        var overlay = document.getElementById('lock-overlay');
        if (overlay) { overlay.style.display = 'none'; }
    }

    async function verifyPinAndUnlock() {
        var input = document.getElementById('lock-pin-input');
        var errEl = document.getElementById('lock-error');
        var val = input ? input.value : '';
        if (!val) { return; }
        var hash = await hashPin(val);
        if (hash === appSettings.pinHash) {
            if (errEl) { errEl.textContent = ''; }
            if (input) { input.value = ''; }
            unlockApp();
        } else {
            if (errEl) { errEl.textContent = 'קוד שגוי, נסה/י שוב'; }
            if (input) { input.value = ''; input.focus(); }
        }
    }

    // Auto-lock: backgrounding the tab starts the clock; returning before the configured
    // threshold does NOT lock (approved requirement). autoLockMinutes === null means "off" — the
    // listener is then a no-op regardless of how long the tab was hidden.
    document.addEventListener('visibilitychange', function () {
        if (!appSettings.pinEnabled || !appSettings.pinHash) { return; }
        if (document.hidden) {
            appBackgroundedAt = Date.now();
            return;
        }
        if (appBackgroundedAt !== null && appSettings.autoLockMinutes !== null && appSettings.autoLockMinutes !== undefined) {
            var elapsedMs = Date.now() - appBackgroundedAt;
            var thresholdMs = appSettings.autoLockMinutes * 60000;
            if (elapsedMs >= thresholdMs) { lockApp(); }
        }
        appBackgroundedAt = null;
    });

    // ----- Data: backup / restore / CSV export / reset -------------------------------------

    // Milestone 4: schemaVersion 2 — a fresh export now includes family_finance_goals (via the
    // same prefix-sweep loop below, unchanged) plus its confirmedTransfers ledger field, still
    // empty until Milestone 5 populates it. The version bump exists ONLY to let restore-time code
    // distinguish "this backup was made before goals existed" (schemaVersion 1 or absent, so its
    // data object genuinely has no goals key) from "this backup is goals-aware and may legitimately
    // contain zero goals" (schemaVersion 2) — see isValidBackupShape()/renderRestorePreview()/
    // confirmRestoreBackup() below. APP_VERSION is unrelated and unchanged.
    // Milestone 4 correction: returns null (never a partial/misleading backup) when the local
    // Goals dataset is invalid — a schemaVersion-2 export must always represent trustworthy Goals
    // data, and a corrupted raw value can neither be safely exported as-is nor silently replaced
    // with an empty substitute (that would misrepresent real, still-recoverable local data as
    // "confirmed empty"). See exportBackupJson() for how the caller surfaces this.
    //
    // When valid, the prefix-sweep loop below is preserved exactly as before (every OTHER
    // family_finance_* key, present or not, behaves identically to prior milestones) — the one
    // addition is that a schemaVersion-2 backup must ALWAYS include family_finance_goals, even
    // when localStorage genuinely has no such key yet (the lazy-write model: a goals-aware device
    // that has never created a goal has none). That case is exported as a valid empty array
    // WITHOUT writing anything to localStorage — goalsState.valid is true with raw===null only
    // when the key is confirmed absent, never when it's malformed, so this substitution can never
    // mask real corrupted data.
    function collectAppLocalStorageBackup() {
        if (!goalsState.valid) { return null; }
        var backup = { schemaVersion: 2, exportedAt: nowTimestampStr(), data: {} };
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf('family_finance_') === 0) {
                backup.data[key] = localStorage.getItem(key);
            }
        }
        if (backup.data[GOALS_KEY] === undefined) { backup.data[GOALS_KEY] = '[]'; }
        return backup;
    }

    function downloadTextFile(filename, content, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportBackupJson() {
        var backup = collectAppLocalStorageBackup();
        if (!backup) {
            // Milestone 4 correction: refuse to produce a backup at all while local Goals data is
            // invalid — never a normalized/empty substitute, and never a claim of success. The raw
            // Goals value itself is untouched by this (collectAppLocalStorageBackup() never wrote
            // anything before returning null).
            var errEl = document.getElementById('restore-preview-area');
            if (errEl) { errEl.innerHTML = '<div class="settings-hint settings-error">לא ניתן ליצור גיבוי — נתוני היעדים המקומיים פגומים. יש לשחזר גיבוי תקין או לאפס את נתוני היעדים הפגומים (במסך יעדים) לפני יצירת גיבוי חדש.</div>'; }
            return;
        }
        downloadTextFile('familyfinance-backup-' + todayStr() + '.json', JSON.stringify(backup, null, 2), 'application/json');
        appendActivityLog('backup', 'גיבוי הורד (' + Object.keys(backup.data).length + ' מפתחות)');
        refreshSettingsUI();
    }

    // Validates shape + every value's own JSON.parse-ability before anything is trusted — a
    // corrupt/malformed file must never reach confirmRestoreBackup()'s write loop at all (see the
    // approved "קובץ פגום... לא יכתוב שום דבר" requirement).
    //
    // Data-restore fix: LOAN_BALANCE_VIEW_KEY is the ONE known key with a legacy raw (non-JSON)
    // stored form — see loadLoanBalanceView()/saveLoanBalanceView() above. A backup containing
    // either the new JSON-encoded "total"/"principal" OR the legacy raw total/principal must both
    // remain restorable (an existing user's already-exported backups must not be locked out by
    // this fix); anything else for this one key is still rejected. Every other family_finance_*
    // key keeps the original strict "must be JSON.parse-able" rule unchanged — this is a narrow,
    // key-specific exception, not a general relaxation of backup validation.
    // Version 1.4.2 correction: validates family_finance_data specifically to protect
    // cash-withdrawal records against a malformed or colliding id inside a restored backup —
    // handleRowMenuAction()/handleDeleteMenuAction()/savePreviewInlineEdit() and the
    // opening-snapshot's projectedBalanceOpeningIncludedWithdrawalIds list all identify a
    // cash-withdrawal strictly by item.id, so a collision or malformed value could silently
    // misidentify, merge, or corrupt the wrong record. Deliberately narrow: a collision between
    // two ORDINARY (non-cash-withdrawal) legacy items is NOT newly rejected here — that
    // protection never existed before this correction and stays out of scope, so an existing
    // backup that was previously accepted (however imperfect) is still accepted unless a
    // cash-withdrawal is one of the colliding parties.
    function isValidItemsArrayForRestore(itemsArr) {
        if (!Array.isArray(itemsArr)) { return false; }
        var idCounts = {};
        for (var i = 0; i < itemsArr.length; i++) {
            var raw = itemsArr[i];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return false; }
            if (typeof raw.id === 'number' && isFinite(raw.id)) {
                idCounts[raw.id] = (idCounts[raw.id] || 0) + 1;
            }
        }
        for (var j = 0; j < itemsArr.length; j++) {
            var it = itemsArr[j];
            if (it.type !== 'cashWithdrawal') { continue; }
            var id = it.id;
            if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) { return false; }
            if ((idCounts[id] || 0) > 1) { return false; } // collides with ANY other item (any type) sharing this exact id
            if (typeof it.amount !== 'number' || !isFinite(it.amount) || it.amount <= 0) { return false; }
            if (!isValidDateStr(it.start)) { return false; }
            if (typeof it.title !== 'string' || !it.title) { return false; }
            if (it.notes !== undefined && typeof it.notes !== 'string') { return false; }
            if (typeof it.isArchived !== 'boolean') { return false; }
        }
        return true;
    }

    function isValidBackupShape(obj) {
        if (!obj || typeof obj !== 'object') { return false; }
        if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) { return false; }
        var keys = Object.keys(obj.data);
        if (keys.length === 0) { return false; }
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k.indexOf('family_finance_') !== 0) { return false; }
            if (typeof obj.data[k] !== 'string') { return false; }
            if (k === LOAN_BALANCE_VIEW_KEY) {
                var lbvValue;
                try { lbvValue = JSON.parse(obj.data[k]); } catch (e) { lbvValue = obj.data[k]; }
                if (lbvValue !== 'total' && lbvValue !== 'principal') { return false; }
                continue;
            }
            try { JSON.parse(obj.data[k]); } catch (e) { return false; }
        }
        try {
            if (obj.data[DATA_KEY] !== undefined && !isValidItemsArrayForRestore(JSON.parse(obj.data[DATA_KEY]))) { return false; }
            if (obj.data[CONFIG_KEY] !== undefined) {
                var cfg = JSON.parse(obj.data[CONFIG_KEY]);
                if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { return false; }
            }
            if (obj.data[SETTINGS_KEY] !== undefined) {
                var st = JSON.parse(obj.data[SETTINGS_KEY]);
                if (!st || typeof st !== 'object' || Array.isArray(st)) { return false; }
            }
            if (obj.data[ACTIVITY_LOG_KEY] !== undefined && !Array.isArray(JSON.parse(obj.data[ACTIVITY_LOG_KEY]))) { return false; }
            // Milestone 4 correction: schemaVersion is the ONLY signal used to decide whether the
            // goals key is mandatory — never key-presence-as-a-proxy (a Version 1 backup simply
            // never had goals; that is not the same question as "is this Version 2 backup valid").
            // For a goals-aware (schemaVersion >= 2) backup, family_finance_goals is REQUIRED —
            // its absence makes the whole backup invalid (never silently treated as "no goals to
            // restore"; see renderRestorePreview()/confirmRestoreBackup(), which can now assume
            // this key is always present and valid for any backup that reaches them as Version 2).
            // A present value must still be a fully well-formed goals array (every goal AND
            // component individually valid, no duplicate ids) — strict, all-or-nothing, so a
            // single malformed goal rejects the ENTIRE backup before any write happens.
            //
            // For a non-goals-aware (Version 1 or unversioned) backup, a goals key is neither
            // required nor validated here — confirmRestoreBackup() explicitly excludes any such
            // key from what it writes regardless of content, so its validity is moot.
            var isGoalsAwareVersion = typeof obj.schemaVersion === 'number' && obj.schemaVersion >= 2;
            if (isGoalsAwareVersion) {
                if (obj.data[GOALS_KEY] === undefined) { return false; }
                var goalsArr = JSON.parse(obj.data[GOALS_KEY]);
                if (isValidGoalsArrayStrict(goalsArr) === null) { return false; }
            }
        } catch (e) { return false; }
        return true;
    }

    // Shared by BOTH restore entry points — the file picker (handleRestoreFileSelected) and the
    // Android fallback "הדבק גיבוי" paste path (checkPastedRestoreBackup) — so there is exactly one
    // parse/validate/preview pipeline for a backup regardless of how its raw text reached the app.
    // Deliberately does not know or care whether the text came from a File or a <textarea>.
    function processRestoreText(rawText) {
        var parsed = null;
        try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }
        if (!parsed || !isValidBackupShape(parsed)) {
            pendingRestoreBackup = null;
            var el = document.getElementById('restore-preview-area');
            if (el) { el.innerHTML = '<div class="settings-hint settings-error">קובץ הגיבוי אינו תקין — לא בוצע שינוי.</div>'; }
            return;
        }
        pendingRestoreBackup = parsed;
        renderRestorePreview();
        ensureRestorePanelTransient();
    }

    // Version 1.4.1 correction: the restore paste-panel (restorePasteMode) and the parsed-backup
    // preview/confirm state (pendingRestoreBackup) are two phases of the SAME "restoring a backup"
    // flow (checkPastedRestoreBackup() transitions directly from one to the other without ever
    // fully closing) — one shared history entry covers both, dispatching Back to whichever phase
    // is currently open, using that phase's own existing Cancel semantics (never confirms/writes).
    function ensureRestorePanelTransient() {
        if (transientStack.length === 0 || transientStack[transientStack.length - 1].type !== 'restorePanel') {
            pushTransientState('restorePanel', cancelCurrentRestorePanelState);
        }
    }
    function cancelCurrentRestorePanelState() {
        if (restorePasteMode) { closeRestorePastePanel(); return; }
        if (pendingRestoreBackup) { cancelRestoreBackup(); return; }
    }

    // Data-restore fix (Android/mobile): a native file-picker cancel does not fire `change` in
    // this app's supported browsers, so reaching this function with no file is not the normal
    // cancel path — it was previously a silent no-op, which is indistinguishable from "restore is
    // broken" to a user (this was the actual reported failure on Android: some document providers
    // return no file for reasons outside this app's control, e.g. accept-filtering). Shown with the
    // neutral .settings-hint style (not .settings-error) since the underlying cause here is
    // genuinely ambiguous — deliberately not phrased as an error/failure.
    function handleRestoreFileSelected(inputEl) {
        closeRestorePastePanel();
        var file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) {
            var noFileEl = document.getElementById('restore-preview-area');
            if (noFileEl) { noFileEl.innerHTML = '<div class="settings-hint">לא זוהה קובץ שנבחר. נסה לבחור שוב קובץ גיבוי מסוג JSON.</div>'; }
            return;
        }
        var reader = new FileReader();
        reader.onload = function () { processRestoreText(reader.result); };
        reader.readAsText(file);
    }

    // Milestone 4 correction: goals-aware version of the restore preview. `isValidBackupShape()`
    // now guarantees that whenever isGoalsAwareBackup is true, data[GOALS_KEY] is ALWAYS present
    // and ALWAYS a fully well-formed array (its absence, or malformed content, already rejected
    // the entire backup upstream — pendingRestoreBackup can never reach this function in that
    // state) — so the branch below is a simple, unconditional schemaVersion check, not a
    // key-presence guess. Version detection uses ONLY pendingRestoreBackup.schemaVersion (never
    // key-presence-as-a-proxy — see collectAppLocalStorageBackup()'s comment for why: a goals-
    // aware device that has simply never created a goal can also lack the key locally, which must
    // never be confused with "this Version 2 BACKUP is missing its mandatory goals key").
    function renderRestorePreview() {
        var el = document.getElementById('restore-preview-area');
        if (!el) { return; }
        if (!pendingRestoreBackup) { el.innerHTML = ''; return; }
        var data = pendingRestoreBackup.data;
        var itemCount = data[DATA_KEY] ? JSON.parse(data[DATA_KEY]).length : 0;
        var catCount = data[CONFIG_KEY] ? Object.keys(JSON.parse(data[CONFIG_KEY])).length : 0;
        var hasSettings = !!data[SETTINGS_KEY];
        var logCount = data[ACTIVITY_LOG_KEY] ? JSON.parse(data[ACTIVITY_LOG_KEY]).length : 0;

        var isGoalsAwareBackup = typeof pendingRestoreBackup.schemaVersion === 'number' && pendingRestoreBackup.schemaVersion >= 2;

        var goalsLine, versionNoteHtml, deleteGoalsHtml;
        if (!isGoalsAwareBackup) {
            // Local Goals may themselves be valid, genuinely empty, or corrupted — the message
            // and checkbox must describe reality accurately in every case, never claim a count
            // that isn't actually known.
            var hasExistingGoalsData = goalsState.raw !== null;
            if (!goalsState.valid) {
                goalsLine = '<li>יעדים: לא כלולים בגיבוי זה — הנתונים הקיימים במכשיר פגומים ויישמרו ללא שינוי</li>';
            } else {
                goalsLine = '<li>יעדים: לא כלולים בגיבוי זה — היעדים הקיימים במכשיר (' + goals.length + ') יישמרו</li>';
            }
            versionNoteHtml = '<div class="restore-v1-note">הגיבוי נוצר לפני הוספת מערכת היעדים. הנתונים הכספיים ישוחזרו והיעדים הקיימים יישמרו.</div>';
            var deleteLabel = goalsState.valid ? ('למחוק גם את ' + goals.length + ' היעדים הקיימים במכשיר') : 'למחוק גם את נתוני היעדים הפגומים במכשיר';
            deleteGoalsHtml = hasExistingGoalsData ?
                ('<div class="tx-edit-group">' +
                    '<label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;">' +
                        '<input type="checkbox" id="restore-delete-goals-checkbox" onchange="onRestoreDeleteGoalsToggle()" style="width:auto;min-height:20px;min-width:20px;">' +
                        '<span>' + escapeHtml(deleteLabel) + '</span>' +
                    '</label>' +
                    '<div class="settings-hint settings-error" id="restore-delete-goals-warning" style="display:none;">כל נתוני היעדים הקיימים יימחקו לצמיתות בעת השחזור. לא ניתן לבטל לאחר הביצוע.</div>' +
                '</div>') : '';
        } else {
            var backupGoalsCount = JSON.parse(data[GOALS_KEY]).length;
            goalsLine = '<li>יעדים: ' + backupGoalsCount + '</li>';
            versionNoteHtml = '';
            deleteGoalsHtml = '';
        }

        el.innerHTML = '<div class="tx-edit-form">' +
            '<div class="settings-hint">הגיבוי שנבחר יחליף את הנתונים הנוכחיים:</div>' +
            versionNoteHtml +
            '<ul class="restore-summary-list">' +
                '<li>תנועות: ' + itemCount + '</li>' +
                '<li>קטגוריות: ' + catCount + '</li>' +
                '<li>הגדרות: ' + (hasSettings ? 'כן' : 'לא') + '</li>' +
                '<li>יומן פעילות: ' + logCount + ' רשומות</li>' +
                goalsLine +
            '</ul>' +
            deleteGoalsHtml +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="settings-danger-btn" id="restore-confirm-btn" onclick="confirmRestoreBackup()">כן, שחזר ודרוס נתונים קיימים</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelRestoreBackup()">ביטול</button>' +
            '</div></div>';
    }

    // Pure DOM update (no re-render, same convention as clearFieldError/setFieldError above) —
    // makes the destructive consequence of the opt-in checkbox explicit directly on the button
    // that actually performs the irreversible action, without needing a second confirmation step.
    // Leaving the checkbox unchecked (the default) never touches this at all — goals stay safe.
    function onRestoreDeleteGoalsToggle() {
        var cb = document.getElementById('restore-delete-goals-checkbox');
        var warn = document.getElementById('restore-delete-goals-warning');
        var btn = document.getElementById('restore-confirm-btn');
        if (!cb || !btn) { return; }
        if (warn) { warn.style.display = cb.checked ? '' : 'none'; }
        btn.textContent = cb.checked ? 'כן, שחזר ודרוס נתונים קיימים (וגם מחק את היעדים)' : 'כן, שחזר ודרוס נתונים קיימים';
    }

    function cancelRestoreBackup() {
        pendingRestoreBackup = null;
        var el = document.getElementById('restore-preview-area');
        if (el) { el.innerHTML = ''; }
        consumeTransient('restorePanel');
    }

    // Android fallback restore path: some native file pickers never return a usable file at all
    // (the actual reported failure this exists for), so this lets a user open their backup file in
    // any app, copy its full text, and paste it directly — bypassing the file picker entirely.
    // Feeds the exact same processRestoreText()/isValidBackupShape()/renderRestorePreview()/
    // confirmRestoreBackup() pipeline as the file path; no second restore engine.
    function openRestorePastePanel() {
        cancelRestoreBackup();
        restorePasteMode = true;
        renderRestorePasteArea();
        ensureRestorePanelTransient();
    }

    function closeRestorePastePanel() {
        restorePasteMode = false;
        renderRestorePasteArea();
        pendingRestoreBackup = null;
        var pv = document.getElementById('restore-preview-area');
        if (pv) { pv.innerHTML = ''; }
        consumeTransient('restorePanel');
    }

    // Re-render entry point (also called from renderSettingsDetailScreen()) so the open/closed
    // panel state survives a re-render triggered by an unrelated action — same convention as
    // renderResetConfirmArea(). Pasted text itself is intentionally not kept in any JS variable
    // (see confirmRestoreBackup()'s data-safety comment), so a re-render always opens an empty
    // textarea; that is consistent with never persisting pasted backup content beyond the DOM.
    function renderRestorePasteArea() {
        var el = document.getElementById('restore-paste-area');
        if (!el) { return; }
        if (!restorePasteMode) { el.innerHTML = ''; return; }
        el.innerHTML = '<div class="tx-edit-form">' +
            '<div class="settings-hint">פתח את קובץ הגיבוי, העתק את כל תוכנו והדבק כאן.</div>' +
            '<div class="tx-edit-group"><textarea id="restore-paste-textarea" class="restore-paste-textarea" dir="ltr" spellcheck="false" autocomplete="off"></textarea></div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="checkPastedRestoreBackup()">בדוק גיבוי</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="closeRestorePastePanel()">ביטול</button>' +
            '</div></div>';
    }

    function checkPastedRestoreBackup() {
        var ta = document.getElementById('restore-paste-textarea');
        var text = ta ? ta.value : '';
        if (!text || !text.trim()) {
            var el = document.getElementById('restore-preview-area');
            if (el) { el.innerHTML = '<div class="settings-hint">לא הודבק תוכן גיבוי.</div>'; }
            return;
        }
        processRestoreText(text);
        // Once parsing succeeds, the shared preview/confirm/cancel UI (renderRestorePreview()) is
        // the single live surface for this pending restore — close the paste panel so the textarea
        // isn't left showing alongside it. An invalid-backup result leaves pendingRestoreBackup
        // null, so the panel deliberately stays open for the user to correct/retry.
        if (pendingRestoreBackup) {
            restorePasteMode = false;
            renderRestorePasteArea();
        }
    }

    // Data-restore fix: snapshots every current family_finance_* key/value BEFORE a restore
    // attempts any write, so a mid-restore failure (e.g. quota exceeded) can be undone exactly —
    // scoped strictly to family_finance_* keys, never touches anything else in localStorage.
    function snapshotFamilyFinanceStorage() {
        var snapshot = {};
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf('family_finance_') === 0) { snapshot[key] = localStorage.getItem(key); }
        }
        return snapshot;
    }

    // Reverts to `snapshot` after a failed restore attempt — this is a best-effort *compensating*
    // rollback, not a true atomic transaction (plain localStorage has no multi-key transaction
    // primitive to build one on): every key that existed beforehand is force-set back to its exact
    // prior value, regardless of which keys the failed write loop actually reached, so IF every
    // write below succeeds the result is exactly the pre-restore state — never a guess about how
    // far the original loop got. Only once every original key is safely back in place does it
    // remove any key in `attemptedKeys` that did NOT exist in the snapshot (newly introduced by the
    // failed backup) — restoring real, already-existing user data is the higher-stakes operation,
    // so it happens first; a lingering extra key is a smaller deviation than losing original data.
    // Original keys are themselves restored in priority order (financially-significant keys first)
    // for the same reason, in case even this rollback can only partially complete. Returns false
    // (instead of throwing) the moment ANY of these writes/removals itself fails — the caller must
    // then report that full restoration of the original state cannot be guaranteed, rather than
    // silently claiming the rollback succeeded.
    function restoreFamilyFinanceSnapshot(snapshot, attemptedKeys) {
        var snapshotKeys = Object.keys(snapshot);
        var priorityOrder = [DATA_KEY, CONFIG_KEY, SETTINGS_KEY, ACTIVITY_LOG_KEY, GOALS_KEY, CATEGORY_TILE_ORDER_KEY, LOAN_BALANCE_VIEW_KEY];
        var orderedSnapshotKeys = priorityOrder.filter(function (k) { return snapshotKeys.indexOf(k) !== -1; })
            .concat(snapshotKeys.filter(function (k) { return priorityOrder.indexOf(k) === -1; }));

        for (var j = 0; j < orderedSnapshotKeys.length; j++) {
            var sk = orderedSnapshotKeys[j];
            try { localStorage.setItem(sk, snapshot[sk]); } catch (e) { return false; }
        }
        for (var i = 0; i < attemptedKeys.length; i++) {
            var k = attemptedKeys[i];
            if (!(k in snapshot)) {
                try { localStorage.removeItem(k); } catch (e) { return false; }
            }
        }
        return true;
    }

    // Restore is now a best-effort transactional restore with compensating rollback over
    // family_finance_* keys — NOT a true atomic transaction (plain localStorage offers no such
    // guarantee across multiple keys). A snapshot is taken first, every backup key is written, and
    // if ANY write throws: restoreFamilyFinanceSnapshot() attempts to undo it. Two distinct
    // outcomes are reported, never conflated: (1) write failed but rollback succeeded — original
    // state is restored, and this can be stated with confidence; (2) write failed AND the rollback
    // itself also failed — a critical-failure message says explicitly that full restoration of the
    // original state cannot be guaranteed, since it genuinely can't be. Neither failure case ever
    // reloads or reports success. The 'data_restore' activity-log entry
    // is intentionally appended AFTER the transaction above has already fully succeeded, as a
    // separate best-effort step: by that point real user data has already been correctly restored,
    // so a failure appending one audit-log line must not retroactively undo it or be reported as a
    // restore failure — that would both discard good data and create a contradictory audit trail
    // (a 'data_restore' entry existing, or not, should never imply the data restore itself
    // failed when it didn't). location.reload() then re-derives every in-memory variable from the
    // new localStorage state instead of hand-patching each one here.
    function confirmRestoreBackup() {
        if (!pendingRestoreBackup || !isValidBackupShape(pendingRestoreBackup)) { return; }
        var data = pendingRestoreBackup.data;
        var isGoalsAwareVersion = typeof pendingRestoreBackup.schemaVersion === 'number' && pendingRestoreBackup.schemaVersion >= 2;

        // Milestone 4 correction: goals-key inclusion is gated STRICTLY by schemaVersion, never by
        // mere key presence — a non-goals-aware (Version 1) backup's data MUST NOT restore a goals
        // key even if one happens to be present in it (defensively ignored/ never trusted; per the
        // approved rule, "unexpected family_finance_goals data inside a Version 1 backup must be
        // ignored and never restored"). For a goals-aware (Version 2) backup, isValidBackupShape()
        // already guarantees the key is present and fully valid, so it always passes through as-is.
        var effectiveData = {};
        for (var ek in data) {
            if (!isGoalsAwareVersion && ek === GOALS_KEY) { continue; }
            effectiveData[ek] = data[ek];
        }

        // The explicit, opt-in "also delete current goals" checkbox (shown only for a Version 1 /
        // non-goals-aware backup — see renderRestorePreview()). Left UNCHECKED (the default), the
        // write loop below simply never touches GOALS_KEY at all — every goal (or, if corrupted,
        // the exact corrupted raw value) currently on the device survives untouched, byte-for-byte,
        // with zero special-case code. Only when explicitly checked do we add ONE extra key to the
        // write plan, set to a valid empty array, so the SAME existing snapshot/rollback
        // transaction below covers it identically to every other key.
        var deleteGoalsCheckbox = document.getElementById('restore-delete-goals-checkbox');
        if (!isGoalsAwareVersion && deleteGoalsCheckbox && deleteGoalsCheckbox.checked) {
            effectiveData[GOALS_KEY] = '[]';
        }
        var keys = Object.keys(effectiveData);
        data = effectiveData;

        var snapshot = snapshotFamilyFinanceStorage();
        var writeFailed = false;
        for (var i = 0; i < keys.length; i++) {
            try {
                localStorage.setItem(keys[i], data[keys[i]]);
            } catch (e) {
                writeFailed = true;
                break;
            }
        }

        if (writeFailed) {
            var rolledBack = restoreFamilyFinanceSnapshot(snapshot, keys);
            pendingRestoreBackup = null;
            var el = document.getElementById('restore-preview-area');
            if (el) {
                el.innerHTML = rolledBack ?
                    '<div class="settings-hint settings-error">שחזור נכשל — הפעולה בוטלה והנתונים הקודמים שוחזרו במלואם. לא בוצע שינוי.</div>' :
                    '<div class="settings-hint settings-error">שגיאה קריטית בשחזור — הכתיבה נכשלה וגם ביטול הפעולה נכשל. לא ניתן להבטיח שהמצב המקורי שוחזר במלואו. אין לסמוך על הנתונים המוצגים ללא בדיקה ידנית — מומלץ לרענן ולבדוק, ובמידת הצורך לשחזר גיבוי שוב.</div>';
            }
            consumeTransient('restorePanel');
            return;
        }

        try {
            var freshLog = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
            if (!Array.isArray(freshLog)) { freshLog = []; }
            freshLog.push({ ts: nowTimestampStr(), action: 'data_restore', detail: 'שוחזר מגיבוי (' + keys.length + ' מפתחות)' });
            if (freshLog.length > ACTIVITY_LOG_MAX) { freshLog.splice(0, freshLog.length - ACTIVITY_LOG_MAX); }
            localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(freshLog));
        } catch (e) { }
        pendingRestoreBackup = null;
        location.reload();
    }

    function csvEscapeField(val) {
        if (val === null || val === undefined) { return ''; }
        var s = String(val);
        if (/[",\n\r]/.test(s)) { s = '"' + s.replace(/"/g, '""') + '"'; }
        return s;
    }

    function exportTransactionsCsv() {
        var columns = ['id', 'type', 'displayCategory', 'title', 'amount', 'originalAmount', 'start', 'day', 'total', 'interest', 'where', 'cardLast4', 'period', 'notes', 'isArchived', 'archiveReason', 'archivedAt', 'customFields'];
        var lines = [columns.join(',')];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var row = columns.map(function (col) {
                if (col === 'customFields') { return csvEscapeField(it.customFields ? JSON.stringify(it.customFields) : ''); }
                return csvEscapeField(it[col]);
            });
            lines.push(row.join(','));
        }
        // UTF-8 BOM so Excel opens Hebrew text correctly instead of mojibake.
        downloadTextFile('familyfinance-transactions-' + todayStr() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
    }

    function startResetAllData() {
        resetConfirmMode = true;
        renderResetConfirmArea();
        // Version 1.4.1: Back cancels this destructive confirmation exactly like its own "ביטול"
        // button — never confirms/deletes. See cancelResetAllData()/consumeTransient().
        pushTransientState('resetConfirm', cancelResetAllData);
    }
    function cancelResetAllData() {
        resetConfirmMode = false;
        renderResetConfirmArea();
        consumeTransient('resetConfirm');
    }
    function renderResetConfirmArea() {
        var el = document.getElementById('reset-confirm-area');
        if (!el) { return; }
        if (!resetConfirmMode) { el.innerHTML = ''; return; }
        el.innerHTML = '<div class="tx-edit-form">' +
            '<div class="settings-hint settings-error">פעולה זו תמחק לצמיתות את כל הנתונים, הקטגוריות, ההגדרות ויומן הפעילות. לא ניתן לבטל לאחר הביצוע.</div>' +
            '<div class="tx-edit-group"><label>הקלד/י "איפוס" לאישור</label><input type="text" id="reset-confirm-word"></div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="settings-danger-btn" onclick="confirmResetAllData()">מחק הכל</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelResetAllData()">ביטול</button>' +
            '</div></div>';
    }
    // Keys are collected first, then removed in a second loop — removing while iterating
    // localStorage would shift indexes and skip keys.
    function confirmResetAllData() {
        var input = document.getElementById('reset-confirm-word');
        var val = input ? input.value.trim() : '';
        if (val !== 'איפוס') { alert('יש להקליד בדיוק את המילה "איפוס" כדי לאשר'); return; }
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('family_finance_') === 0) { keysToRemove.push(k); }
        }
        for (var j = 0; j < keysToRemove.length; j++) {
            try { localStorage.removeItem(keysToRemove[j]); } catch (e) { }
        }
        location.reload();
    }

    // ----- Version 1.4.2: one-time projected-balance opening balance (Settings) -----------

    // Shared markup pieces — used verbatim by BOTH mount points (Settings' detail screen and, via
    // the Home balance-card correction below, Home's own #hero-action-area). openingBalanceFormOpenedFrom
    // guarantees only ONE of the two ever renders these at a time, so the shared input ids
    // (opening-balance-amount-input/-date-input) can never collide in the live DOM.
    function buildOpeningBalanceFormFieldsHtml() {
        var opening = getProjectedBalanceOpeningConfig();
        var defaultAmount = opening ? String(opening.amount) : '';
        var defaultDate = opening ? opening.dateStr : todayStr();
        return '<div class="tx-edit-form">' +
            '<div class="tx-edit-group"><label>סכום יתרת התחלה</label>' +
            '<input type="number" step="0.01" id="opening-balance-amount-input" value="' + escapeHtml(defaultAmount) + '"></div>' +
            '<div class="tx-edit-group"><label>תאריך יתרת התחלה</label>' +
            '<input type="date" id="opening-balance-date-input" value="' + escapeHtml(defaultDate) + '"></div>' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="tx-edit-save" onclick="submitOpeningBalanceForm()">שמור יתרת התחלה</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelOpeningBalanceForm()">ביטול</button>' +
            '</div></div>';
    }

    function buildOpeningBalancePendingReplaceHtml() {
        return '<div class="goal-inline-confirm">שינוי יתרת ההתחלה ישנה את כל חישובי היתרה הצפויה מתאריך זה ואילך.' +
            '<div class="tx-edit-actions">' +
            '<button type="button" class="settings-danger-btn" onclick="confirmReplaceOpeningBalance()">אישור שינוי</button>' +
            '<button type="button" class="tx-edit-cancel" onclick="cancelOpeningBalanceForm()">ביטול</button>' +
            '</div></div>';
    }

    function buildOpeningBalanceSectionHtml() {
        var opening = getProjectedBalanceOpeningConfig();
        var html = '<div class="settings-hint">היתרה משמשת נקודת התחלה חד־פעמית לחישוב היתרה הצפויה. ' +
            'לאחר מכן ההכנסות וההוצאות מתווספות ומופחתות אוטומטית לפי התאריך שלהן.</div>';

        // Home balance-card correction: this screen renders the interactive form ONLY when it was
        // opened FROM here — if the shared form is currently open from Home instead, this section
        // falls back to the plain read-only/CTA view below exactly as if nothing were open, so the
        // two mount points never both show the (same-id) inputs at once.
        if (settingsOpeningBalanceFormOpen && openingBalanceFormOpenedFrom !== 'home') {
            html += settingsOpeningBalancePendingReplace ? buildOpeningBalancePendingReplaceHtml() : buildOpeningBalanceFormFieldsHtml();
        } else if (opening) {
            html += '<div class="settings-row"><div class="settings-row-label">סכום</div><div>' + escapeHtml(formatHomeCurrency(opening.amount)) + '</div></div>' +
                '<div class="settings-row"><div class="settings-row-label">תאריך</div><div>' + escapeHtml(opening.dateStr) + '</div></div>' +
                '<button type="button" class="cat-add-toggle" onclick="openOpeningBalanceForm()">תקן יתרת התחלה</button>';
        } else {
            html += '<button type="button" class="cat-add-toggle" onclick="openOpeningBalanceForm()">+ הגדר יתרת התחלה</button>';
        }
        return html;
    }

    function openOpeningBalanceForm() {
        settingsOpeningBalanceFormOpen = true;
        settingsOpeningBalancePendingReplace = null;
        openingBalanceFormOpenedFrom = 'settingsTopic';
        refreshSettingsUI();
        pushTransientState('openingBalanceForm', cancelOpeningBalanceForm);
    }

    // Home balance-card correction: the hero card's own open/close trigger — first tap opens the
    // exact same shared form (openingBalanceFormOpenedFrom = 'home' instead of 'settingsTopic'),
    // second tap closes it via the same cancelOpeningBalanceForm() Settings' own "ביטול" already
    // uses. No second editor, no second save/calculation path — only the mount point differs.
    function handleHeroBalanceClick() {
        if (settingsOpeningBalanceFormOpen) {
            if (openingBalanceFormOpenedFrom === 'home') { cancelOpeningBalanceForm(); }
            return;
        }
        settingsOpeningBalanceFormOpen = true;
        settingsOpeningBalancePendingReplace = null;
        openingBalanceFormOpenedFrom = 'home';
        renderHomeScreenFromRealData();
        pushTransientState('openingBalanceForm', cancelOpeningBalanceForm);
    }

    // The single close function — visible "ביטול" on both the form and the replace-confirmation,
    // AND the Back/Escape onClose. Never writes. Closing from the confirmation step discards the
    // whole in-progress edit (not just the confirmation) — a deliberate simplification of the
    // spec's "close the form or confirmation first" into one flat transient, since this is a
    // strictly linear two-step flow with no sibling states to preserve underneath it (unlike
    // goalInline/categoryInline, which dispatch between several independent open forms).
    function cancelOpeningBalanceForm() {
        settingsOpeningBalanceFormOpen = false;
        settingsOpeningBalancePendingReplace = null;
        var openedFrom = openingBalanceFormOpenedFrom;
        openingBalanceFormOpenedFrom = null;
        if (openedFrom === 'home') { renderHomeScreenFromRealData(); } else { refreshSettingsUI(); }
        consumeTransient('openingBalanceForm');
    }

    // Closes a SUCCESSFULLY saved/replaced opening-balance form and lands on Home — unlike
    // cancelOpeningBalanceForm() (also this transient's Back/onClose target), which only ever
    // returns to wherever it was opened from. Reuses history.replaceState() rather than
    // consumeTransient()'s history.back(): back() resolves its target asynchronously when the
    // browser actually processes it, so a synchronous pushState (from showScreen('home')) issued
    // right after it would move the current index first and send that already-scheduled back() to
    // the wrong entry. replaceState() converts this transient's own entry directly into the Home
    // entry in one synchronous step — no dangling entry for Back to land on, so it can never
    // reopen this completed form — then isRestoringNavFromHistory suppresses showScreen()'s own
    // pushState (the same existing flag handleNavPopState() uses to sync the DOM to a history
    // entry that already reflects reality, exactly the case here). Landing on Home is correct
    // regardless of whether the form was opened from Settings or from Home's own balance card —
    // a successful save always makes Home's the value that matters.
    function closeOpeningBalanceFormToHome() {
        openingBalanceFormOpenedFrom = null;
        if (transientStack.length > 0 && transientStack[transientStack.length - 1].type === 'openingBalanceForm') {
            transientStack.pop();
        }
        try { history.replaceState({ v: NAV_STATE_VERSION, screen: 'home' }, ''); } catch (e) { }
        isRestoringNavFromHistory = true;
        try { showScreen('home'); } finally { isRestoringNavFromHistory = false; }
    }

    function submitOpeningBalanceForm() {
        var amountInput = document.getElementById('opening-balance-amount-input');
        var dateInput = document.getElementById('opening-balance-date-input');
        var amount = sanitizeFiniteAmount(amountInput ? amountInput.value : '');
        var dateStr = dateInput ? dateInput.value : '';
        if (amount === null) { alert('יש להזין סכום תקין (מספר בלבד)'); return; }
        if (!isValidDateStr(dateStr)) { alert('יש להזין תאריך תקין'); return; }

        var existing = getProjectedBalanceOpeningConfig();
        if (existing) {
            // Replacing an already-configured opening balance — requires the explicit
            // confirmation below before anything is written (approved requirement: this changes
            // every downstream projected-balance figure from this date onward).
            settingsOpeningBalancePendingReplace = { amount: amount, dateStr: dateStr };
            if (openingBalanceFormOpenedFrom === 'home') { renderHomeScreenFromRealData(); } else { refreshSettingsUI(); }
            return;
        }
        saveProjectedBalanceOpening(amount, dateStr);
        // Flip the flags OFF before any render: renderAllPreviewScreens() below renders Home
        // (renderHomeScreenFromRealData()), which — since the Home balance-card correction —
        // shows the open form for as long as settingsOpeningBalanceFormOpen stays true. Flipping
        // it after that render (the original Settings-only order) left Home's #hero-action-area
        // stuck showing the form after a successful save, since nothing re-renders Home again
        // afterward (showScreen() only toggles which screen is visible, it never re-renders one).
        settingsOpeningBalanceFormOpen = false;
        renderAllPreviewScreens();
        refreshSettingsUI();
        closeOpeningBalanceFormToHome();
    }

    function confirmReplaceOpeningBalance() {
        if (!settingsOpeningBalancePendingReplace) { return; }
        saveProjectedBalanceOpening(settingsOpeningBalancePendingReplace.amount, settingsOpeningBalancePendingReplace.dateStr);
        settingsOpeningBalancePendingReplace = null;
        settingsOpeningBalanceFormOpen = false;
        renderAllPreviewScreens();
        refreshSettingsUI();
        closeOpeningBalanceFormToHome();
    }

    // Safe navigation target for the unconfigured-state action on Home/Forecast — reuses the
    // existing, already-tested openSettingsTopic() screen transition, then opens the same
    // transient form a manual "תקן/הגדר יתרת התחלה" click would.
    function goToOpeningBalanceSettings() {
        openSettingsTopic('openingBalance');
        openOpeningBalanceForm();
    }

    function buildDataSectionHtml() {
        return '<div class="settings-data-actions">' +
            '<button type="button" class="cat-add-toggle" onclick="exportBackupJson()">⬇️ גיבוי (הורדת קובץ JSON)</button>' +
            '<label for="restore-file-input" class="cat-add-toggle">⬆️ שחזור מגיבוי</label>' +
            '<input type="file" id="restore-file-input" class="restore-file-input-hidden" accept=".json,application/json" onclick="this.value=\'\'" onchange="handleRestoreFileSelected(this)">' +
            '<button type="button" class="cat-add-toggle" onclick="openRestorePastePanel()">📋 הדבק גיבוי</button>' +
            '<button type="button" class="cat-add-toggle" onclick="exportTransactionsCsv()">📄 ייצוא תנועות ל-CSV</button>' +
            '</div>' +
            '<div id="restore-paste-area"></div>' +
            '<div id="restore-preview-area"></div>' +
            '<div class="settings-danger-zone">' +
            '<button type="button" class="settings-danger-btn" onclick="startResetAllData()">🗑️ איפוס כל הנתונים</button>' +
            '<div id="reset-confirm-area"></div>' +
            '</div>';
    }

    // ----- Experimental (clean infrastructure, empty registry — no fake toggles) -----------

    function buildExperimentalSectionHtml() {
        return '<div class="settings-hint">אין כרגע אפשרויות ניסיוניות פעילות.</div>';
    }

    // ----- About -----------------------------------------------------------------------------

    function buildAboutSectionHtml() {
        var whatsNew = [
            'דפי קטגוריות',
            'אריחי בית משופרים',
            'ימי כניסה וירידה',
            'עריכת תנועה בלחיצה',
            'ארכוב אוטומטי להתחייבויות שהסתיימו',
            'הפרדת קטגוריות והגדרות'
        ];
        var html = '<div class="settings-row"><div class="settings-row-label">גרסה</div><div>' + escapeHtml(APP_VERSION) + '</div></div>';
        html += '<div class="settings-row-label" style="margin-top:10px;">מה חדש</div><ul class="whats-new-list">';
        for (var i = 0; i < whatsNew.length; i++) { html += '<li>' + escapeHtml(whatsNew[i]) + '</li>'; }
        html += '</ul>';
        html += '<div class="settings-hint" style="margin-top:10px;">FamilyFinance PRO — אפליקציה מקומית לניהול תקציב משפחתי. כל הנתונים נשמרים במכשיר בלבד.</div>';
        return html;
    }

    // ----- Activity log ------------------------------------------------------------------------

    function getActivityActionLabel(action) {
        var labels = {
            category_created: 'קטגוריה נוצרה',
            category_renamed: 'שם קטגוריה שונה',
            category_deleted: 'קטגוריה נמחקה',
            default_day_changed: 'יום ברירת מחדל שונה',
            auto_archive: 'ארכוב אוטומטי',
            manual_archive: 'ארכוב ידני',
            restore: 'שחזור מארכיון',
            backup: 'גיבוי נתונים',
            data_restore: 'שחזור נתונים מגיבוי'
        };
        return labels[action] || action;
    }

    // Newest-first; the stored log itself is already capped at ACTIVITY_LOG_MAX, so no further
    // slicing is needed for display.
    function buildActivityLogSectionHtml() {
        if (!activityLog.length) { return '<div class="settings-hint">אין עדיין רשומות ביומן הפעילות.</div>'; }
        var html = '<div class="activity-log-list">';
        for (var i = activityLog.length - 1; i >= 0; i--) {
            var entry = activityLog[i];
            html += '<div class="activity-log-row">' +
                '<div class="activity-log-action">' + escapeHtml(getActivityActionLabel(entry.action)) + '</div>' +
                (entry.detail ? '<div class="activity-log-detail">' + escapeHtml(entry.detail) + '</div>' : '') +
                '<div class="activity-log-ts">' + escapeHtml(entry.ts) + '</div>' +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    // ----- Master render -----------------------------------------------------------------------

    // Version 1.2, Stage C: SETTINGS_TOPICS itself is declared much earlier in this file (near
    // THEME_OPTIONS/PRIMARY_COLOR_OPTIONS) — the initial boot-time call to
    // renderSettingsScreenFromRealData() below happens long before this point in file order, and a
    // `var` (unlike a `function` declaration) is only hoisted as a name, not its assigned value, so
    // SETTINGS_TOPICS must already be assigned by the time that first call runs. See the comment at
    // its declaration for why referencing the buildXSectionHtml functions from up there is still
    // safe despite them being declared below it (function declarations ARE fully hoisted).
    var currentSettingsTopicKey = null;

    function findSettingsTopic(key) {
        for (var i = 0; i < SETTINGS_TOPICS.length; i++) { if (SETTINGS_TOPICS[i].key === key) { return SETTINGS_TOPICS[i]; } }
        return null;
    }

    // Renders the topics menu only (screen-settings). Kept under its pre-Stage-C name/signature so
    // every existing call site (initial boot render, renderAllPreviewScreens()) needs no change —
    // both of those already only ever ran while screen-settings-detail cannot be the active screen
    // (they fire from the initial page load or from Transactions/Categories actions), so always
    // resetting this element to the menu is exactly the pre-Stage-C behavior for those call sites.
    function renderSettingsScreenFromRealData() {
        var el = document.getElementById('settings-screen-body');
        if (!el) { return; }
        var html = '';
        for (var i = 0; i < SETTINGS_TOPICS.length; i++) {
            var t = SETTINGS_TOPICS[i];
            html += '<div class="settings-topic-row" onclick="openSettingsTopic(\'' + t.key + '\')">' +
                '<div>' +
                '<div class="settings-topic-label">' + t.icon + ' ' + escapeHtml(t.label) + '</div>' +
                '<div class="settings-topic-desc">' + escapeHtml(t.desc) + '</div>' +
                '</div>' +
                '<div class="settings-topic-chevron">‹</div>' +
                '</div>';
        }
        el.innerHTML = html;
    }

    // Opens one topic's sub-screen (tapped from the topics menu).
    function openSettingsTopic(key) {
        currentSettingsTopicKey = key;
        showScreen('settings-detail');
        renderSettingsDetailScreen();
    }

    // "← חזרה" — always returns to the topics menu, never anywhere else (approved product decision:
    // do not rely on the bottom-nav tab alone for exiting a settings sub-screen).
    function closeSettingsDetail() {
        currentSettingsTopicKey = null;
        showScreen('settings');
    }

    // Renders whichever topic is currently open into screen-settings-detail. A missing/invalid topic
    // key (defensive only — every call site sets a real key) falls back to closing the detail screen
    // rather than showing a blank one.
    function renderSettingsDetailScreen() {
        var topic = findSettingsTopic(currentSettingsTopicKey);
        if (!topic) { closeSettingsDetail(); return; }
        var titleEl = document.getElementById('settings-detail-title');
        if (titleEl) { titleEl.textContent = topic.icon + ' ' + topic.label; }
        var el = document.getElementById('settings-detail-body');
        if (!el) { return; }
        el.innerHTML = topic.build();
        if (topic.key === 'data') {
            // buildDataSectionHtml() above always emits an empty #restore-preview-area/#reset-
            // confirm-area — repopulate them from state so a pending restore-preview or reset-
            // confirmation survives a re-render triggered by an unrelated action (same convention
            // previewEditingId already relies on elsewhere in this file). Both functions already
            // no-op safely if their target element isn't present (unchanged from before Stage C).
            renderRestorePreview();
            renderRestorePasteArea();
            renderResetConfirmArea();
        }
    }

    // Version 1.2, Stage C: every action that previously refreshed the single flat settings screen
    // now calls this instead — it re-renders whichever of the two settings screens is actually
    // relevant to the state that just changed (the open topic's detail screen, or the topics menu if
    // none is open). All such actions (theme/color/font, notification toggles, PIN forms, auto-lock,
    // backup export) only ever fire from inside an already-open topic, so in practice this always
    // re-renders the detail screen in place — the same "re-render everything from current state"
    // behavior those call sites relied on before this stage, just correctly scoped to one topic.
    function refreshSettingsUI() {
        if (currentSettingsTopicKey !== null && findSettingsTopic(currentSettingsTopicKey)) {
            renderSettingsDetailScreen();
        } else {
            renderSettingsScreenFromRealData();
        }
    }

    // Runs once at the very end of the script, after every screen has already rendered — a PIN
    // being set only gates the overlay's own visibility, never what's underneath it.
    if (shouldShowLockScreenOnLoad()) { lockApp(); } else { unlockApp(); }
