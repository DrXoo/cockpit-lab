// The color theme, a preference of this browser rather than of the design: the system's, light
// or dark, cycled by the theme button and remembered while the browser lets it store data.
import { $ } from './dom.ts';
import { drawIcons } from './icons.ts';
import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_LABELS,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme-preference.ts';

const THEME_ICONS: Record<ThemePreference, string> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};

function storedThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export class ColorTheme {
  declare private preference: ThemePreference;
  declare private readonly systemPrefersDark: MediaQueryList;
  /** Tells what draws its own colors, such as the 3D view, that the theme changed. */
  declare private readonly applied: () => void;

  constructor(applied: () => void) {
    this.applied = applied;
    this.preference = storedThemePreference();
    this.systemPrefersDark = matchMedia('(prefers-color-scheme: dark)');
    $('#themeBtn').addEventListener('click', () => {
      this.preference = nextThemePreference(this.preference);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.preference);
      } catch {
        // Without storage the choice lasts until the page is closed.
      }
      this.apply();
    });
    this.systemPrefersDark.addEventListener('change', () => {
      if (this.preference === 'system') this.apply();
    });
  }

  /** Shows the page in the theme the preference resolves to, and the button with the preference. */
  apply() {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(this.preference, this.systemPrefersDark.matches);
    const label = THEME_PREFERENCE_LABELS[this.preference];
    const button = $('#themeBtn');
    button.setAttribute('aria-label', `Color theme: ${label}`);
    $('#themeBtn span').textContent = label;
    $('#themeBtn i').dataset.icon = THEME_ICONS[this.preference];
    drawIcons(button);
    const pageColor = getComputedStyle(root).getPropertyValue('--surface-page').trim();
    $('meta[name="theme-color"]').setAttribute('content', pageColor);
    this.applied();
  }
}
