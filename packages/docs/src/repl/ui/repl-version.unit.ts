import { afterEach, describe, expect, it, vi } from 'vitest';

import { getReplVersion } from './repl-version';

describe('getReplVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses refreshed npm data during the same request', async () => {
    const storage = new Map<string, string>();
    const oldTimestamp = Date.now() - 1000 * 60 * 60 * 3;

    storage.set(
      'qwikNpmData',
      JSON.stringify({
        tags: { latest: '0.0.1', next: '0.0.2' },
        versions: ['0.0.1'],
        timestamp: oldTimestamp,
      })
    );

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({
            tags: { latest: '1.9.0', next: '2.0.0' },
            versions: ['1.9.0'],
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            versions: ['2.0.0'],
          }),
        })
    );

    const replVersion = await getReplVersion('2.0.0', false);

    expect(replVersion.version).toBe('2.0.0');
    expect(replVersion.versions).toContain('2.0.0');
    expect(JSON.parse(storage.get('qwikNpmData')!)).toMatchObject({
      versions: ['2.0.0', '1.9.0'],
    });
  });
});
