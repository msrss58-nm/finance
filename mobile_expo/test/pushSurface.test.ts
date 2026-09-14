import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

type Element = { $: Record<string, string> };
type Application = { [tag: string]: unknown };
type Manifest = { manifest: { $?: Record<string, string>; application?: Application[] } };

const elements = (app: Application | undefined, tag: string): Element[] => (app?.[tag] as Element[] | undefined) ?? [];
type Plugin = {
  REMOVED_ANDROID_COMPONENTS: Record<string, string[]>;
  removeAndroidPushComponents(m: Manifest): Manifest;
  removeApsEnvironment(e: Record<string, unknown>): Record<string, unknown>;
};

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withLocalOnlyNotifications.js') as Plugin;

function sampleManifest(): Manifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          activity: [{ $: { 'android:name': '.MainActivity' } }],
          receiver: [{ $: { 'android:name': 'expo.modules.notifications.service.NotificationsService' } }],
        },
      ],
    },
  };
}

test('android: every FCM/Firebase entry point is marked tools:node="remove"', () => {
  const m = plugin.removeAndroidPushComponents(sampleManifest());
  assert.equal(m.manifest.$?.['xmlns:tools'], 'http://schemas.android.com/tools');
  const app = m.manifest.application?.[0];
  assert.ok(app);
  for (const [tag, names] of Object.entries(plugin.REMOVED_ANDROID_COMPONENTS)) {
    for (const name of names) {
      const el: Element | undefined = elements(app, tag).find((e) => e.$['android:name'] === name);
      assert.equal(el?.$['tools:node'], 'remove', `${tag} ${name}`);
    }
  }
  assert.ok(plugin.REMOVED_ANDROID_COMPONENTS.receiver?.includes('com.google.firebase.iid.FirebaseInstanceIdReceiver'));
});

test('android: local-notification components are kept untouched', () => {
  const app = plugin.removeAndroidPushComponents(sampleManifest()).manifest.application?.[0];
  const local = elements(app, 'receiver').find((e) => e.$['android:name'] === 'expo.modules.notifications.service.NotificationsService');
  assert.ok(local);
  assert.equal(local.$['tools:node'], undefined);
  assert.equal(elements(app, 'activity').find((e) => e.$['android:name'] === '.MainActivity')?.$['tools:node'], undefined);
});

test('android: idempotent (applying twice adds no duplicates)', () => {
  const once = plugin.removeAndroidPushComponents(sampleManifest());
  const twice = plugin.removeAndroidPushComponents(once);
  assert.equal(elements(twice.manifest.application?.[0], 'service').length, plugin.REMOVED_ANDROID_COMPONENTS.service?.length);
});

test('app.json lists the local-only plugin BEFORE expo-notifications (mods run in reverse order)', () => {
  const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: (string | [string, unknown])[] };
  };
  const names = appJson.expo.plugins.map((p) => (typeof p === 'string' ? p : p[0]));
  const local = names.indexOf('./plugins/withLocalOnlyNotifications');
  const notifications = names.indexOf('expo-notifications');
  assert.ok(local >= 0 && notifications >= 0);
  assert.ok(local < notifications, `plugin order: ${names.join(', ')}`);
});

test('ios: aps-environment (push) entitlement is removed, others kept', () => {
  const e = plugin.removeApsEnvironment({ 'aps-environment': 'development', 'keychain-access-groups': ['x'] });
  assert.deepEqual(e, { 'keychain-access-groups': ['x'] });
});
