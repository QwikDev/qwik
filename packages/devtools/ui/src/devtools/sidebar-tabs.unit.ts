import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getAvailableTabIds,
  getDefaultVisibleTabIds,
  getVisibleTabs,
  loadVisibleTabIds,
  reorderVisibleTabs,
  saveVisibleTabIds,
  setTabVisible,
} from './sidebar-tabs';
import { devtoolsTabs } from './tabs';

const registryIds = devtoolsTabs.map((tab) => tab.id);
const firstViteOnly = devtoolsTabs.find((tab) => tab.viteOnly)!;

describe('sidebar tabs model', () => {
  test('default visible tabs are every registry tab in order', () => {
    expect(getDefaultVisibleTabIds()).toEqual(registryIds);
  });

  test('getDefaultVisibleTabIds returns a fresh array each call', () => {
    const first = getDefaultVisibleTabIds();
    first.pop();
    expect(getDefaultVisibleTabIds()).toHaveLength(registryIds.length);
  });

  test('getVisibleTabs resolves ids to configs, preserving the given order', () => {
    const tabs = getVisibleTabs(['performance', 'overview'], false);
    expect(tabs.map((tab) => tab.id)).toEqual(['performance', 'overview']);
  });

  test('getVisibleTabs keeps vite-only tabs in the overlay but drops them in the extension', () => {
    expect(getVisibleTabs([firstViteOnly.id], false).map((tab) => tab.id)).toEqual([
      firstViteOnly.id,
    ]);
    expect(getVisibleTabs([firstViteOnly.id], true)).toEqual([]);
  });

  test('available tabs are the registry minus the visible ones, in registry order', () => {
    expect(getAvailableTabIds(['performance', 'overview'])).toEqual(
      registryIds.filter((id) => id !== 'performance' && id !== 'overview')
    );
    expect(getAvailableTabIds(getDefaultVisibleTabIds())).toEqual([]);
  });

  test('setTabVisible removes, appends, and is a no-op for an already-visible tab', () => {
    expect(setTabVisible(['overview', 'performance'], 'overview', false)).toEqual(['performance']);
    expect(setTabVisible(['overview'], 'performance', true)).toEqual(['overview', 'performance']);
    expect(setTabVisible(['overview'], 'overview', true)).toEqual(['overview']);
  });

  test('reorderVisibleTabs moves a tab before the target, in both directions', () => {
    expect(
      reorderVisibleTabs(['overview', 'performance', 'preloads'], 'preloads', 'overview')
    ).toEqual(['preloads', 'overview', 'performance']);
    expect(
      reorderVisibleTabs(['overview', 'performance', 'preloads'], 'overview', 'preloads')
    ).toEqual(['performance', 'overview', 'preloads']);
  });

  test('reorderVisibleTabs is a no-op for the same tab or a target not in the list', () => {
    expect(reorderVisibleTabs(['overview', 'performance'], 'overview', 'overview')).toEqual([
      'overview',
      'performance',
    ]);
    expect(reorderVisibleTabs(['overview', 'performance'], 'overview', 'routes')).toEqual([
      'overview',
      'performance',
    ]);
  });
});

describe('visible tabs persistence', () => {
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

  test('save then load round-trips the visible list', () => {
    saveVisibleTabIds(['performance', 'overview']);
    expect(loadVisibleTabIds()).toEqual(['performance', 'overview']);
  });

  test('load returns null when nothing is stored', () => {
    expect(loadVisibleTabIds()).toBeNull();
  });

  test('load honors a persisted empty list (user hid every tab)', () => {
    saveVisibleTabIds([]);
    expect(loadVisibleTabIds()).toEqual([]);
  });

  test('load returns null for malformed json', () => {
    localStorage.setItem('qwik-devtools:visible-tabs', '{not json');
    expect(loadVisibleTabIds()).toBeNull();
  });

  test('load normalizes stored ids, dropping unknown and duplicate entries', () => {
    localStorage.setItem(
      'qwik-devtools:visible-tabs',
      JSON.stringify(['overview', 'ghost', 7, 'performance', 'overview'])
    );
    expect(loadVisibleTabIds()).toEqual(['overview', 'performance']);
  });
});
