import loadThemeScript from './load-theme?compiled-string';
export const themeStorageKey = 'theme-preference';

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

export const ThemeScript = () => {
  return <script dangerouslySetInnerHTML={loadThemeScript} />;
};
