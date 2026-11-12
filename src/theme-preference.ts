// The color theme the viewer chose. It is a preference of this browser, kept apart from the
// design: it is not part of the project or its exported files.
// index.html repeats parseThemePreference and resolveTheme in a small inline script, so the
// page is painted in the right theme before the app loads. Keep both in step.

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cockpit-lab-theme';

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Reads a stored preference. A missing or unknown value follows the system: a broken
 * convenience setting should not stop the app from opening.
 */
export function parseThemePreference(stored: string | null): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === stored) ?? 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}
