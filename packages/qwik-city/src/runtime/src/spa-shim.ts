import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';

import { getPlatform } from '@qwik.dev/core';
import { isDev, isServer } from '@qwik.dev/core/build';

import init from './spa-init';

export default (base: string) => {
  if (isServer) {
    const [symbol, bundle] = getPlatform().chunkForSymbol(init.getSymbol(), null, init.dev?.file)!;
    const args = [base, bundle, symbol].map((x) => JSON.stringify(x)).join(',');
    return `(${shim.toString()})(${args});`;
  }
};

// SPA shim script:
// - Inlined, loads immediately, checks SPA status.
// - Manually imports and runs the standalone symbol for SPA recovery.
// - Robust, fully relies only on history state. (scrollRestoration = 'manual')
// - If the check here doesn't pass, your page was never SPA. (no SPA pops possible)

// ! DO NOT IMPORT OR USE ANY EXTERNAL REFERENCES IN THIS SCRIPT.
const shim = async (base: string, path: string, symbol: string) => {
  if (!(window as ClientSPAWindow)._qcs && history.scrollRestoration === 'manual') {
    // TODO Option to remove this shim especially for MFEs, like loader, for now we only run once.
    (window as ClientSPAWindow)._qcs = true;

    const scrollState = (history.state as ScrollHistoryState)?._qCityScroll;
    if (scrollState) {
      window.scrollTo(scrollState.x, scrollState.y);
    }

    const script = document.currentScript as HTMLScriptElement;
    if (script) {
      // Inside shadow DOM, we can't get a hold of a container. So we can't
      // load the SPA shim.
      const container = script!.closest(
        '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])'
      )!;
      const url = new URL(path, new URL(base, document.baseURI));

      if (isDev) {
        // Bypass dev import hijack. (not going to work here)
        // eslint-disable-next-line no-new-func
        const imp = new Function('url', 'return import(url)');
        (await imp(url.href))[symbol](container);
      } else {
        (await import(url.href))[symbol](container);
      }
    }
  }
};
