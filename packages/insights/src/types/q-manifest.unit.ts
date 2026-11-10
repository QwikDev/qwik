import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { describe, expect, test } from 'vitest';
import { QManifest } from './q-manifest';

const manifest = {
  version: '1',
  manifestHash: 'manifest-hash',
  options: { target: 'client', entryStrategy: { type: 'smart' } },
  injections: [],
  mapping: { App_component_abc123: 'build/app.js' },
  bundles: { 'build/app.js': { size: 100, total: 100, imports: [], origins: ['src/root.tsx'] } },
  symbols: {
    App_component_abc123: {
      origin: 'src/root.tsx',
      displayName: 'App_component',
      canonicalFilename: 'root.tsx',
      hash: 'abc123',
      ctxKind: 'function',
      ctxName: 'component$',
      captures: false,
      parent: null,
      loc: [0, 100],
    },
  },
  platform: { vite: '', rollup: '4.23.0', env: 'node', os: 'linux', node: '22.18.0' },
} satisfies QwikManifest;

describe('Insights manifest ingestion', () => {
  test('accepts a Qwik v2 manifest without framework version metadata', () => {
    expect(QManifest.parse(manifest)).toMatchObject({
      manifestHash: manifest.manifestHash,
      mapping: manifest.mapping,
      platform: manifest.platform,
      symbols: { App_component_abc123: { hash: 'abc123' } },
    });
  });

  test('preserves framework version metadata from Qwik v1 manifests', () => {
    const legacyManifest = {
      ...manifest,
      platform: { ...manifest.platform, qwik: '1.19.0', vite: '6.3.5' },
    };

    expect(QManifest.parse(legacyManifest).platform).toEqual(legacyManifest.platform);
  });

  test('rejects framework version metadata with the wrong type', () => {
    expect(
      QManifest.safeParse({
        ...manifest,
        platform: { ...manifest.platform, qwik: 2 },
      })
    ).toMatchObject({
      success: false,
      error: { issues: [{ path: ['platform', 'qwik'] }] },
    });
  });

  test('rejects invalid symbol metadata in a Qwik v2 manifest', () => {
    expect(
      QManifest.safeParse({
        ...manifest,
        symbols: {
          App_component_abc123: { ...manifest.symbols.App_component_abc123, loc: ['invalid'] },
        },
      })
    ).toMatchObject({
      success: false,
      error: { issues: [{ path: ['symbols', 'App_component_abc123', 'loc', 0] }] },
    });
  });
});
