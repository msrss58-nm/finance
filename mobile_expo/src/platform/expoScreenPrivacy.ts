// ScreenPrivacy bound to expo-screen-capture (official Expo API, no custom
// native code).
//   Android: preventScreenCaptureAsync -> window FLAG_SECURE: screenshots,
//            screen recording and the recents thumbnail are blank.
//   iOS:     preventScreenCaptureAsync blocks screenshots/recording;
//            enableAppSwitcherProtectionAsync blurs the app-switcher snapshot.

import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import type { ScreenPrivacy } from '../security/privacyPolicy.ts';

const KEY = 'ff-lock-configured';
const APP_SWITCHER_BLUR = 1;

export const expoScreenPrivacy: ScreenPrivacy = {
  async apply(mode) {
    if (mode === 'protected') {
      await ScreenCapture.preventScreenCaptureAsync(KEY);
      if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR);
    } else {
      await ScreenCapture.allowScreenCaptureAsync(KEY);
      if (Platform.OS === 'ios') await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  },
};
