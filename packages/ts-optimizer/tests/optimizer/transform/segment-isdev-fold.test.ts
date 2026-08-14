import { it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const segmentCodes = (mode: 'dev' | 'prod') =>
  transformModule({
    input: [
      {
        path: mkFilePath('test.tsx'),
        code: mkSourceText(`
import { component$, useTask$, isDev } from '@qwik.dev/core';
export const Cmp = component$(() => {
  useTask$(() => {
    if (isDev) {
      console.log('dev only');
    } else {
      console.log('prod only');
    }
  });
  return <div>hi</div>;
});
`),
      },
    ],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    mode,
    isServer: false,
  })
    .modules.filter((m) => m.kind === 'segment')
    .map((m) => m.code)
    .join('\n');

it('folds isDev inside generated segments in prod mode', () => {
  const out = segmentCodes('prod');
  expect(out).toContain('prod only');
  expect(out).not.toContain('dev only');
  expect(out).not.toContain('isDev');
});

it('folds isDev inside generated segments in dev mode', () => {
  const out = segmentCodes('dev');
  expect(out).toContain('dev only');
  expect(out).not.toContain('prod only');
});

it('never rewrites an exported const that is only referenced externally', () => {
  // The side-effect simplification once turned `export const x = call()`
  // into `export call();` when nothing in-module referenced x.
  const out = transformModule({
    input: [
      {
        path: mkFilePath('route-loaders.ts'),
        code: mkSourceText(`
import { implicit$FirstArg } from '@qwik.dev/core';
export const useSomething = () => 1;
function routeLoaderQrl(qrl: unknown) {
  return qrl;
}
export const routeLoader$ = implicit$FirstArg(routeLoaderQrl);
`),
      },
    ],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    mode: 'dev',
    isServer: true,
  }).modules[0]!.code;
  expect(out).toContain('export const routeLoader$');
  expect(out).not.toMatch(/export\s+implicit\$FirstArg/);
});
