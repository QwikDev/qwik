import { describe, expect, test } from 'vitest';
import type { DependencyInfo, PackageSearchResult } from './types';
import {
  filterInstalledDependencies,
  getDependencyStatusClass,
  getDependencyStatusLabel,
  getOperationMessage,
  markInstalledSearchResults,
  mergeDependencyRefresh,
} from './package-utils';

const dependencies: DependencyInfo[] = [
  {
    name: 'vite',
    requestedVersion: '^7.0.0',
    currentVersion: '7.0.0',
    latestVersion: '7.0.0',
    type: 'devDependencies',
    status: 'latest',
    description: 'native tooling',
    npmUrl: 'https://www.npmjs.com/package/vite',
  },
  {
    name: '@qwik.dev/core',
    requestedVersion: 'workspace:*',
    currentVersion: '2.0.0',
    latestVersion: '2.0.1',
    type: 'dependencies',
    status: 'outdated',
    description: 'core',
    npmUrl: 'https://www.npmjs.com/package/@qwik.dev/core',
  },
];

describe('filterInstalledDependencies', () => {
  test('filters by package name without mutating source data', () => {
    const result = filterInstalledDependencies(dependencies, 'QWIK');
    expect(result.map((dependency) => dependency.name)).toEqual(['@qwik.dev/core']);
    expect(dependencies).toHaveLength(2);
  });
});

describe('markInstalledSearchResults', () => {
  test('marks external results that are already installed', () => {
    const results: PackageSearchResult[] = [
      {
        name: 'vite',
        latestVersion: '7.0.0',
        description: 'native tooling',
        npmUrl: 'https://www.npmjs.com/package/vite',
        isInstalled: false,
      },
    ];

    expect(markInstalledSearchResults(results, dependencies)).toEqual([
      {
        ...results[0],
        isInstalled: true,
        installedVersion: '7.0.0',
      },
    ]);
  });
});

describe('getDependencyStatusLabel', () => {
  test('maps version status to labels', () => {
    expect(getDependencyStatusLabel('latest')).toBe('Latest');
    expect(getDependencyStatusLabel('outdated')).toBe('Update available');
    expect(getDependencyStatusLabel('unknown')).toBe('Unknown');
    expect(getDependencyStatusLabel('error')).toBe('Error');
  });
});

describe('getDependencyStatusClass', () => {
  test('uses readable foreground colors for status badges on light backgrounds', () => {
    expect(getDependencyStatusClass('latest')).toContain('text-emerald-700');
    expect(getDependencyStatusClass('outdated')).toContain('text-amber-700');
  });
});

describe('mergeDependencyRefresh', () => {
  test('keeps known latest versions when a local-only refresh has not been enriched yet', () => {
    const refreshed: DependencyInfo[] = [
      {
        ...dependencies[0],
        latestVersion: undefined,
        status: 'unknown',
      },
      {
        ...dependencies[1],
        currentVersion: '2.0.1',
        latestVersion: undefined,
        status: 'unknown',
      },
    ];

    expect(mergeDependencyRefresh(dependencies, refreshed)).toEqual([
      dependencies[0],
      {
        ...refreshed[1],
        latestVersion: '2.0.1',
        status: 'latest',
      },
    ]);
  });
});

describe('getOperationMessage', () => {
  test('formats operation feedback messages', () => {
    expect(getOperationMessage('install', 'vite', true)).toBe('Installed vite');
    expect(getOperationMessage('update', 'vite', false, 'network failed')).toBe(
      'Failed to update vite: network failed'
    );
  });
});
