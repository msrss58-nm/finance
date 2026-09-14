// Config plugin (CNG): keep expo-notifications' LOCAL notifications, strip
// the push surface it brings along.
//
// Android: expo-notifications depends on firebase-messaging, whose manifest
// entries (FCM services, an exported c2dm receiver, FirebaseInitProvider,
// datatransport jobs) are merged into the app even though this app never
// requests a push token. They are removed here with tools:node="remove".
// The Firebase classes stay in the APK but have no entry point: the only
// runtime callers (getDevicePushTokenAsync / topic subscription) are never
// used by this app. Local scheduling (AlarmManager), the boot/package-
// replaced re-scheduling receiver and the tap forwarder are kept.
//
// iOS: expo-notifications always adds the `aps-environment` entitlement
// (push). Local notifications do not need it, and without it the App ID
// needs no Push Notifications capability and no APNs key.
//
// ORDER MATTERS: in app.json this plugin must be listed BEFORE
// "expo-notifications". Config mods run in reverse registration order, and
// expo-notifications only adds aps-environment when it is absent — so this
// plugin's entitlements mod has to run after it. Verified with
// `npx expo config --type introspect`; guarded by test/pushSurface.test.ts.

const { withAndroidManifest, withEntitlementsPlist } = require('expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

const REMOVED_ANDROID_COMPONENTS = {
  service: [
    'expo.modules.notifications.service.ExpoFirebaseMessagingService',
    'com.google.firebase.messaging.FirebaseMessagingService',
    'com.google.firebase.components.ComponentDiscoveryService',
    'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery',
    'com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService',
  ],
  receiver: [
    'com.google.firebase.iid.FirebaseInstanceIdReceiver',
    'com.google.android.datatransport.runtime.scheduling.jobscheduling.AlarmManagerSchedulerBroadcastReceiver',
  ],
  provider: ['com.google.firebase.provider.FirebaseInitProvider'],
  activity: ['com.google.android.gms.common.api.GoogleApiActivity'],
};

function removeAndroidPushComponents(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = TOOLS_NS;
  const application = Array.isArray(root.application) ? root.application[0] : undefined;
  if (!application) throw new Error('withLocalOnlyNotifications: AndroidManifest has no <application>');
  for (const [tag, names] of Object.entries(REMOVED_ANDROID_COMPONENTS)) {
    const list = Array.isArray(application[tag]) ? application[tag] : (application[tag] = []);
    for (const name of names) {
      const existing = list.find((el) => el && el.$ && el.$['android:name'] === name);
      if (existing) existing.$['tools:node'] = 'remove';
      else list.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
  }
  return manifest;
}

function removeApsEnvironment(entitlements) {
  delete entitlements['aps-environment'];
  return entitlements;
}

function withLocalOnlyNotifications(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = removeAndroidPushComponents(c.modResults);
    return c;
  });
  config = withEntitlementsPlist(config, (c) => {
    c.modResults = removeApsEnvironment(c.modResults);
    return c;
  });
  return config;
}

module.exports = withLocalOnlyNotifications;
module.exports.REMOVED_ANDROID_COMPONENTS = REMOVED_ANDROID_COMPONENTS;
module.exports.removeAndroidPushComponents = removeAndroidPushComponents;
module.exports.removeApsEnvironment = removeApsEnvironment;
