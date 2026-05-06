import { describe, expect, it } from 'vitest';
import { qwikRouter } from './plugin';

describe('qwikRouter plugin', () => {
  describe('defaultLoadersSerializationStrategy', () => {
    it('should set the defaultLoadersSerializationStrategy to "never" when not provided', async () => {
      const plugins = qwikRouter();
      await expect((plugins[0] as any)?.config?.({}, { command: 'build' })).resolves.toMatchObject({
        define: {
          'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': '"never"',
        },
      });
    });

    it('should set the defaultLoadersSerializationStrategy to "always" when provided', async () => {
      const plugins = qwikRouter({
        defaultLoadersSerializationStrategy: 'always',
      });

      await expect((plugins[0] as any)?.config?.({}, { command: 'build' })).resolves.toMatchObject({
        define: {
          'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': '"always"',
        },
      });
    });
  });

  describe('config hook', () => {
    it('should include ssr config for legacy vite build --ssr compatibility', async () => {
      const plugins = qwikRouter();
      const config = await (plugins[0] as any)?.config?.({}, { command: 'build' });
      expect(config.ssr.noExternal).toContain('@qwik.dev/router');
      expect(config.ssr.noExternal).toContain('zod');
      expect(config.ssr.external).toContain('node:async_hooks');
    });
  });

  describe('configEnvironment', () => {
    it('should set noExternal and external for server environments', () => {
      const plugins = qwikRouter();
      const hook = (plugins[0] as any).configEnvironment;
      expect(hook).toBeTypeOf('function');

      const result = hook('ssr', { consumer: 'server' }, { command: 'serve', mode: 'development' });
      expect(result.resolve.noExternal).toContain('@qwik.dev/router');
      expect(result.resolve.noExternal).toContain('zod');
      expect(result.resolve.external).toContain('node:async_hooks');
    });

    it('should return empty config for client environments', () => {
      const plugins = qwikRouter();
      const hook = (plugins[0] as any).configEnvironment;

      const result = hook(
        'client',
        { consumer: 'client' },
        { command: 'serve', mode: 'development' }
      );
      expect(result).toEqual({});
    });
  });
});
