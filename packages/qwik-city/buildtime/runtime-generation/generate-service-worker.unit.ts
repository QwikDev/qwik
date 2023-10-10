import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import type { BuildContext, BuildRoute } from '../types';
import type { QwikManifest, InsightManifest } from '@builder.io/qwik/optimizer';
import type { AppBundle } from '../../runtime/src/service-worker/types';
import { generateLinkBundles } from './generate-service-worker';

const swSuite = suite('lint');

swSuite('incorporate qwik-insights', () => {
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
  equal(routeToBundles['/'], ['q-bundle-123.js', 'q-bundle-234.js', 'q-bundle-a.js']);
  equal(routeToBundles['/routeA'], ['q-bundle-345.js', 'q-bundle-b.js']);
});

swSuite.run();
