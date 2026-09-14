// Appearance settings — app.js THEME_OPTIONS / PRIMARY_COLOR_OPTIONS /
// FONT_SIZE_OPTIONS / FONT_SIZE_ZOOM. Stored in family_finance_settings
// (theme, primaryColor, fontSize), so they travel with a backup exactly as on
// the Web.

export type ThemeSetting = 'light' | 'dark' | 'system';
export type PrimaryColorKey = 'green' | 'blue' | 'purple' | 'teal' | 'orange' | 'graphite';
export type FontSizeSetting = 'small' | 'medium' | 'large';

export const THEME_OPTIONS: readonly { readonly key: ThemeSetting; readonly label: string }[] = [
  { key: 'light', label: 'בהיר' },
  { key: 'dark', label: 'כהה' },
  { key: 'system', label: 'לפי המערכת' },
];

export const PRIMARY_COLOR_OPTIONS: readonly { readonly key: PrimaryColorKey; readonly label: string }[] = [
  { key: 'green', label: 'ירוק' },
  { key: 'blue', label: 'כחול' },
  { key: 'purple', label: 'סגול' },
  { key: 'teal', label: 'טורקיז' },
  { key: 'orange', label: 'כתום' },
  { key: 'graphite', label: 'אפור כהה' },
];

export const FONT_SIZE_OPTIONS: readonly { readonly key: FontSizeSetting; readonly label: string }[] = [
  { key: 'small', label: 'קטן' },
  { key: 'medium', label: 'רגיל' },
  { key: 'large', label: 'גדול' },
];

/** app.js FONT_SIZE_ZOOM. */
export const FONT_SIZE_SCALE: Readonly<Record<FontSizeSetting, number>> = { small: 0.9, medium: 1, large: 1.12 };

export type AppearanceField = 'theme' | 'primaryColor' | 'fontSize';

export function isValidAppearanceValue(field: AppearanceField, value: unknown): boolean {
  const options = field === 'theme' ? THEME_OPTIONS : field === 'primaryColor' ? PRIMARY_COLOR_OPTIONS : FONT_SIZE_OPTIONS;
  return options.some((o) => o.key === value);
}

/** The settings view's raw values, resolved to known options (unknown stored values fall back like the Web CSS does). */
export function resolveAppearance(settings: { readonly theme: unknown; readonly primaryColor: unknown; readonly fontSize: unknown }): {
  readonly theme: ThemeSetting;
  readonly primaryColor: PrimaryColorKey;
  readonly fontSize: FontSizeSetting;
} {
  return {
    theme: isValidAppearanceValue('theme', settings.theme) ? (settings.theme as ThemeSetting) : 'system',
    primaryColor: isValidAppearanceValue('primaryColor', settings.primaryColor) ? (settings.primaryColor as PrimaryColorKey) : 'green',
    fontSize: isValidAppearanceValue('fontSize', settings.fontSize) ? (settings.fontSize as FontSizeSetting) : 'medium',
  };
}
