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
});
