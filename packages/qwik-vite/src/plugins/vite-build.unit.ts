import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';
import { qwikVite } from './vite';

const repoNodeModules = fileURLToPath(new URL('../../../../node_modules', import.meta.url));

describe('client build with a dynamically imported stylesheet', () => {
  test('never references a chunk that was not emitted', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'qwik-vite-css-import-'));
    try {
      await mkdir(join(appDir, 'src'), { recursive: true });
      await symlink(repoNodeModules, join(appDir, 'node_modules'), 'dir');
      await writeFile(
        join(appDir, 'src', 'root.tsx'),
        [
          `import { component$, useVisibleTask$ } from '@qwik.dev/core';`,
          `export default component$(() => {`,
          `  useVisibleTask$(async () => {`,
          `    await import('./probe.css');`,
          `  });`,
          `  return <div>probe</div>;`,
          `});`,
          ``,
        ].join('\n')
      );
      await writeFile(join(appDir, 'src', 'probe.css'), '.probe { color: red; }\n');

      const result = await build({
        configFile: false,
        root: appDir,
        logLevel: 'silent',
        plugins: [qwikVite({ tsOptimizer: true })],
        build: {
          write: false,
          minify: false,
          rolldownOptions: { input: join(appDir, 'src', 'root.tsx') },
        },
      });

      const outputs = (
        Array.isArray(result) ? result : [result as Rolldown.RolldownOutput]
      ).flatMap((o) => o.output);
      const emittedFiles = new Set(outputs.map((o) => o.fileName));
      const importedFiles = outputs.flatMap((o) =>
        o.type === 'chunk'
          ? [...o.code.matchAll(/\bimport\(\s*["'`](\.[^"'`]*)["'`]\s*\)/g)].map(([, specifier]) =>
              posix.join(posix.dirname(o.fileName), specifier)
            )
          : []
      );

      expect(importedFiles.filter((file) => !emittedFiles.has(file))).toEqual([]);
      const stylesheet = outputs.find((o) => o.type === 'asset' && o.fileName.endsWith('.css'));
      expect(String((stylesheet as Rolldown.OutputAsset).source)).toContain('.probe');
    } finally {
      await rm(appDir, { recursive: true, force: true });
    }
  });
});
