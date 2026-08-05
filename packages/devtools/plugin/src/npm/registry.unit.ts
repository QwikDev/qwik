import { describe, expect, test } from 'vitest';
import {
  DEFAULT_NPM_REGISTRY,
  buildPackageMetadataUrl,
  buildPackageSearchUrl,
  normalizeRegistryUrl,
  normalizeSearchResponse,
} from './registry';

describe('normalizeRegistryUrl', () => {
  test('falls back to npm registry and removes trailing slash', () => {
    expect(normalizeRegistryUrl()).toBe(DEFAULT_NPM_REGISTRY);
    expect(normalizeRegistryUrl('https://registry.npmjs.org/')).toBe(DEFAULT_NPM_REGISTRY);
  });
});

describe('registry URL builders', () => {
  test('encodes scoped package metadata URLs', () => {
    expect(buildPackageMetadataUrl(DEFAULT_NPM_REGISTRY, '@qwik.dev/core')).toBe(
      'https://registry.npmjs.org/%40qwik.dev%2Fcore'
    );
  });

  test('builds npm search URLs', () => {
    expect(buildPackageSearchUrl(DEFAULT_NPM_REGISTRY, 'qwik devtools', 10)).toBe(
      'https://registry.npmjs.org/-/v1/search?text=qwik+devtools&size=10'
    );
  });
});

describe('normalizeSearchResponse', () => {
  test('normalizes npm search objects and marks installed packages', () => {
    const response = {
      objects: [
        {
          package: {
            name: 'vite',
            version: '7.0.0',
            description: 'native tooling',
            publisher: { username: 'evan' },
          },
        },
      ],
    };
    const results = normalizeSearchResponse(response, new Map([['vite', '6.0.0']]));
    expect(results).toEqual([
      {
        name: 'vite',
        latestVersion: '7.0.0',
        description: 'native tooling',
        author: 'evan',
        npmUrl: 'https://www.npmjs.com/package/vite',
        isInstalled: true,
        installedVersion: '6.0.0',
      },
    ]);
  });
});
