import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createQwikPlugin } from './plugin';

/**
 * Regression test for BUG S5: enabling the experimental `errorBoundary` feature without its
 * build-time prerequisite `suspense` used to silently degrade to the synchronous in-place
 * ErrorBoundary fallback with no diagnostic. `normalizeOptions` should now warn once per build for
 * that misconfiguration, while staying quiet when the prerequisite is present or when
 * `errorBoundary` is not enabled at all.
 */

async function mockPlugin() {
  const plugin = createQwikPlugin({
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (p: string) => import(p),
      strictDynamicImport: async (p: string) => import(p),
      path: path as any,
    },
    binding: { mockBinding: true },
  } as any);
  await plugin.init();
  return plugin;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('warns when errorBoundary is enabled without suspense', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const plugin = await mockPlugin();

  await plugin.normalizeOptions({ experimental: ['errorBoundary'] });

  expect(warn).toHaveBeenCalledTimes(1);
  const message = String(warn.mock.calls[0]?.[0] ?? '');
  expect(message).toContain('errorBoundary');
  expect(message).toContain('suspense');
});

test('does not warn when both errorBoundary and suspense are enabled', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const plugin = await mockPlugin();

  await plugin.normalizeOptions({ experimental: ['errorBoundary', 'suspense'] });

  expect(warn).not.toHaveBeenCalled();
});

test('does not warn when errorBoundary is not enabled', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const plugin = await mockPlugin();

  await plugin.normalizeOptions({ experimental: ['suspense'] });

  expect(warn).not.toHaveBeenCalled();
});
