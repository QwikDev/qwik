import type {
  InsightManifest,
  QwikBundle,
  QwikManifest,
  QwikSymbol,
} from '@builder.io/qwik/optimizer';
import { assert, expect, test } from 'vitest';
import type { AppBundle } from '../../runtime/src/service-worker/types';
import type { BuildContext, BuildRoute } from '../types';
import { generateAppBundles, generateLinkBundles } from './generate-service-worker';

test('incorporate qwik-insights', () => {
  const routes: BuildRoute[] = [
    {
      routeName: '/',
      pattern: /\//,
      filePath: './src/routes/index.tsx',
      layouts: [],
    } /* satisfies Partial<BuildRoute> */ as any,
    {
      routeName: '/routeA',
      pattern: /\/routeA/,
      filePath: './src/routes/routeA/index.tsx',
      layouts: [],
    } /* satisfies Partial<BuildRoute> */ as any,
  ];
  const ctx: BuildContext = { routes } /* satisfies Partial<BuildContext> */ as any;
  const appBundles: AppBundle[] = [
    ['q-bundle-a.js', [12]],
    ['q-bundle-b.js', [34]],
    ['q-bundle-123.js', [123]],
    ['q-bundle-234.js', [234]],
    ['q-bundle-345.js', [345]],
  ];
  const manifest: QwikManifest = {
    bundles: {
      'q-bundle-a.js': {
        origins: ['./src/routes/index.tsx'],
      } /* satisfies Partial<QwikManifest['bundles'][0]> */ as any,
      'q-bundle-b.js': {
        origins: ['./src/routes/routeA/index.tsx'],
      } /* satisfies Partial<QwikManifest['bundles'][0]> */ as any,
      'q-bundle-123.js': {
        symbols: ['s_123'],
      } /* satisfies Partial<QwikManifest['bundles'][0]> */ as any,
      'q-bundle-234.js': {
        symbols: ['s_234'],
      } /* satisfies Partial<QwikManifest['bundles'][0]> */ as any,
      'q-bundle-345.js': {
        symbols: ['s_345'],
      } /* satisfies Partial<QwikManifest['bundles'][0]> */ as any,
    },
  } /* satisfies Partial<QwikManifest> */ as any;
  const prefetch: InsightManifest['prefetch'] = [
    { route: '/', symbols: ['123', '234'] },
    { route: '/routeA', symbols: ['345'] },
  ];
  const [_, routeToBundles] = generateLinkBundles(ctx, appBundles, manifest, prefetch);
  assert.deepEqual(routeToBundles['/'], ['q-bundle-123.js', 'q-bundle-234.js', 'q-bundle-a.js']);
  assert.deepEqual(routeToBundles['/routeA'], ['q-bundle-345.js', 'q-bundle-b.js']);
});

test('generateAppBundles', () => {
  const fakeManifest = {
    symbols: {
      s_aaa123: { hash: 'aaa123' } as QwikSymbol,
      s_bbb123: { hash: 'bbb123' } as QwikSymbol,
      s_ccc123: { hash: 'ccc123' } as QwikSymbol,
      s_ddd123: { hash: 'ddd123' } as QwikSymbol,
      s_eee123: { hash: 'eee123' } as QwikSymbol,
    } as Record<string, QwikSymbol>,
    bundles: {
      'a.js': {
        size: 0,
        imports: ['b.js', 'c.js'],
        symbols: ['s_aaa123'],
      },
      'b.js': {
        size: 0,
        imports: ['c.js', 'd.js'],
        dynamicImports: ['e.js'],
        symbols: ['s_bbb123'],
      },
      'c.js': {
        size: 0,
        imports: ['d.js'],
        symbols: ['s_ccc123'],
      },
      'd.js': {
        size: 0,
        imports: [],
        symbols: ['s_ddd123'],
      },
      'e.js': {
        size: 0,
        imports: [],
        symbols: ['s_eee123'],
      },
    } as Record<string, QwikBundle>,
  } as QwikManifest;

  const actualAppBundles = generateAppBundles([], fakeManifest);

  const expectedAppBundles = [
    ['a.js', [1], ['aaa123']],
    ['b.js', [2], ['bbb123']],
    ['c.js', [3], ['ccc123']],
    ['d.js', [], ['ddd123']],
    ['e.js', [], ['eee123']],
  ];
  const expectedResult = `const appBundles=${JSON.stringify(expectedAppBundles)};`;

  expect(actualAppBundles).toEqual(expectedResult);
});
