// TODO!!! Finalize this file, manual minification, etc.?
// TODO!!! Determine extent of need, method of import.
export default function () {
  console.log('BEGIN: init-spa.js');

  const loc = location;
  const currentPath = loc.pathname + loc.search;
  const fallback = '_qCityPopstateFallback';
  const history = '_qCityHistory';

  // TODO Replace this with expanded script for recovering SPA.
  // Needs:
  // - OnLoad:
  // --- Always scroll if history._qCityScroll + scrollRestoration = 'manual'.
  //          (might need to be inside SHIM depending how this is loaded)
  // --- Browser refresh on hashes?
  // --- Destroy shim popstate stuff, depending how this is loaded.
  // !-- ??? (forgetting something possibly)
  // - Popstate Handler:
  // --- Hook into Navigate context if available.
  // --- Use a Link or ctx directly if possible (manifest?).
  // --- If no Navigate context, use the fallback reload().
  // - Scroll Handler:
  // --- Setup a scroll handler to save scrollState.
  // --- This is required in case we can't recover on this page. (no ctx, leaf edgecase)
  // --- Also if we pop to restore Navigate ctx, saving current scroll to state is too late.
  // --- Reuse the same `window._` that internal scroll handler uses.
  // - Window:
  // --- Define these on `window` in a way that Navigate upgrade can destroy them.
  // - Navigation API:
  // --- Leave a TODO for future Navigation PR to accommodate.
  // --- Likely will not need anything except 1 `navigate` handler to enter Navigate.

  if (!window[fallback]) {
    window[fallback] = () => {
      if (!window[history] && currentPath !== loc.pathname + loc.search) {
        loc.reload();
      }
    };

    setTimeout(() => {
      addEventListener('popstate', window[fallback]);
    }, 0);
  }

  console.log('END: init-spa.js');
}
