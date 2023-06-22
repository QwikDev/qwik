// TODO!!! Finalize this file, manual minification, etc.?
export default () => {
  console.log('BEGIN: init-popstate.js');

  const loc = location;
  const currentPath = loc.pathname + loc.search;
  const fallback = '_qCityPopstateFallback';
  const history = '_qCityHistory';

  // TODO Shim for expanded SPA recovery pop.

  // TODO Conditions for checking SPA status:
  // - history.scrollRestoration = 'manual'?
  // --- This will ALWAYS be set if a page was arrived at via SPA.
  // --- Robust, stored in browser history state, will always be attached to history entry.
  // --- If this is not set, your page is MPA and you cannot pop anywhere. (at least not from us)
  // --- Tested this on Chromium, FF, WebKitGTK.

  // TODO Potential load strategies to consider for SPA init:
  // - "Install" the script in localStorage upon SPA upgrade. Load it. (XSS? minimal w/ checks)
  // - Build SPA init to a file under /build/, conditional add to DOM. (likely)
  // --- This one we might be able to save by removing the popstate fallback below.
  // --- State-based? (no need to worry if user clears browser)
  // --- Add this file to the browser's cache ahead of time when uprading to SPA.
  // --- SPA reasonable expectation this file is already cached for history revists. (blocking import)
  // - Cookie? (might be brittle, overhead)
  // - etc...
  // ! Will need to add configuration notes on CSP docs.
  // - Hash checking?
  // ! MINIMAL footprint. (low overhead on MPA-only, every byte counts)

  if (!window[fallback]) {
    window[fallback] = () => {
      console.log('--- popped ---');
      if (!window[history] && currentPath !== loc.pathname + loc.search) {
        loc.reload();
      }
    };

    setTimeout(() => {
      addEventListener('popstate', window[fallback]);
    }, 0);
  }

  console.log('END: init-popstate.js');
}
