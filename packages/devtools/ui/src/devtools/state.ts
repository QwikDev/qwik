import type { AssetInfo, Component, NpmInfo, RoutesInfo } from '@devtools/kit';
import type { NoSerialize } from '@qwik.dev/core';

export type DevtoolsTabId =
  | 'overview'
  | 'packages'
  | 'renderTree'
  | 'routes'
  | 'assets'
  | 'inspect'
  | 'codeBreak'
  | 'performance'
  | 'preloads'
  | 'buildAnalysis';

export interface DevtoolsPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DevtoolsState {
  isOpen: boolean;
  isPanelFullscreen: boolean;
  activeTab: DevtoolsTabId;
  npmPackages: NpmInfo;
  assets: AssetInfo[];
  components: Component[];
  routes: NoSerialize<RoutesInfo[]> | undefined;
  allDependencies: unknown[];
  isLoadingDependencies: boolean;
  panelBounds: DevtoolsPanelBounds;
  lastPanelBounds: DevtoolsPanelBounds | null;
  /** Whether the Vite devtools plugin overlay is also active on the page. */
  vitePluginDetected?: boolean;
  /** True when running inside the browser extension panel (no Vite server). */
  isExtension: boolean;
}

export function createDevtoolsState(opts?: {
  isExtension?: boolean;
}): DevtoolsState {
  return {
    isOpen: false,
    isPanelFullscreen: false,
    activeTab: 'overview',
    npmPackages: [],
    assets: [],
    components: [],
    routes: undefined,
    allDependencies: [],
    isLoadingDependencies: false,
    panelBounds: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    lastPanelBounds: null,
    isExtension: opts?.isExtension ?? false,
  };
}
