import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The serializer ships as its own subpath so browser apps only load it from segments that need it.
test('core does not statically reach the serializer', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'neutral',
    treeShaking: false,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader', 'node:async_hooks'],
    define: { __EXPERIMENTAL__: '{}', 'import.meta.hot': 'false', 'import.meta.env': '{}' },
    logLevel: 'silent',
  });
  const serializerModules = Object.keys(result.metafile.inputs).filter((path) =>
    /\/(serialize|serialization-context)\.ts$|\/src\/serializer\//.test(path)
  );
  expect(serializerModules).toEqual([]);
});
