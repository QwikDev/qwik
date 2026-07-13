import { describe, expect, test } from 'vitest';
import { getDefaultVisibleTabIds, getVisibleTabs } from './sidebar-tabs';
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

  test('getVisibleTabs keeps vite-only tabs in the overlay', () => {
    const tabs = getVisibleTabs([firstViteOnly.id], false);
    expect(tabs.map((tab) => tab.id)).toEqual([firstViteOnly.id]);
  });

  test('getVisibleTabs drops vite-only tabs in the extension', () => {
    expect(getVisibleTabs([firstViteOnly.id], true)).toEqual([]);
  });
});
