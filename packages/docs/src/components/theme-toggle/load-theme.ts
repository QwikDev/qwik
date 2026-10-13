/**
 * Complements theme-toggle.tsx, adding the `data-theme` and `data-theme-auto` attributes before the
 * visible task can run.
 *
 * This should be placed in head so there's no FoUC.
 */
let storedTheme: string | null = null;
try {
  storedTheme = localStorage.getItem('theme');
} catch {
  // Use the default theme when storage is unavailable.
}

const isSystem = storedTheme === 'auto';
const effectiveTheme = isSystem
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
  : storedTheme === 'light'
    ? 'light'
    : 'dark';
const html = document.documentElement;
html.setAttribute('data-theme', effectiveTheme);
html.classList.toggle('dark', effectiveTheme === 'dark');
html.toggleAttribute('data-theme-auto', isSystem);

export {};
