import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';

export default (window: ClientSPAWindow, history: History, document: Document) => {
  /**
   * TODO Build SPA init to a file under /build/, conditional src in DOM.
   * - Cache file when upgrading to SPA.
   * - Reasonable expectation this small file is already cached for history revisits.
   * - No need for popstate fallback, this will always be available.
   * - Robust, fully relies only on history.
   * TODO Swap localStorage for script.src.
   * TODO Dev vs prod?
   * TODO Add configuration notes on CSP docs as applicable.
   */

  /**
   * This should ALWAYS be 'manual' if a page was arrived at via SPA.
   * Robust, stored in browser history state, will always be attached to history entry.
   * If this is not set, your page is MPA and never had an SPA context. (no pop needed?)
   */
  if (history.scrollRestoration === 'manual') {
    const scrollState = (history.state as ScrollHistoryState)?._qCityScroll;
    if (scrollState) {
      window.scrollTo(scrollState.x, scrollState.y);
    }

    // ! Proof of concept only, brittle if localStorage gets cleared. (swap to file-based)
    const script = document.createElement('script');
    script.text = localStorage.getItem('_qCitySPA')!;
    (document.currentScript as HTMLScriptElement).after(script);
  }
};
