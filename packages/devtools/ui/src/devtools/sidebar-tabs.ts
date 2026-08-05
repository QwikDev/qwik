import type { DevtoolsTabId } from './state';
import { devtoolsTabs, type DevtoolsTabConfig } from './tabs';

const STORAGE_KEY = 'qwik-devtools:visible-tabs';

/** Tab configs keyed by id, for resolving an ordered id list. */
const tabsById = new Map<DevtoolsTabId, DevtoolsTabConfig>(
  devtoolsTabs.map((tab): [DevtoolsTabId, DevtoolsTabConfig] => [tab.id, tab])
);

const KNOWN_TAB_IDS: ReadonlySet<string> = new Set(devtoolsTabs.map((tab) => tab.id));

function isDevtoolsTabId(id: string): id is DevtoolsTabId {
  return KNOWN_TAB_IDS.has(id);
}

/** Default sidebar configuration: every tab visible, in registry order. */
export function getDefaultVisibleTabIds(): DevtoolsTabId[] {
  return devtoolsTabs.map((tab) => tab.id);
}

/** Tabs not currently visible (reachable via the More panel), in registry order. */
export function getAvailableTabIds(visibleTabIds: DevtoolsTabId[]): DevtoolsTabId[] {
  const visible = new Set(visibleTabIds);
  return devtoolsTabs.map((tab) => tab.id).filter((id) => !visible.has(id));
}

/** Hidden tabs resolved to their configs (the More panel contents), in registry order. */
export function getAvailableTabs(visibleTabIds: DevtoolsTabId[]): DevtoolsTabConfig[] {
  return resolveTabs(getAvailableTabIds(visibleTabIds));
}

/** Moves `draggedId` to sit just before `targetId` in the list, returning a new list. */
export function reorderVisibleTabs(
  visibleTabIds: DevtoolsTabId[],
  draggedId: DevtoolsTabId,
  targetId: DevtoolsTabId
): DevtoolsTabId[] {
  if (draggedId === targetId) {
    return visibleTabIds;
  }
  const without = visibleTabIds.filter((id) => id !== draggedId);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex < 0) {
    return visibleTabIds;
  }
  without.splice(targetIndex, 0, draggedId);
  return without;
}

/** Adds (appends) or removes a tab from the ordered visible list, returning a new list. */
export function setTabVisible(
  visibleTabIds: DevtoolsTabId[],
  id: DevtoolsTabId,
  visible: boolean
): DevtoolsTabId[] {
  if (visible) {
    return visibleTabIds.includes(id) ? visibleTabIds : [...visibleTabIds, id];
  }
  return visibleTabIds.filter((tabId) => tabId !== id);
}

/** Drops ids no longer in the registry and de-dupes, preserving the stored order. */
function normalizeVisibleTabIds(ids: readonly string[]): DevtoolsTabId[] {
  const seen = new Set<DevtoolsTabId>();
  const result: DevtoolsTabId[] = [];
  for (const id of ids) {
    if (isDevtoolsTabId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/**
 * Reads the persisted visible-tabs list, or null when nothing valid is stored so the caller falls
 * back to the default. An empty list is honored (the user hid every tab). Tabs added to the
 * registry since the last save stay hidden (reachable via the More panel) until opted in.
 */
export function loadVisibleTabIds(): DevtoolsTabId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return normalizeVisibleTabIds(
      parsed.filter((value): value is string => typeof value === 'string')
    );
  } catch {
    return null;
  }
}

/** Persists the visible-tabs list. Storage failures (private mode, quota) are ignored. */
export function saveVisibleTabIds(visibleTabIds: DevtoolsTabId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleTabIds));
  } catch {
    // ignore storage failures
  }
}

/** Resolves an ordered id list to its tab configs, dropping unknown ids. */
export function resolveTabs(ids: DevtoolsTabId[]): DevtoolsTabConfig[] {
  const tabs: DevtoolsTabConfig[] = [];
  for (const id of ids) {
    const tab = tabsById.get(id);
    if (tab) {
      tabs.push(tab);
    }
  }
  return tabs;
}

/**
 * Resolves the ordered visible ids to their tab configs, dropping, in the extension, tabs that
 * require the Vite plugin.
 */
export function getVisibleTabs(
  visibleTabIds: DevtoolsTabId[],
  isExtension: boolean
): DevtoolsTabConfig[] {
  return resolveTabs(visibleTabIds).filter((tab) => !(isExtension && tab.viteOnly));
}
