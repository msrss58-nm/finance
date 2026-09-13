// Screen/recents privacy, following the approved Flutter rule: protection is
// active exactly while a PIN is configured.
//   Android: preventScreenCaptureAsync -> window FLAG_SECURE (blocks
//            screenshots AND the recents thumbnail).
//   iOS:     preventScreenCaptureAsync blocks screenshots/recording (iOS 13+);
//            enableAppSwitcherProtectionAsync blurs the app-switcher snapshot.
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import { record } from './log';

const KEY = 'pin-configured';

export async function applyPrivacy(pinConfigured: boolean): Promise<void> {
  try {
    if (pinConfigured) {
      await ScreenCapture.preventScreenCaptureAsync(KEY);
      if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(0.9);
    } else {
      await ScreenCapture.allowScreenCaptureAsync(KEY);
      if (Platform.OS === 'ios') await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
    record('privacy', 'apply', true, `pinConfigured=${pinConfigured} os=${Platform.OS}`);
  } catch (e) {
    record('privacy', 'apply', false, String(e));
  }
}
