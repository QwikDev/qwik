import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from './manifest';

const chunk = (fileName: string, exports: string[], code = 'x') => ({
  type: 'chunk' as const,
  fileName,
  name: fileName.replace(/\.js$/, ''),
  exports,
  imports: [],
  dynamicImports: [],
  modules: {},
  moduleIds: [],
  code,
});

describe('generateManifestFromBundles', () => {
  test('registers precompiled library segment exports in the mapping', () => {
    const bundles = {
      'lib-chunk.qwik.js': chunk('lib-chunk.qwik.js', [
        'link_component_$_segment_5_qpo41occhrtk',
        'link_component_q_e_click_segment_2_qpo6rw3qc5x9',
        'someLibraryUtility',
      ]),
      'app.js': chunk('app.js', ['App']),
    };
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      bundles as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p
    );

    // library segments arrive precompiled — their chunk exports are the mapping source
    expect(manifest.mapping['link_component_$_segment_5_qpo41occhrtk']).toBe('lib-chunk.qwik.js');
    expect(manifest.mapping['link_component_q_e_click_segment_2_qpo6rw3qc5x9']).toBe(
      'lib-chunk.qwik.js'
    );
    // non-segment exports never enter the mapping
    expect(manifest.mapping['someLibraryUtility']).toBeUndefined();
    expect(manifest.mapping['App']).toBeUndefined();
  });
});
