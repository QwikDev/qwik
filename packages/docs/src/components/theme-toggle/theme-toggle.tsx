import {
  component$,
  createSignal,
  event$,
  isBrowser,
  useStyles$,
  type Signal,
} from '@qwik.dev/core';
import { themeStorageKey } from '../router-head/theme-script';
import { SunAndMoon } from './sun-and-moon';
import themeToggle from './theme-toggle.css?inline';

type ThemeName = 'dark' | 'light' | undefined;

export const getTheme = (): ThemeName => {
  let theme;
  const matchMedia = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    theme = localStorage.getItem(themeStorageKey);
    return (theme as ThemeName) || matchMedia;
  } catch {
    return matchMedia;
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
  console.log(theme);
  if (!theme) {
    localStorage.removeItem(themeStorageKey);
    theme = getTheme();
  } else {
    localStorage.setItem(themeStorageKey, theme);
  }
  document.firstElementChild?.setAttribute('data-theme', theme!);
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
