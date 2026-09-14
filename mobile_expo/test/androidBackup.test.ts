import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

type Manifest = { manifest: { $?: Record<string, string>; application?: { $?: Record<string, string> }[] } };
type Plugin = {
  DOMAINS: string[];
  backupRulesXml(): string;
  dataExtractionRulesXml(): string;
  applyNoBackupManifest(m: Manifest): Manifest;
};

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withNoAndroidBackup.js') as Plugin;

const section = (xml: string, tag: string): string => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  assert.ok(m, `missing <${tag}>`);
  return m[1] ?? '';
};

const assertExcludesEverything = (body: string, label: string) => {
  assert.doesNotMatch(body, /<include\b/, `${label}: no include rules`);
  for (const d of plugin.DOMAINS) {
    assert.match(body, new RegExp(`<exclude domain="${d}" path="\\." />`), `${label}: ${d}`);
  }
};

test('backup: all nine Android backup domains are covered', () => {
  assert.deepEqual([...plugin.DOMAINS].sort(), [
    'database', 'device_database', 'device_file', 'device_root', 'device_sharedpref', 'external', 'file', 'root', 'sharedpref',
  ]);
});

test('backup: API 31+ rules exclude everything from cloud backup AND device transfer', () => {
  const xml = plugin.dataExtractionRulesXml();
  assertExcludesEverything(section(xml, 'cloud-backup'), 'cloud-backup');
  assertExcludesEverything(section(xml, 'device-transfer'), 'device-transfer');
});

test('backup: API 23–30 full-backup-content excludes everything', () => {
  assertExcludesEverything(section(plugin.backupRulesXml(), 'full-backup-content'), 'full-backup-content');
});

test('backup: manifest gets allowBackup=false + both rule files, tools:replace merged (idempotent)', () => {
  const sample: Manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'tools:replace': 'android:icon' } }] } };
  const once = plugin.applyNoBackupManifest(sample);
  const twice = plugin.applyNoBackupManifest(once);
  const app = twice.manifest.application?.[0]?.$ ?? {};
  assert.equal(twice.manifest.$?.['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.equal(app['android:allowBackup'], 'false');
  assert.equal(app['android:fullBackupContent'], '@xml/ff_backup_rules');
  assert.equal(app['android:dataExtractionRules'], '@xml/ff_data_extraction_rules');
  assert.deepEqual((app['tools:replace'] ?? '').split(','), [
    'android:icon', 'android:allowBackup', 'android:fullBackupContent', 'android:dataExtractionRules',
  ]);
});

test('app.json: plugin registered, secure-store backup rules disabled, allowBackup false, unused permissions blocked', () => {
  const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: (string | [string, Record<string, unknown>])[]; android: { allowBackup: boolean; blockedPermissions: string[] } };
  };
  const { plugins, android } = appJson.expo;
  assert.ok(plugins.includes('./plugins/withNoAndroidBackup'));
  const secureStore = plugins.find((p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-secure-store');
  assert.equal(secureStore?.[1].configureAndroidBackup, false);
  assert.equal(android.allowBackup, false);
  // Not used by the app: biometrics (SecureStore requireAuthentication is never
  // set) and the RN dev overlay's "display over other apps".
  for (const p of ['USE_BIOMETRIC', 'USE_FINGERPRINT', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(android.blockedPermissions.includes(`android.permission.${p}`), p);
  }
  // Must NOT be blocked: expo-screen-capture registers a screen-capture
  // observer when its module loads (Android 14+). Without this normal-level
  // permission that call throws and the release app aborts at startup —
  // observed on the A54 in Stage 4A (RC2).
  assert.ok(!android.blockedPermissions.includes('android.permission.DETECT_SCREEN_CAPTURE'));
});
