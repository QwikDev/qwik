import type { DevtoolsTabId } from './state';
import { devtoolsTabs, type DevtoolsTabConfig } from './tabs';

/** Tab configs keyed by id, for resolving an ordered id list. */
const tabsById = new Map<DevtoolsTabId, DevtoolsTabConfig>(
  devtoolsTabs.map((tab): [DevtoolsTabId, DevtoolsTabConfig] => [tab.id, tab])
);

/** Default sidebar configuration: every tab visible, in registry order. */
export function getDefaultVisibleTabIds(): DevtoolsTabId[] {
  return devtoolsTabs.map((tab) => tab.id);
}

/**
 * Resolves the ordered visible ids to their tab configs, dropping unknown ids and, in the
 * extension, tabs that require the Vite plugin.
 */
export function getVisibleTabs(
  visibleTabIds: DevtoolsTabId[],
  isExtension: boolean
): DevtoolsTabConfig[] {
  const tabs: DevtoolsTabConfig[] = [];
  for (const id of visibleTabIds) {
    const tab = tabsById.get(id);
    if (tab && !(isExtension && tab.viteOnly)) {
      tabs.push(tab);
    }
  }
  return tabs;
}
