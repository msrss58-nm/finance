// Read-only device direction/locale facts for diagnostics.

import { getCalendars, getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

export type DirectionInfo = {
  readonly isRTL: boolean;
  readonly locale: string;
  readonly localeDirection: string | null;
  readonly timeZone: string | null;
};

export function readDirectionInfo(): DirectionInfo {
  const locale = getLocales()[0];
  const calendar = getCalendars()[0];
  return {
    isRTL: I18nManager.isRTL,
    locale: locale?.languageTag ?? 'unknown',
    localeDirection: locale?.textDirection ?? null,
    timeZone: calendar?.timeZone ?? null,
  };
}
