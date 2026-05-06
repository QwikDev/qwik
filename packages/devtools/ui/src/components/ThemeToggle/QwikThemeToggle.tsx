import { component$, event$, isServer } from '@qwik.dev/core';
import { themeStorageKey } from '../router-head/theme-script';
import { IconMoonOutline, IconSparkles, IconSunOutline } from '../Icons/Icons';
import './themeToggle.css';
type ThemeName = 'dark' | 'light' | 'auto';

export const getTheme = (): ThemeName => {
  if (isServer) {
    return 'auto';
  }
  let theme;
  try {
    theme = localStorage.getItem(themeStorageKey);
  } catch {
    //
  }
  return (theme as ThemeName) || 'auto';
};

export const setTheme = (theme: ThemeName) => {
  if (theme === 'auto') {
    document.firstElementChild?.removeAttribute('data-theme');
  } else {
    document.firstElementChild?.setAttribute('data-theme', theme!);
  }

  localStorage.setItem(themeStorageKey, theme);
};

export const QwikThemeToggle = component$(() => {
  const onClick$ = event$(() => {
    let currentTheme = getTheme();
    if (currentTheme === 'dark') {
      currentTheme = 'light';
    } else if (currentTheme === 'light') {
      currentTheme = 'auto';
    } else if (currentTheme === 'auto') {
      currentTheme = 'dark';
    }
    setTheme(currentTheme);
  });

  return (
    <>
      <button
        onClick$={onClick$}
        class="bg-background text-foreground group relative flex h-8 w-8 items-center justify-center rounded-md hover:opacity-60"
      >
        <div class="absolute inset-0 grid place-items-center transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-75">
          <IconSunOutline class="themeIcon light col-start-1 row-start-1" />
          <IconMoonOutline class="themeIcon dark col-start-1 row-start-1" />
          <IconSparkles class="themeIcon auto col-start-1 row-start-1" />
        </div>
      </button>
    </>
  );
});
