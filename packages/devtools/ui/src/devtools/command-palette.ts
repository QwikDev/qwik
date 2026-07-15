import type { DevtoolsState, DevtoolsTabId } from './state';
import { devtoolsTabs } from './tabs';

const RECENTS_STORAGE_KEY = 'qwik-devtools:palette-recents';
const MAX_RECENTS = 5;

export type PaletteCategory = 'Tabs' | 'Components' | 'Routes' | 'Packages' | 'Actions';

export type PaletteActionId = 'toggleTheme' | 'clearPerformance' | 'clearRecents' | 'customizeTabs';

/** What activating a result does; kept as plain data so the model stays serializable and testable. */
export type PaletteTarget =
  | { kind: 'tab'; tabId: DevtoolsTabId }
  | { kind: 'component'; name: string }
  | { kind: 'route'; path: string }
  | { kind: 'package'; name: string }
  | { kind: 'action'; action: PaletteActionId };

export interface PaletteResult {
  /** Stable, category-scoped unique id, also used as the recents key. */
  id: string;
  category: PaletteCategory;
  label: string;
  /** Secondary text (version, file, path). */
  hint?: string;
  target: PaletteTarget;
}

export interface PaletteGroup {
  category: PaletteCategory;
  results: PaletteResult[];
}

/** Categories always render in this order. */
const CATEGORY_ORDER: PaletteCategory[] = ['Tabs', 'Components', 'Routes', 'Packages', 'Actions'];

/** Tabs reachable in the current context (Vite-only tabs are hidden in the extension). */
function getTabResults(state: DevtoolsState): PaletteResult[] {
  return devtoolsTabs
    .filter((tab) => !(state.isExtension && tab.viteOnly))
    .map((tab) => ({
      id: `tab:${tab.id}`,
      category: 'Tabs',
      label: tab.title,
      target: { kind: 'tab', tabId: tab.id },
    }));
}

function getComponentResults(state: DevtoolsState): PaletteResult[] {
  return state.components.map((component) => ({
    id: `component:${component.file || component.name}`,
    category: 'Components',
    label: component.name,
    hint: component.fileName,
    target: { kind: 'component', name: component.name },
  }));
}

/** Routes live behind the Vite-only Routes tab, so they are excluded in the extension. */
function getRouteResults(state: DevtoolsState): PaletteResult[] {
  if (state.isExtension || !state.routes) {
    return [];
  }
  return state.routes.map((route) => ({
    id: `route:${route.relativePath}`,
    category: 'Routes',
    label: route.relativePath === '' ? '/' : `/${route.relativePath}/`,
    hint: route.name,
    target: { kind: 'route', path: route.relativePath },
  }));
}

/** Packages live behind the Vite-only Packages tab, so they are excluded in the extension. */
function getPackageResults(state: DevtoolsState): PaletteResult[] {
  if (state.isExtension) {
    return [];
  }
  return state.npmPackages.map(([name, version]) => ({
    id: `package:${name}`,
    category: 'Packages',
    label: name,
    hint: version,
    target: { kind: 'package', name },
  }));
}

/** Common quick actions available in the current context. */
export function getActionResults(state: DevtoolsState): PaletteResult[] {
  const actions: PaletteResult[] = [
    {
      id: 'action:toggleTheme',
      category: 'Actions',
      label: 'Toggle theme',
      target: { kind: 'action', action: 'toggleTheme' },
    },
    {
      id: 'action:clearPerformance',
      category: 'Actions',
      label: 'Clear performance',
      target: { kind: 'action', action: 'clearPerformance' },
    },
    {
      id: 'action:clearRecents',
      category: 'Actions',
      label: 'Clear recent searches',
      target: { kind: 'action', action: 'clearRecents' },
    },
  ];
  if (!state.isExtension) {
    actions.push({
      id: 'action:customizeTabs',
      category: 'Actions',
      label: 'Customize tabs',
      target: { kind: 'action', action: 'customizeTabs' },
    });
  }
  return actions;
}

/** Every searchable result for the current context (tabs, components, routes, packages). */
export function buildPaletteSources(state: DevtoolsState): PaletteResult[] {
  return [
    ...getTabResults(state),
    ...getComponentResults(state),
    ...getRouteResults(state),
    ...getPackageResults(state),
  ];
}

/** Filters results by a substring match against label and hint; an empty query returns nothing. */
export function filterResults(results: PaletteResult[], query: string): PaletteResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return results.filter(
    (result) =>
      result.label.toLowerCase().includes(normalized) ||
      (result.hint?.toLowerCase().includes(normalized) ?? false)
  );
}

/** Groups results by category, preserving the fixed category order and dropping empty groups. */
export function groupResults(results: PaletteResult[]): PaletteGroup[] {
  const groups: PaletteGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCategory = results.filter((result) => result.category === category);
    if (inCategory.length > 0) {
      groups.push({ category, results: inCategory });
    }
  }
  return groups;
}

/** Reads the persisted recent-selection ids, newest first; empty when nothing valid is stored. */
export function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

/** Persists the recent-selection ids. Storage failures (private mode, quota) are ignored. */
export function saveRecentIds(ids: string[]): void {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures
  }
}

/** Returns a new list with `id` moved to the front, de-duped and capped at MAX_RECENTS. */
export function addRecentId(recentIds: string[], id: string): string[] {
  return [id, ...recentIds.filter((existing) => existing !== id)].slice(0, MAX_RECENTS);
}

/**
 * Resolves persisted recent ids to their current results, dropping entries that no longer exist
 * (e.g. a component that unmounted or a package that was removed). Actions are resolvable too.
 */
export function resolveRecents(recentIds: string[], state: DevtoolsState): PaletteResult[] {
  const byId = new Map<string, PaletteResult>();
  for (const result of [...buildPaletteSources(state), ...getActionResults(state)]) {
    byId.set(result.id, result);
  }
  const resolved: PaletteResult[] = [];
  for (const id of recentIds) {
    const result = byId.get(id);
    if (result) {
      resolved.push(result);
    }
  }
  return resolved;
}
