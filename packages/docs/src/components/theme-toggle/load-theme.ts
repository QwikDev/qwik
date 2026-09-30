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
  // Use the system preference when storage is unavailable.
}

const isSystem = storedTheme !== 'light' && storedTheme !== 'dark';
const effectiveTheme =
  storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
const html = document.documentElement;
html.setAttribute('data-theme', effectiveTheme);
html.classList.toggle('dark', effectiveTheme === 'dark');
html.toggleAttribute('data-theme-auto', isSystem);

export {};
