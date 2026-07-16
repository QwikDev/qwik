import { describe, expect, it } from 'vitest';
import { viteAdapter } from './index';

describe('viteAdapter ssg environment', () => {
  it('drops the inherited deploy entry input from the ssg environment only', () => {
    const [plugin] = viteAdapter({ name: 'test', origin: 'https://example.com' }) as any[];

    // Vite shares inherited option objects by reference with the top-level (ssr) config.
    const sharedRollupOptions = { input: ['src/entry.express.tsx'] };
    const ssgOptions = { build: { rollupOptions: sharedRollupOptions } };
    plugin.configEnvironment('ssg', ssgOptions);
    expect(ssgOptions.build.rollupOptions.input).toEqual({});
    expect(sharedRollupOptions.input).toEqual(['src/entry.express.tsx']);

    const ssrOptions = { build: { rollupOptions: { input: ['src/entry.express.tsx'] } } };
    plugin.configEnvironment('ssr', ssrOptions);
    expect(ssrOptions.build.rollupOptions.input).toEqual(['src/entry.express.tsx']);
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
});
