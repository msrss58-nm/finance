// Product-fidelity guards (Stage 3 / 4A recovery): the Android app must stay the
// approved Web product — same icon, same Home order, same navigation — and the
// restore result must render where the user tapped (the reproduced A54 defect).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const bytes = (rel: string): Uint8Array => readFileSync(new URL(rel, import.meta.url));

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function orderOf(text: string, needles: readonly string[]): number[] {
  return needles.map((n) => {
    const i = text.indexOf(n);
    assert.ok(i >= 0, 'missing: ' + n);
    return i;
  });
}

const isAscending = (xs: readonly number[]): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] as number) < x);

test('icon: app.json uses the approved FamilyFinance icon set, byte-identical to icons/, no template layers', () => {
  const expo = (JSON.parse(src('../app.json')) as { expo: { icon: string; android: { adaptiveIcon: Record<string, string> } } }).expo;
  assert.equal(expo.icon, './assets/familyfinance-icon.png');
  assert.deepEqual(expo.android.adaptiveIcon, { backgroundColor: '#0f3a78', foregroundImage: './assets/familyfinance-adaptive-foreground.png' });
  assert.ok(sameBytes(bytes('../assets/familyfinance-icon.png'), bytes('../../icons/familyfinance-master.png')), 'icon = icons/familyfinance-master.png');
  assert.ok(sameBytes(bytes('../assets/familyfinance-adaptive-foreground.png'), bytes('../../icons/familyfinance-maskable-512.png')), 'adaptive = icons/familyfinance-maskable-512.png');
});

test('restore: the preview and the result render BELOW the actions the user tapped, above the danger zone', () => {
  const topic = src('../app/settings-topic/[topic].tsx');
  const data = topic.slice(topic.indexOf('function DataTopic('), topic.indexOf('function RestorePreviewCard('));
  assert.ok(data.length > 0, 'DataTopic found');
  const [importBtn, pasteBtn, csvBtn, message, preview, reset] = orderOf(data, [
    'testID="data-import"',
    'testID="data-paste"',
    'testID="data-export-csv"',
    'testID="data-message"',
    '<RestorePreviewCard',
    'testID="data-reset"',
  ]);
  assert.ok((importBtn as number) < (preview as number) && (pasteBtn as number) < (preview as number), 'preview below the restore actions');
  assert.ok((csvBtn as number) < (message as number), 'result message below the action stack');
  assert.ok((preview as number) < (reset as number), 'preview above the danger zone');
});

test('home: the Web section order, the 2-column snapshot and no extra snapshot card', () => {
  const home = src('../app/(tabs)/index.tsx');
  const order = orderOf(home, [
    'testID="home-hero"',
    'testID="home-income"',
    'testID="home-expenses"',
    'testID="home-tiles"',
    'title="🔔 התראות (בתוך האפליקציה)"',
    'title="מה צפוי לרדת (ב־10 הימים הבאים)"',
    'title="פעילות אחרונה"',
    'title="🏧 משיכת מזומן"',
    'testID="home-atm-row"',
  ]);
  assert.ok(isAscending(order), 'Home follows index.html #screen-home order');
  assert.doesNotMatch(home, /testID="home-withdrawals"/, 'no third "cash withdrawals" snapshot card');
  assert.match(home, /LinearGradient/, 'the hero keeps the Web gradient');
});

test('opening balance: the form dates a new entry TODAY, so an updated balance anchors at the update point', () => {
  const form = src('../app/opening-balance.tsx');
  assert.match(form, /useState\(todayStr\(snapshot\.now\)\)/, 'date defaults to today, also when replacing');
  assert.doesNotMatch(form, /existing \? existing\.dateStr :/, 'never carries the old anchor date forward');
  assert.match(form, /<DateField label="תאריך יתרת התחלה"/, 'the date stays user-editable');
});

