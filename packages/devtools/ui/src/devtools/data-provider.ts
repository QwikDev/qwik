import type { DevtoolsState } from './state';

/**
 * Abstraction for loading devtools data from different sources.
 *
 * - `ViteDataProvider`: uses birpc over Vite HMR WebSocket (in-app overlay)
 * - `ExtensionDataProvider`: reads the page Qwik DevTools root via
 *   chrome.devtools.inspectedWindow.eval() (browser extension)
 */
export interface DataProvider {
  /** Populate the devtools state with data from the provider. */
  loadData(state: DevtoolsState): Promise<void>;
}
