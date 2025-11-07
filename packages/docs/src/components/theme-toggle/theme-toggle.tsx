/**
 * Theme Toggle Component
 *
 * The effective theme is stored on the `<html>` element as a `data-theme` attribute. There is also
 * the `data-theme-auto` attribute which is present when the user has selected "auto" theme.
 */
import { component$, event$, isServer, useContext, useStyles$ } from '@qwik.dev/core';
import { useVisibleTask$ } from '@qwik.dev/core';
import { GlobalStore, type SiteStore } from '~/context';
import { BrillianceIcon } from './Brilliance';
import { MoonIcon } from './Moon';
import { SunIcon } from './Sun';
import toggleCss from './theme-toggle.css?inline';

export type ThemePreference = 'dark' | 'light' | 'auto';

const themeStorageKey = 'theme';

const queryDark = () => window.matchMedia('(prefers-color-scheme: dark)');

const getEffectiveTheme = (stored: ThemePreference, systemDark = queryDark().matches) => {
  if (stored === 'auto') {
    return systemDark ? 'dark' : 'light';
  }
  return stored;
};

const applyTheme = (store: SiteStore, theme: ThemePreference, systemDark = queryDark().matches) => {
  const effective = getEffectiveTheme(theme, systemDark);
  store.theme = effective;
  const el = document.firstElementChild!;
  el.setAttribute('data-theme', effective);
  if (theme === 'auto') {
    el.setAttribute('data-theme-auto', '');
    localStorage.removeItem(themeStorageKey);
  } else {
    el.removeAttribute('data-theme-auto');
    localStorage.setItem(themeStorageKey, theme);
  }
};

const getThemeFromLS = (): ThemePreference => {
  let theme;
  if (!isServer) {
    try {
      theme = localStorage.getItem(themeStorageKey);
    } catch {
      // ignore
    }
  }
  return (theme as ThemePreference) || 'auto';
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
    { strategy: 'document-idle' }
  );

  const toggleTheme$ = event$(() => {
    let currentTheme = getThemeFromLS();
    currentTheme = currentTheme === 'dark' ? 'light' : currentTheme === 'light' ? 'auto' : 'dark';
    applyTheme(store, currentTheme);
  });

  return (
    <>
      <button
        onClick$={toggleTheme$}
        class="group relative flex h-8 m-auto items-center justify-center rounded-md bg-background text-foreground hover:opacity-60 sm:w-8 sm:px-0"
        type="button"
        title="Toggle theme - light, system, dark"
      >
        <span class="inset-0 hidden sm:grid place-items-center transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-75">
          <SunIcon class="themeIcon light col-start-1 row-start-1" />
          <MoonIcon class="themeIcon dark col-start-1 row-start-1" />
          <BrillianceIcon class="themeIcon auto col-start-1 row-start-1" />
        </span>
        {/* theme-name is provided by global.css */}
        <span class="lg:hidden font-medium leading-none ">
          &nbsp;<span class="theme-name">&nbsp;Theme</span>
        </span>
      </button>
    </>
  );
});