test('navigation: the approved 5-item bottom navigation, in order, and no drawer', () => {
  const routes = src('../src/navigation/routes.ts');
  const layout = src('../app/(tabs)/_layout.tsx');
  assert.match(layout, /home: '🏠', forecast: '📈', goals: '🎯', categories: '📁', settings: '⚙️'/);
  assert.doesNotMatch(layout + routes, /Drawer|drawer/);
  assert.ok(isAscending(orderOf(routes, ["'home'", "'forecast'", "'goals'", "'categories'", "'settings'"])));
});

test('settings: topic rows and the About "מה חדש" list are the Web text verbatim (app.js)', async () => {
  const web = src('../../app.js');
  const { SETTINGS_TOPICS, WHATS_NEW } = await import('../src/presentation/settingsView.ts');
  for (const topic of SETTINGS_TOPICS) {
    // JS single-quoted literals in app.js; \' escapes are unescaped before comparing.
    const row = new RegExp("key: '" + topic.key + "', icon: '[^']*', label: '((?:\\\\.|[^'\\\\])*)', desc: '((?:\\\\.|[^'\\\\])*)'");
    const m = row.exec(web);
    assert.ok(m, 'Web topic ' + topic.key);
    const unescape = (s: string | undefined): string => (s ?? '').replace(/\\(.)/g, '$1');
    assert.equal(topic.label, unescape(m[1]), topic.key + ' label');
    assert.equal(topic.desc, unescape(m[2]), topic.key + ' desc');
  }
  const list = /var whatsNew = \[([\s\S]*?)\];/.exec(web);
  assert.ok(list);
  assert.deepEqual([...WHATS_NEW], [...(list[1] as string).matchAll(/'([^']*)'/g)].map((x) => x[1]));
  const topicScreen = src('../app/settings-topic/[topic].tsx');
  assert.match(topicScreen, /WHATS_NEW/, 'About renders the list');
  assert.match(topicScreen, /כל הנתונים נשמרים במכשיר בלבד\./, 'About hint = Web hint');
});

test('settings topics: colour swatches, notification pills, opening-balance rows and PIN action follow styles.css / app.js', async () => {
  const css = src('../../styles.css');
  const { PRIMARY_SWATCH } = await import('../src/ui/theme.ts');
  const keys = Object.keys(PRIMARY_SWATCH);
  assert.equal(keys.length, 6);
  for (const key of keys) {
    const hex = PRIMARY_SWATCH[key as keyof typeof PRIMARY_SWATCH];
    assert.match(css, new RegExp('\\.settings-color-' + key + ' \\{ background: ' + hex + '; \\}'), key + ' swatch');
  }
  const topic = src('../app/settings-topic/[topic].tsx');
  assert.match(topic, /<ColorSwatchRow/);
  assert.match(topic, /<PillToggleRow/);
  assert.match(topic, /התראות אלה מוצגות בתוך האפליקציה בלבד, כשהיא פתוחה — אינן התראות מערכת \(Push\)\./);
  assert.match(topic, /label="תאריך" value=\{opening\.dateStr\}/, 'raw date as on the Web');
  assert.match(topic, /tone="dashed" onPress=\{\(\) => push\('\/opening-balance'\)\}/);
  assert.match(topic, /label="\+ הגדר PIN" tone="dashed"/);
  assert.match(topic, /יש להפעיל PIN כדי להשתמש בנעילה אוטומטית\./);
});

test('navigation: the tab bar reserves the Android navigation-bar inset (reproduced A54 defect: tabs under the system bar)', () => {
  const layout = src('../app/(tabs)/_layout.tsx');
  assert.match(layout, /useSafeAreaInsets\(\)/);
  assert.match(layout, /height:\s*\d+\s*\+\s*insets\.bottom/, 'explicit height includes the bottom inset');
  assert.match(layout, /paddingBottom:\s*insets\.bottom/);
  assert.doesNotMatch(layout, /height:\s*undefined/, 'never unset the inset-aware height');
});
