import { describe, expect, it, vi } from 'vitest';
import { viteAdapter } from './index';

vi.mock('./post-build', () => ({ postBuild: vi.fn() }));

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

describe('viteAdapter app build', () => {
  const resolvedConfig = {
    command: 'build',
    plugins: [
      {
        name: 'vite-plugin-qwik-router',
        api: { getBasePathname: () => '/', getRoutes: () => [] },
      },
      {
        name: 'vite-plugin-qwik',
        api: { getClientOutDir: () => '/app/dist', getClientPublicOutDir: () => '/app/dist' },
      },
    ],
  };
  const ssrBundles = {
    'entry.azure-swa.js': { type: 'chunk', isEntry: true },
    'q-chunk.js': { type: 'chunk', isEntry: false },
  };
  const ssrConfig = { root: '/app', build: { outDir: '/app/server' } };

  it.each(['/app/server', 'server'])(
    'hands the ssr entries across plugin instances with server output %s',
    async (outDir) => {
      const generate = vi.fn();
      const opts = { name: 'test', origin: 'https://example.com', generate };
      // Vite resolves the config again for each environment, so the `ssr` build uses another
      // instance of the plugin than the one `buildApp` runs on.
      const [topLevelPlugin] = viteAdapter(opts) as any[];
      const [ssrPlugin] = viteAdapter(opts) as any[];
      topLevelPlugin.configResolved(resolvedConfig);
      ssrPlugin.configResolved(resolvedConfig);

      const warn = vi.fn();
      const ssr = { config: { ...ssrConfig, build: { outDir } } };
      await topLevelPlugin.buildApp({
        environments: { ssr },
        config: { root: '/app', define: {}, logger: { warn() {} } },
        build: async () => {
          ssrPlugin.generateBundle.call(
            { environment: { name: 'ssr', config: ssrConfig }, warn },
            {},
            ssrBundles
          );
        },
      });

      expect(warn).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ outputEntries: ['entry.azure-swa.js'] })
      );
    }
  );

  it('keeps parallel builds of one root with different server outputs apart', async () => {
    const firstGenerate = vi.fn();
    const secondGenerate = vi.fn();
    const opts = { name: 'test', origin: 'https://example.com', ssg: null };
    const [firstPlugin] = viteAdapter({ ...opts, generate: firstGenerate }) as any[];
    const [secondPlugin] = viteAdapter({ ...opts, generate: secondGenerate }) as any[];
    const [firstSsrPlugin] = viteAdapter(opts) as any[];
    const [secondSsrPlugin] = viteAdapter(opts) as any[];
    for (const plugin of [firstPlugin, secondPlugin, firstSsrPlugin, secondSsrPlugin]) {
      plugin.configResolved(resolvedConfig);
    }

    const config = { root: '/app', define: {}, logger: { warn() {} } };
    const firstSsr = { config: { root: '/app', build: { outDir: '/app/server-first' } } };
    const secondSsr = { config: { root: '/app', build: { outDir: '/app/server-second' } } };
    let finishFirstBuild!: () => void;
    const firstBuild = firstPlugin.buildApp({
      environments: { ssr: firstSsr },
      config,
      build: () =>
        new Promise<void>((resolve) => {
          finishFirstBuild = resolve;
        }),
    });

    await secondPlugin.buildApp({
      environments: { ssr: secondSsr },
      config,
      build: async () => {
        firstSsrPlugin.generateBundle.call(
          { environment: { name: 'ssr', config: firstSsr.config }, warn: vi.fn() },
          {},
          ssrBundles
        );
        finishFirstBuild();
        await firstBuild;
        secondSsrPlugin.generateBundle.call(
          { environment: { name: 'ssr', config: secondSsr.config }, warn: vi.fn() },
          {},
          { 'entry.second.js': { type: 'chunk', isEntry: true } }
        );
      },
    });

    expect(firstGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ outputEntries: ['entry.azure-swa.js'] })
    );
    expect(secondGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ outputEntries: ['entry.second.js'] })
    );
  });

  it('rejects an overlapping build without disturbing the first build and allows retry', async () => {
    const firstGenerate = vi.fn();
    const secondGenerate = vi.fn();
    const opts = { name: 'test', origin: 'https://example.com', ssg: null };
    const [firstPlugin] = viteAdapter({ ...opts, generate: firstGenerate }) as any[];
    const [secondPlugin] = viteAdapter({ ...opts, generate: secondGenerate }) as any[];
    const [ssrPlugin] = viteAdapter(opts) as any[];
    for (const plugin of [firstPlugin, secondPlugin, ssrPlugin]) {
      plugin.configResolved(resolvedConfig);
    }

    const config = { root: '/app', define: {}, logger: { warn() {} } };
    const firstSsr = { name: 'ssr', config: ssrConfig };
    const secondSsr = {
      name: 'ssr',
      config: { ...ssrConfig, build: { outDir: 'server' } },
    };
    let finishFirstBuild!: () => void;
    const firstBuild = firstPlugin.buildApp({
      environments: { ssr: firstSsr },
      config,
      build: () =>
        new Promise<void>((resolve) => {
          finishFirstBuild = resolve;
        }),
    });
    const conflictingBuild = vi.fn();
    try {
      await expect(
        secondPlugin.buildApp({
          environments: { ssr: secondSsr },
          config,
          build: conflictingBuild,
        })
      ).rejects.toThrow('already running');
      expect(conflictingBuild).not.toHaveBeenCalled();
      expect(secondGenerate).not.toHaveBeenCalled();
      ssrPlugin.generateBundle.call({ environment: firstSsr, warn: vi.fn() }, {}, ssrBundles);
    } finally {
      finishFirstBuild();
      await firstBuild;
    }

    expect(firstGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ outputEntries: ['entry.azure-swa.js'] })
    );
    await secondPlugin.buildApp({
      environments: { ssr: secondSsr },
      config,
      build: async () => {
        ssrPlugin.generateBundle.call(
          { environment: secondSsr, warn: vi.fn() },
          {},
          { 'entry.second.js': { type: 'chunk', isEntry: true } }
        );
      },
    });
    expect(secondGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ outputEntries: ['entry.second.js'] })
    );
  });

  it.each([false, true])(
    'warns when the ssr environment is built outside buildApp (watch: %s)',
    (isWatching) => {
      const [plugin] = viteAdapter({ name: 'test', origin: 'https://example.com' }) as any[];
      plugin.configResolved(resolvedConfig);

      const warn = vi.fn();
      plugin.generateBundle.call(
        {
          environment: {
            name: 'ssr',
            config: { ...ssrConfig, build: { ...ssrConfig.build, watch: isWatching ? {} : null } },
          },
          warn,
        },
        {},
        ssrBundles
      );

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Qwik Router SSG was skipped'));
    }
  );

  it('only suppresses watch warnings for the environment started by buildApp', async () => {
    const opts = { name: 'test', origin: 'https://example.com' };
    const [topLevelPlugin] = viteAdapter(opts) as any[];
    const [ssrPlugin] = viteAdapter(opts) as any[];
    topLevelPlugin.configResolved(resolvedConfig);
    ssrPlugin.configResolved(resolvedConfig);

    const ssr = {
      name: 'ssr',
      config: { ...ssrConfig, build: { ...ssrConfig.build, watch: {} } },
    };
    await topLevelPlugin.buildApp({
      environments: { ssr },
      config: { root: '/app', define: {}, logger: { warn() {} } },
      build: async () => {},
    });

    const warn = vi.fn();
    ssrPlugin.generateBundle.call({ environment: ssr, warn }, {}, ssrBundles);
    ssrPlugin.generateBundle.call({ environment: ssr, warn }, {}, ssrBundles);
    expect(warn).not.toHaveBeenCalled();

    ssrPlugin.generateBundle.call({ environment: { ...ssr }, warn }, {}, ssrBundles);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Qwik Router SSG was skipped'));
  });

  it.each([false, true])(
    'forgets the app build when the build fails (watch: %s)',
    async (isWatching) => {
      const opts = { name: 'test', origin: 'https://example.com' };
      const [topLevelPlugin] = viteAdapter(opts) as any[];
      const [ssrPlugin] = viteAdapter(opts) as any[];
      topLevelPlugin.configResolved(resolvedConfig);
      ssrPlugin.configResolved(resolvedConfig);
      const ssr = {
        name: 'ssr',
        config: { ...ssrConfig, build: { ...ssrConfig.build, watch: isWatching ? {} : null } },
      };

      await expect(
        topLevelPlugin.buildApp({
          environments: { ssr },
          config: { root: '/app', define: {}, logger: { warn() {} } },
          build: async () => {
            throw new Error('build failed');
          },
        })
      ).rejects.toThrow('build failed');

      const warn = vi.fn();
      ssrPlugin.generateBundle.call({ environment: ssr, warn }, {}, ssrBundles);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Qwik Router SSG was skipped'));
    }
  );

  it('keeps the app builds of different roots apart', async () => {
    const generate = vi.fn();
    const opts = { name: 'test', origin: 'https://example.com', generate };
    const [topLevelPlugin] = viteAdapter(opts) as any[];
    const [ssrPlugin] = viteAdapter(opts) as any[];
    topLevelPlugin.configResolved(resolvedConfig);
    ssrPlugin.configResolved(resolvedConfig);

    const warn = vi.fn();
    await topLevelPlugin.buildApp({
      environments: { ssr: { config: ssrConfig } },
      config: { root: '/app', define: {}, logger: { warn() {} } },
      build: async () => {
        ssrPlugin.generateBundle.call(
          { environment: { name: 'ssr', config: ssrConfig }, warn },
          {},
          ssrBundles
        );
        // A direct build of another project while `/app` is building.
        ssrPlugin.generateBundle.call(
          {
            environment: { name: 'ssr', config: { ...ssrConfig, root: '/other' } },
            warn,
          },
          {},
          { 'entry.other.js': { type: 'chunk', isEntry: true } }
        );
      },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Qwik Router SSG was skipped'));
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ outputEntries: ['entry.azure-swa.js'] })
    );
  });
});
