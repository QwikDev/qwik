/**
 * Theme Toggle Component
 *
 * The effective theme is stored on the `<html>` element as a `data-theme` attribute. There is also
 * the `data-theme-auto` attribute which is present when the user has selected "auto" theme.
 */
import { component$, event$, useContext, useStyles$ } from '@qwik.dev/core';
import { useVisibleTask$ } from '@qwik.dev/core';
import { GlobalStore, type SiteStore } from '~/context';
import { BrillianceIcon } from './icons/brilliance';
import { MoonIcon } from './icons/moon';
import { SunIcon } from './icons/sun';
import toggleCss from './theme-toggle.css?inline';

export type ThemePreference = 'dark' | 'light' | 'auto';

const themeStorageKey = 'theme';

const queryDark = () => window.matchMedia('(prefers-color-scheme: dark)');

const getEffectiveTheme = (
  stored: ThemePreference,
  systemDark = queryDark().matches
) => {
  if (stored === 'auto') {
    return systemDark ? 'dark' : 'light';
  }
  return stored;
};

const applyTheme = (
  store: SiteStore,
  theme: ThemePreference,
  systemDark = queryDark().matches
) => {
  const effective = getEffectiveTheme(theme, systemDark);
  store.theme = effective;
  const el = document.documentElement;
  el.setAttribute('data-theme', effective);
  el.classList.toggle('dark', effective === 'dark');
  el.toggleAttribute('data-theme-auto', theme === 'auto');
};

const saveTheme = (theme: ThemePreference) => {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // Keep the current theme when storage is unavailable.
  }
};

const getThemeFromLS = (): ThemePreference => {
  try {
    const theme = localStorage.getItem(themeStorageKey);
    if (theme === 'light' || theme === 'dark' || theme === 'auto') {
      return theme;
    }
  } catch {
    // Read the current document theme when storage is unavailable.
  }
  if (document.documentElement.hasAttribute('data-theme-auto')) {
    return 'auto';
  }
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
};

export const ThemeToggle = component$(() => {
  useStyles$(toggleCss);
  const store = useContext(GlobalStore);

  useVisibleTask$(
    () => {
      const pref = getThemeFromLS();
      const query = queryDark();

      applyTheme(store, pref, query.matches);

      // Listen to system theme changes
      const listener = ({ matches: prefersDark }: MediaQueryListEvent) => {
        const currentPref = getThemeFromLS();
        applyTheme(store, currentPref, prefersDark);
      };

      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
    { strategy: 'document-ready' }
  );

  const toggleTheme$ = event$(() => {
    let currentTheme = getThemeFromLS();
    currentTheme =
      currentTheme === 'auto'
        ? 'light'
        : currentTheme === 'light'
          ? 'dark'
          : 'auto';
    applyTheme(store, currentTheme);
    saveTheme(currentTheme);
  });

  return (
    <button
      onClick$={toggleTheme$}
      class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 lg:h-[76px] lg:px-5 cursor-pointer"
      type="button"
      aria-label="Change color theme"
      title="Change color theme: system, light, dark"
    >
      <span class="grid place-items-center size-6 text-foreground-base">
        <SunIcon class="themeIcon light col-start-1 row-start-1" />
        <MoonIcon class="themeIcon dark col-start-1 row-start-1" />
        <BrillianceIcon class="themeIcon auto col-start-1 row-start-1" />
      </span>
    </button>
  );
});
