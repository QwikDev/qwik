import { component$, event$, isServer, useSignal, useStyles$ } from '@builder.io/qwik';
import { themeStorageKey } from './theme-script';
import themeToggle from './theme-toggle.css?inline';
import { SunIcon } from './Sun';
import { MoonIcon } from './Moon';
import { BrillianceIcon } from './Brilliance';
export type ThemePreference = 'dark' | 'light' | 'auto';

export const getSystemIsDark = (): boolean =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const getEffectiveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference === 'auto') {
    return getSystemIsDark() ? 'dark' : 'light';
  }
  return preference;
};
export const setPreference = (theme: ThemePreference) => {
  if (theme === 'auto') {
    const el = document.firstElementChild;
    if (!el) {
      return;
    }
    el.setAttribute('data-theme', getEffectiveTheme('auto'));
  } else {
    const el = document.firstElementChild;
    if (!el) {
      return;
    }
    el.setAttribute('data-theme', theme!);
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

export const ThemeToggle = component$(() => {
  useStyles$(themeToggle);
  const preference = useSignal<ThemePreference>(getColorPreference());
  const onClick$ = event$(() => {
    let currentTheme = preference.value;
    if (currentTheme === 'dark') {
      currentTheme = 'light';
    } else if (currentTheme === 'light') {
      currentTheme = 'auto';
    } else if (currentTheme === 'auto') {
      currentTheme = 'dark';
    }
    setPreference(currentTheme);
    preference.value = currentTheme;
  });

  return (
    <>
      <button
        onClick$={onClick$}
        class={[
          'group relative flex h-8 w-8 items-center justify-center rounded-md bg-background text-foreground hover:opacity-60',
          {
            'pref-light': preference.value === 'light',
            'pref-dark': preference.value === 'dark',
            'pref-auto': preference.value === 'auto',
          },
        ]}
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
