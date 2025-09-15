import {
  component$,
  createSignal,
  event$,
  isBrowser,
  isServer,
  useStyles$,
  type Signal,
} from '@qwik.dev/core';
import { themeStorageKey } from '../router-head/theme-script';
import { SunAndMoon } from './sun-and-moon';
import themeToggle from './theme-toggle.css?inline';

type ThemeName = 'dark' | 'light' | 'auto';

export const getTheme = (): ThemeName => {
  if (isServer) {
    return 'auto';
  }
  let theme;
  try {
    theme = localStorage.getItem(themeStorageKey);
    return (theme as ThemeName) || 'auto';
  } catch {
    return 'auto';
  }
};

let currentThemeSignal: Signal<ThemeName>;
export const getThemeSignal = () => {
  if (!isBrowser) {
    throw new Error('getThemeSignal is only available in the browser');
  }
  if (!currentThemeSignal) {
    currentThemeSignal = createSignal(getTheme());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      currentThemeSignal.value = getTheme();
    });
  }
  return currentThemeSignal;
};

export const setTheme = (theme: ThemeName) => {
  if (theme === 'auto') {
    document.firstElementChild?.removeAttribute('data-theme');
  } else {
    document.firstElementChild?.setAttribute('data-theme', theme!);
  }
  localStorage.setItem(themeStorageKey, theme);
  if (currentThemeSignal) {
    currentThemeSignal.value = theme;
  }
};

export const ThemeToggle = component$(() => {
  useStyles$(themeToggle);

  const onClick$ = event$(() => {
    const currentTheme = getTheme();
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  return (
    <>
      <span class="lg:hidden">
        <button onClick$={onClick$}>
          <span class="theme-name" /> theme
        </button>
      </span>
      <span class="hidden lg:block">
        <button
          type="button"
          class="theme-toggle"
          id="theme-toggle"
          title="Toggles light & dark"
          onClick$={onClick$}
        >
          <SunAndMoon />
        </button>
      </span>
    </>
  );
});
