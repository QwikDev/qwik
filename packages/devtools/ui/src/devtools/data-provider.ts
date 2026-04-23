import type { DevtoolsState } from './state';

/**
 * Abstraction for loading devtools data from different sources.
 *
 * - `ViteDataProvider`: uses birpc over Vite HMR WebSocket (in-app overlay)
 * - `ExtensionDataProvider`: reads window globals via chrome.devtools.inspectedWindow.eval() (browser extension)
 */
export interface DataProvider {
  /** Populate the devtools state with data from the provider. */
  loadData(state: DevtoolsState): Promise<void>;
}

declare global {
  interface Window {
    /**
     * When set before the UI mounts, the devtools will use this provider
     * instead of the default Vite RPC connection.
     */
    __QWIK_DEVTOOLS_DATA_PROVIDER__?: DataProvider;
  }
}
