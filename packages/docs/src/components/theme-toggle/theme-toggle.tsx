import { component$, event$, isServer, useContext, useStyles$ } from '@builder.io/qwik';
import { SunAndMoon } from './sun-and-moon';
import { themeStorageKey } from '../router-head/theme-script';
import themeToggle from './theme-toggle.css?inline';
import { GlobalStore } from '../../context';
import { SunIcon } from './Sun';
import { MoonIcon } from './Moon';
import { BrillianceIcon } from './Brilliance';
export type ThemePreference = 'dark' | 'light' | 'auto';
export const setPreference = (theme: ThemePreference) => {
  if (theme === 'auto') {
    document.firstElementChild?.removeAttribute('data-theme');
  } else {
    document.firstElementChild?.setAttribute('data-theme', theme!);
  }

  localStorage.setItem(themeStorageKey, theme);
};

export const getColorPreference = (): ThemePreference => {
  if (isServer) {
    return 'auto';
  }
  let theme;
  try {
    theme = localStorage.getItem(themeStorageKey);
  } catch {
    //
  }
  return (theme as ThemePreference) || 'auto';
};

export const colorSchemeChangeListener = (onColorSchemeChange: (isDark: boolean) => void) => {
  const listener = ({ matches: isDark }: MediaQueryListEvent) => {
    onColorSchemeChange(isDark);
  };
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (event) => listener(event));

  return () =>
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', listener);
};

export const ThemeToggle = component$(() => {
  useStyles$(themeToggle);
  const onClick$ = event$(() => {
    let currentTheme = getColorPreference();
    if (currentTheme === 'dark') {
      currentTheme = 'light';
    } else if (currentTheme === 'light') {
      currentTheme = 'auto';
    } else {
      currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
    }
    setPreference(currentTheme);
  });

  return (
    <>
      <button
        onClick$={onClick$}
        class="group relative flex h-8 w-8 items-center justify-center rounded-md bg-background text-foreground hover:opacity-60"
      >
        <div class="absolute inset-0 grid place-items-center transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-75">
          <SunIcon class="themeIcon light col-start-1 row-start-1" />
          <MoonIcon class="themeIcon dark col-start-1 row-start-1" />
          <BrillianceIcon class="themeIcon auto col-start-1 row-start-1" />
        </div>
      </button>
    </>
  );
});
