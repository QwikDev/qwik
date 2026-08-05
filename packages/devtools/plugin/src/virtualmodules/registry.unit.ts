import { PERF_VIRTUAL_MODULE_ID, VIRTUAL_QWIK_DEVTOOLS_KEY } from '@qwik.dev/devtools/kit';
import { describe, expect, test } from 'vitest';
import { getVirtualIdVariations, normalizeVirtualModuleId } from './ids';
import { createVirtualModuleRegistry } from './registry';

describe('virtual module ids', () => {
  test('normalizeVirtualModuleId strips query and hash', () => {
    expect(normalizeVirtualModuleId('virtual-qwik-devtools.ts?import#client')).toBe(
      'virtual-qwik-devtools.ts'
    );
  });

  test('getVirtualIdVariations preserves current variants', () => {
    expect(getVirtualIdVariations(VIRTUAL_QWIK_DEVTOOLS_KEY)).toEqual([
      VIRTUAL_QWIK_DEVTOOLS_KEY,
      `/${VIRTUAL_QWIK_DEVTOOLS_KEY}`,
      `\u0000${VIRTUAL_QWIK_DEVTOOLS_KEY}`,
      `/@id/${VIRTUAL_QWIK_DEVTOOLS_KEY}`,
    ]);
  });
});

describe('virtual module registry', () => {
  test('finds hook and perf modules by their request variations', () => {
    const registry = createVirtualModuleRegistry();

    expect(registry.find(VIRTUAL_QWIK_DEVTOOLS_KEY)?.id).toBe(VIRTUAL_QWIK_DEVTOOLS_KEY);
    expect(registry.find(`/@id/${PERF_VIRTUAL_MODULE_ID}`)?.id).toBe(PERF_VIRTUAL_MODULE_ID);
  });

  test('load returns source and an empty sourcemap', () => {
    const registry = createVirtualModuleRegistry();
    const result = registry.load(VIRTUAL_QWIK_DEVTOOLS_KEY);

    expect(result?.code).toContain('useCollectHooks');
    expect(result?.map).toEqual({ mappings: '' });
  });

  test('fails fast on duplicate virtual module ids', () => {
    expect(() =>
      createVirtualModuleRegistry([
        { name: 'hooks', virtualModules: [{ id: 'virtual:duplicate', load: () => '' }] },
        { name: 'perf', virtualModules: [{ id: 'virtual:duplicate', load: () => '' }] },
      ])
    ).toThrow('Duplicate virtual module id: virtual:duplicate');
  });
});
