// Theme: the Web app's palette tokens (styles.css :root / data-theme /
// data-color) and font-size scale, driven by the stored appearance settings.
// `colors`/`spacing` are the fixed foundation palette still used by the lock
// screen and the development diagnostics.

import { createContext, useContext } from 'react';

import { FONT_SIZE_SCALE, type FontSizeSetting, type PrimaryColorKey, type ThemeSetting } from '../domain/appearance.ts';

export const colors = {
  background: '#F4F6F8',
  surface: '#FFFFFF',
  text: '#1B1F24',
  muted: '#5B6470',
  accent: '#0A7D5A',
  accentText: '#FFFFFF',
  danger: '#B3261E',
  border: '#DDE2E8',
  disabled: '#AEB6BF',
} as const;

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

export type Palette = {
  readonly bg: string;
  readonly surface: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly danger: string;
  readonly dangerBg: string;
  readonly warning: string;
  readonly warningBg: string;
  readonly success: string;
  readonly primary: string;
  readonly primaryDark: string;
  /**
   * styles.css --color-primary-bg: the light primary tint (nav pill, filter chip,
   * ATM "+" / edit buttons). Like the Web it stays light in dark mode.
   */
  readonly primaryBg: string;
  /** styles.css --color-insight-card-bg: tinted cards; the only tint dark mode darkens. */
  readonly insightCardBg: string;
  /** The primary color used as TEXT on the surface. */
  readonly primaryText: string;
  readonly onPrimary: string;
  readonly disabled: string;
  readonly overlay: string;
};

const LIGHT = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#16181d',
  textMuted: '#616774',
  danger: '#c0392b',
  dangerBg: '#fdecea',
  warning: '#b45309',
  warningBg: '#fef3e2',
  success: '#0a7d3d',
  disabled: '#b8bec7',
  overlay: 'rgba(0,0,0,0.45)',
};

const DARK = {
  bg: '#14161a',
  surface: '#1e2126',
  border: '#2c2f36',
  text: '#eef0f3',
  textMuted: '#9aa0aa',
  danger: '#e5695c',
  dangerBg: '#3a1f1c',
  warning: '#e0a84f',
  warningBg: '#3a2f18',
  success: '#3ddc84',
  disabled: '#4a4f58',
  overlay: 'rgba(0,0,0,0.6)',
};

const PRIMARY: Readonly<
  Record<PrimaryColorKey, { primary: string; primaryDark: string; primaryBg: string; darkText: string; darkBg: string }>
> = {
  green: { primary: '#0a7d3d', primaryDark: '#066b32', primaryBg: '#eaf7ef', darkText: '#3ddc84', darkBg: '#16311f' },
  blue: { primary: '#164b96', primaryDark: '#0f3a78', primaryBg: '#e8f0fc', darkText: '#6fa8f5', darkBg: '#16233a' },
  purple: { primary: '#5b2f96', primaryDark: '#46247a', primaryBg: '#f1eaf9', darkText: '#b592e8', darkBg: '#271f38' },
  teal: { primary: '#0d7274', primaryDark: '#095c5d', primaryBg: '#e5f6f6', darkText: '#4fd0d2', darkBg: '#123030' },
  orange: { primary: '#b8560f', primaryDark: '#95450c', primaryBg: '#fdece0', darkText: '#f0a35f', darkBg: '#382513' },
  graphite: { primary: '#3f4650', primaryDark: '#2c3138', primaryBg: '#eceef1', darkText: '#b9c0cc', darkBg: '#282b30' },
};

/** styles.css .settings-color-<key> swatch backgrounds (each palette's primary). */
export const PRIMARY_SWATCH = Object.fromEntries(Object.entries(PRIMARY).map(([k, v]) => [k, v.primary])) as Readonly<Record<PrimaryColorKey, string>>;

export type Theme = {
  readonly dark: boolean;
  readonly c: Palette;
  readonly scale: number;
  /** A font size (or line height) scaled by the user's font-size setting. */
  fs(size: number): number;
};

export type AppearanceInput = { readonly theme: ThemeSetting; readonly primaryColor: PrimaryColorKey; readonly fontSize: FontSizeSetting };

export function buildTheme(appearance: AppearanceInput, systemDark: boolean): Theme {
  const dark = appearance.theme === 'dark' || (appearance.theme === 'system' && systemDark);
  const base = dark ? DARK : LIGHT;
  const p = PRIMARY[appearance.primaryColor];
  const scale = FONT_SIZE_SCALE[appearance.fontSize];
  return {
    dark,
    scale,
    fs: (size: number) => Math.round(size * scale * 10) / 10,
    c: {
      ...base,
      primary: p.primary,
      primaryDark: p.primaryDark,
      primaryBg: p.primaryBg,
      insightCardBg: dark ? p.darkBg : p.primaryBg,
      primaryText: dark ? p.darkText : p.primary,
      onPrimary: '#ffffff',
    },
  };
}

export const DEFAULT_THEME: Theme = buildTheme({ theme: 'light', primaryColor: 'green', fontSize: 'medium' }, false);

export const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
