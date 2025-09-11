if (typeof window !== 'undefined' && !window.__qwikViteLog) {
  window.__qwikViteLog = true;
  // eslint-disable-next-line no-console
  console.debug(
    '%c⭐️ Qwik Dev SSR Mode',
    'background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;',
    "App is running in SSR development mode!\n - Additional JS is loaded by Vite for debugging and live reloading\n - Rendering performance might not be optimal\n - Delayed interactivity because prefetching is disabled\n - Vite dev bundles do not represent production output\n\nProduction build can be tested running 'npm run preview'"
  );
}
