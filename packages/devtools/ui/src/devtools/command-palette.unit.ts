import { noSerialize } from '@qwik.dev/core';
import type { Component, NpmInfo, RoutesInfo } from '@qwik.dev/devtools/kit';
import { Type } from 'dree';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  addRecentId,
  buildPaletteSources,
  filterResults,
  getActionResults,
  groupResults,
  loadRecentIds,
  resolveRecents,
  saveRecentIds,
} from './command-palette';
import { createDevtoolsState, type DevtoolsState } from './state';

const components: Component[] = [
  { name: 'Header', fileName: 'header.tsx', file: '/src/header.tsx' },
  { name: 'Footer', fileName: 'footer.tsx', file: '/src/footer.tsx' },
];

const npmPackages: NpmInfo = [
  ['@qwik.dev/core', '2.0.0'],
  ['vite', '7.3.1'],
];

function makeRoute(relativePath: string, name: string): RoutesInfo {
  return {
    name,
    path: `/abs/${relativePath}`,
    relativePath,
    type: Type.FILE,
    isSymbolicLink: false,
  };
}

const routes = [makeRoute('', 'root'), makeRoute('about', 'about')];

function makeState(overrides?: { isExtension?: boolean }): DevtoolsState {
  const state = createDevtoolsState({ isExtension: overrides?.isExtension });
  state.components = components;
  state.npmPackages = npmPackages;
  state.routes = noSerialize(routes);
  return state;
}

describe('command palette sources', () => {
  test('overlay sources include tabs, components, routes, and packages', () => {
    const categories = new Set(buildPaletteSources(makeState()).map((result) => result.category));
    expect(categories).toEqual(new Set(['Tabs', 'Components', 'Routes', 'Packages']));
  });

  test('extension excludes vite-only tabs, routes, and packages', () => {
    const sources = buildPaletteSources(makeState({ isExtension: true }));
    const categories = new Set(sources.map((result) => result.category));
    expect(categories.has('Routes')).toBe(false);
    expect(categories.has('Packages')).toBe(false);
    // Vite-only tabs (e.g. Packages, Routes) are gone; non-vite tabs remain.
    const tabIds = sources.filter((r) => r.category === 'Tabs').map((r) => r.id);
    expect(tabIds).toContain('tab:overview');
    expect(tabIds).not.toContain('tab:routes');
  });

  test('components are available in the extension (the tree exists in both contexts)', () => {
    const sources = buildPaletteSources(makeState({ isExtension: true }));
    expect(sources.filter((r) => r.category === 'Components').map((r) => r.label)).toEqual([
      'Header',
      'Footer',
    ]);
  });

  test('customize-tabs action is overlay-only', () => {
    expect(getActionResults(makeState()).map((r) => r.target)).toContainEqual({
      kind: 'action',
      action: 'customizeTabs',
    });
    expect(getActionResults(makeState({ isExtension: true })).map((r) => r.id)).not.toContain(
      'action:customizeTabs'
    );
  });
});

describe('command palette filtering', () => {
  test('filters by label and hint, case-insensitively', () => {
    const sources = buildPaletteSources(makeState());
    expect(filterResults(sources, 'head').map((r) => r.label)).toEqual(['Header']);
    // "core" only appears in the package label; "7.3.1" only in a package hint (version).
    expect(filterResults(sources, 'core').map((r) => r.label)).toEqual(['@qwik.dev/core']);
    expect(filterResults(sources, '7.3.1').map((r) => r.label)).toEqual(['vite']);
  });

  test('an empty query returns nothing (the empty state shows recents and actions instead)', () => {
    expect(filterResults(buildPaletteSources(makeState()), '   ')).toEqual([]);
  });

  test('groups keep the canonical category order and drop empty categories', () => {
    const groups = groupResults(filterResults(buildPaletteSources(makeState()), 'e'));
    const canonical = ['Tabs', 'Components', 'Routes', 'Packages', 'Actions'];
    const order = groups.map((group) => group.category);
    expect(order).toEqual(canonical.filter((category) => order.includes(category)));
    expect(groups.every((group) => group.results.length > 0)).toBe(true);
  });
});

describe('command palette recents', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  test('load returns an empty list when nothing or malformed is stored', () => {
    expect(loadRecentIds()).toEqual([]);
    localStorage.setItem('qwik-devtools:palette-recents', '{not json');
    expect(loadRecentIds()).toEqual([]);
  });

  test('save then load round-trips the ids', () => {
    saveRecentIds(['tab:overview', 'component:/src/header.tsx']);
    expect(loadRecentIds()).toEqual(['tab:overview', 'component:/src/header.tsx']);
  });

  test('addRecentId moves to front, de-dupes, and caps at five', () => {
    let ids: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      ids = addRecentId(ids, id);
    }
    expect(ids).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(addRecentId(ids, 'e')).toEqual(['e', 'f', 'd', 'c', 'b']);
  });

  test('resolveRecents keeps existing results in order and drops stale ids', () => {
    const resolved = resolveRecents(
      ['tab:overview', 'component:/src/ghost.tsx', 'action:toggleTheme'],
      makeState()
    );
    expect(resolved.map((result) => result.id)).toEqual(['tab:overview', 'action:toggleTheme']);
  });
});
