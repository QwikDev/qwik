/**
 * Complements theme-toggle.tsx, adding the `data-theme` and `data-theme-auto` attributes before the
 * visible task can run.
 *
 * This should be placed in head so there's no FoUC.
 */
try {
  // keep in sync with themeStorageKey in theme-toggle.tsx
  let getItem = localStorage.getItem('theme');
  const el = document.firstElementChild!;
  if (!getItem) {
    el.setAttribute('data-theme-auto', '');
    getItem = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  el.setAttribute('data-theme', getItem);
} catch {
  // ignore
}

export {};
