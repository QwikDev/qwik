import { describe, expect, test } from 'vitest';
import type { QwikPreloadStoreRemembered } from '@qwik.dev/devtools/kit';
import {
  computePreloadViewModel,
  createDefaultPreloadFilters,
  filterPreloadRows,
} from './computePreloadViewModel';

function makeStore(): QwikPreloadStoreRemembered {
  return {
    entries: [
      {
        id: 1,
        href: 'http://localhost/build/entry.js',
        normalizedHref: 'http://localhost/build/entry.js',
        rel: 'modulepreload',
        as: 'script',
        resourceType: 'script',
        status: 'loaded',
        source: 'initial-dom',
        originKind: 'current-project',
        phase: 'csr',
        discoveredAt: 5,
        requestedAt: 10,
        completedAt: 40,
        importDuration: 30,
        loadDuration: 33,
        duration: 30,
        matchedBy: 'normalized-href',
        qrlRequestedAt: 7,
        qrlToLoadDuration: 33,
        loadMatchQuality: 'best-effort',
        qrlSymbol: 's_entry',
      },
      {
        id: 2,
        href: 'http://localhost/node_modules/pkg/index.js',
        normalizedHref: 'http://localhost/node_modules/pkg/index.js',
        rel: 'preload',
        as: 'script',
        resourceType: 'script',
        status: 'pending',
        source: 'mutation',
        originKind: 'node_modules',
        phase: 'csr',
        discoveredAt: 12,
        matchedBy: 'none',
      },
      {
        id: 3,
        href: 'http://localhost/@qwik.dev/devtools/ui/devtools.js',
        normalizedHref: 'http://localhost/@qwik.dev/devtools/ui/devtools.js',
        rel: 'modulepreload',
        as: 'script',
        resourceType: 'script',
        status: 'loaded',
        source: 'performance',
        originKind: 'vite-plugin-injected',
        phase: 'csr',
        discoveredAt: 14,
        requestedAt: 16,
        completedAt: 19,
        importDuration: 3,
        duration: 3,
        loadMatchQuality: 'none',
        matchedBy: 'none',
      },
      {
        id: 4,
        href: 'http://localhost/@id/virtual:qrl',
        normalizedHref: 'http://localhost/@id/virtual:qrl',
        rel: 'prefetch',
        as: 'script',
        resourceType: 'script',
        status: 'error',
        source: 'qrl-correlation',
        originKind: 'virtual-module',
        phase: 'ssr',
        discoveredAt: 50,
        requestedAt: 52,
        completedAt: 60,
        loadDuration: 8,
        loadMatchQuality: 'best-effort',
        matchedBy: 'none',
        error: 'network',
      },
    ],
    qrlRequests: [],
    startedAt: 0,
    clear: () => undefined,
    _id: 4,
    _initialized: true,
    _byHref: {},
    _byId: {},
  };
}

describe('computePreloadViewModel', () => {
  test('defaults to current project only and keeps source counts for the hidden rows', () => {
    const vm = computePreloadViewModel(makeStore(), createDefaultPreloadFilters());

    expect(vm.overview).toMatchObject({
      total: 1,
      loaded: 1,
      pending: 0,
      error: 0,
      correlated: 1,
      csr: 1,
      ssr: 0,
    });
    expect(vm.overview.avgImportDuration).toBeCloseTo(30);
    expect(vm.overview.maxImportDuration).toBe(30);
    expect(vm.overview.avgLoadDuration).toBeCloseTo(33);
    expect(vm.overview.maxLoadDuration).toBe(33);
    expect(vm.rows.map((row) => row.id)).toEqual([1]);
    expect(vm.sourceCounts).toMatchObject({
      'current-project': 1,
      'vite-plugin-injected': 1,
      node_modules: 1,
      'virtual-module': 1,
    });
    expect(vm.phaseCounts).toMatchObject({
      csr: 3,
      ssr: 1,
    });
  });

  test('includes non-project and SSR rows when the filters are enabled', () => {
    const vm = computePreloadViewModel(makeStore(), {
      sourceFilters: {
        vitePluginInjected: true,
        nodeModules: true,
        virtualModule: true,
        generated: false,
        external: false,
        unknown: false,
      },
      phaseFilters: {
        csr: true,
        ssr: true,
      },
    });

    expect(vm.overview.total).toBe(4);
    expect(vm.rows.map((row) => row.id)).toEqual([4, 1, 3, 2]);
    expect(vm.rows.find((row) => row.id === 4)?.phase).toBe('ssr');
    expect(vm.rows.find((row) => row.id === 1)?.loadMatchQuality).toBe('best-effort');
  });

  test('filters rows for correlated and unmatched items', () => {
    const vm = computePreloadViewModel(makeStore(), {
      sourceFilters: {
        vitePluginInjected: true,
        nodeModules: true,
        virtualModule: true,
        generated: false,
        external: false,
        unknown: false,
      },
      phaseFilters: {
        csr: true,
        ssr: true,
      },
    });

    expect(filterPreloadRows(vm.rows, 'qrl-correlated').map((row) => row.id)).toEqual([1]);
    expect(filterPreloadRows(vm.rows, 'unmatched').map((row) => row.id)).toEqual([4, 3, 2]);
  });
});
