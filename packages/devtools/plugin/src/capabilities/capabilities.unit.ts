import { describe, expect, test } from 'vitest';
import { getDevtoolsCapabilities } from './index';

describe('devtools capabilities registry', () => {
  test('returns capabilities in registration order', () => {
    expect(getDevtoolsCapabilities().map((capability) => capability.name)).toEqual([
      'hooks',
      'perf',
      'vnode',
    ]);
  });

  test('keeps virtual module ids unique across capabilities', () => {
    const virtualModuleIds = getDevtoolsCapabilities().flatMap((capability) =>
      (capability.virtualModules ?? []).map((virtualModule) => virtualModule.id)
    );

    expect(new Set(virtualModuleIds).size).toBe(virtualModuleIds.length);
  });

  test('keeps capabilities focused on virtual module registration', () => {
    for (const capability of getDevtoolsCapabilities()) {
      expect(Object.keys(capability).sort()).toEqual(['name', 'virtualModules']);
    }
  });
});
