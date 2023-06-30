import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';

import { getPlatform } from '@builder.io/qwik';
import { isDev, isServer } from '@builder.io/qwik/build';
import { basePathname } from '@qwik-city-plan';

import init from './spa-init';

export default () => {
  if (isServer) {
    const [symbol, bundle] = getPlatform().chunkForSymbol(init.getSymbol(), null)!;
    const path = (!isDev ? basePathname + 'build/' : '') + bundle;
    return `(${shim.toString()})('${path}','${symbol}');`;
  }
};

// SPA shim script:
// - Inlined, loads immediately, checks SPA status.
// - Manually imports and runs the standalone symbol for SPA recovery.
// - Robust, fully relies only on history state. (scrollRestoration = 'manual')
// - If the check here doesn't pass, your page was never SPA. (no SPA pops possible)

// ! DO NOT IMPORT OR USE ANY EXTERNAL REFERENCES IN THIS SCRIPT.
const shim = async (path: string, symbol: string) => {
  if (!(window as ClientSPAWindow)._qcs && history.scrollRestoration === 'manual') {
    // TODO Option to remove this shim especially for MFEs, like loader, for now we only run once.
    (window as ClientSPAWindow)._qcs = true;

    const scrollState = (history.state as ScrollHistoryState)?._qCityScroll;
    if (scrollState) {
      window.scrollTo(scrollState.x, scrollState.y);
    }

    const currentScript = document.currentScript as HTMLScriptElement;
    if (!isDev) {
      (await import(path))[symbol](currentScript);
    } else {
      // Importing @qwik-city-plan here explodes dev, get basePathname manually.
      const container = currentScript.closest('[q\\:container]')!;
      const base = new URL(container.getAttribute('q:base')!, document.baseURI);
      const url = new URL(path, base);

      // Bypass dev import hijack. (not going to work here)
      // eslint-disable-next-line no-new-func
      const imp = new Function('url', 'return import(url)');
      (await imp(url.href))[symbol](currentScript);
    }
  }
};
