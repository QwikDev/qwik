import { describe, expect, it } from 'vitest';
import { viteAdapter } from './index';

describe('viteAdapter ssg environment', () => {
  it('drops the inherited deploy entry input from the ssg environment only', () => {
    const [plugin] = viteAdapter({ name: 'test', origin: 'https://example.com' }) as any[];

    // Vite shares inherited option objects by reference with the top-level (ssr) config.
    const sharedRolldownOptions = { input: ['src/entry.express.tsx'] };
    const ssgOptions = { build: { rolldownOptions: sharedRolldownOptions } };
    plugin.configEnvironment('ssg', ssgOptions);
    expect(ssgOptions.build.rolldownOptions.input).toEqual({});
    expect(sharedRolldownOptions.input).toEqual(['src/entry.express.tsx']);

    const ssrOptions = { build: { rolldownOptions: { input: ['src/entry.express.tsx'] } } };
    plugin.configEnvironment('ssr', ssrOptions);
    expect(ssrOptions.build.rolldownOptions.input).toEqual(['src/entry.express.tsx']);
  });

  it('builds the throwaway ssg output without minify or sourcemaps', () => {
    const [plugin] = viteAdapter({ name: 'test', origin: 'https://example.com' }) as any[];
    const config = plugin.config({ root: '/app' });
    expect(config.builder).toBeDefined();
    expect(config.environments.ssg.build).toMatchObject({ minify: false, sourcemap: false });
  });

  it('skips the ssg environment when ssg is disabled but keeps the app build', () => {
    const [plugin] = viteAdapter({
      name: 'test',
      origin: 'https://example.com',
      ssg: null,
    }) as any[];
    const config = plugin.config({ root: '/app' });
    expect(config.environments?.ssg).toBeUndefined();
    // buildApp must still run so postBuild and the adapter generate() produce the deploy output.
    expect(config.builder).toBeDefined();
  });

  it('keeps ssg.maxWorkers when the top-level maxWorkers is not set', () => {
    const [plugin] = viteAdapter({
      name: 'test',
      origin: 'https://example.com',
      ssg: { include: ['/*'], maxWorkers: 1 },
    }) as any[];
    plugin.configResolved({
      command: 'build',
      plugins: [
        { name: 'vite-plugin-qwik-router', api: { getBasePathname: () => '/' } },
        {
          name: 'vite-plugin-qwik',
          api: { getClientPublicOutDir: () => '/app/dist', getRootDir: () => '/app' },
        },
      ],
    });
    const runSsgSource: string = plugin.load.call({ warn() {} }, '\0@qwik-ssg-entry');
    expect(runSsgSource).toContain('"maxWorkers":1');
  });
});
