// TODO!!! Finalize this file, manual minification, etc.
export default function () {
  console.log('BEGIN: init-popstate.js');

  const loc = location;
  const currentPath = loc.pathname + loc.search;
  const fallback = '_qCityPopstateFallback';
  const history = '_qCityHistory';

  // TODO Shim for expanded SPA recovery pop.
  // TODO Test conditions for checking SPA status...
  // - history.scrollRestoration = 'manual'?
  // - history.state._qCityScroll?
  // - localStorage?
  // - Hash checking?
  //!- MINIMAL footprint. (low overhead on MPA-only, every byte counts)

  // TODO Potential load strategies to consider for SPA init:
  // - "Install" the script in localStorage upon SPA upgrade. Load it. (XSS? minimal w/ checks)
  // - Build SPA init to a file under /build/, conditional add to DOM. (likely)
  // --- This one we might be able to save by removing the popstate fallback below.
  // --- State-based? (no need to worry if user clears browser)
  //!--- Investigate edgecases around spa->anchor->pop, etc.
  // - Cookie? (might be brittle, overhead)
  // - etc...
  //!- Will need to add configuration notes on CSP docs.

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

  console.log('END: init-popstate.js');
}
