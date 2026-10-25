import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceMapConsumer } from 'source-map';
import { build, parseAst, type Plugin, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';
import { qwikVite } from './vite';

const repoNodeModules = fileURLToPath(new URL('../../../../node_modules', import.meta.url));
const TASK_MARKER = 'globalThis.visibleTaskRan';

const collectStaticDynamicImports = (node: any, specifiers: string[] = []): string[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectStaticDynamicImports(child, specifiers));
  } else if (node && typeof node === 'object') {
    const { source } = node;
    if (node.type === 'ImportExpression' && source.type === 'Literal') {
      specifiers.push(source.value);
    } else if (node.type === 'ImportExpression' && source.type === 'TemplateLiteral') {
      specifiers.push(source.quasis[0].value.cooked);
    }
    Object.values(node).forEach((child) => collectStaticDynamicImports(child, specifiers));
  }
  return specifiers;
};

const buildClient = async ({
  taskBody,
  minify,
  sourcemap = false,
  chunkFileNames,
  createPlugins = () => [],
}: {
  taskBody: string[];
  minify: boolean;
  sourcemap?: boolean | 'hidden' | 'inline';
  chunkFileNames?: string;
  createPlugins?: (appDir: string) => Plugin[];
}) => {
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
        `    ${TASK_MARKER} = true;`,
        ...taskBody.map((line) => `    ${line}`),
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
      plugins: [...createPlugins(appDir), qwikVite({ tsOptimizer: true })],
      build: {
        write: false,
        minify,
        sourcemap,
        rolldownOptions: {
          input: join(appDir, 'src', 'root.tsx'),
          ...(chunkFileNames && { output: { chunkFileNames } }),
        },
      },
    });

    const outputs = (Array.isArray(result) ? result : [result as Rolldown.RolldownOutput]).flatMap(
      (o) => o.output
    );
    const chunks = outputs.filter((o): o is Rolldown.OutputChunk => o.type === 'chunk');
    const taskChunk = chunks.find((chunk) => chunk.code.includes(TASK_MARKER))!;
    const emittedFiles = new Set(outputs.map((o) => o.fileName));
    const missingImportedFiles = chunks
      .flatMap((chunk) =>
        collectStaticDynamicImports(parseAst(chunk.code))
          .filter((specifier) => specifier.startsWith('.'))
          .map((specifier) => posix.join(posix.dirname(chunk.fileName), specifier))
      )
      .filter((file) => !emittedFiles.has(file));
    return { outputs, taskChunk, taskCode: taskChunk.code, missingImportedFiles };
  } finally {
    await rm(appDir, { recursive: true, force: true });
  }
};

const expectMappedToOriginalSource = async (
  { outputs, taskChunk: { code, fileName } }: Awaited<ReturnType<typeof buildClient>>,
  marker: string
) => {
  const asset = outputs.find((o) => o.fileName === `${fileName}.map`) as Rolldown.OutputAsset;
  const inlineMap = /sourceMappingURL=data:[^,]*,(\S+)$/.exec(code);
  const lines = code.split('\n');
  const line = lines.findIndex((text) => text.includes(marker));

  const original = await SourceMapConsumer.with(
    JSON.parse(asset ? String(asset.source) : atob(inlineMap![1])),
    null,
    (consumer) => {
      const column = lines[line].indexOf(marker);
      const position = consumer.originalPositionFor({ line: line + 1, column });
      const originalLines = consumer.sourceContentFor(position.source!)!.split('\n');
      return originalLines[position.line! - 1].slice(position.column!);
    }
  );

  expect(original.slice(0, marker.length)).toBe(marker);
};

describe.each([false, true])(
  'client build with a dynamically imported stylesheet (minify: %s)',
  (minify) => {
    test('never references a chunk that was not emitted', async () => {
      const { outputs, missingImportedFiles } = await buildClient({
        taskBody: [`await import('./probe.css');`],
        minify,
      });

      expect(missingImportedFiles).toEqual([]);
      const stylesheet = outputs.find((o) => o.type === 'asset' && o.fileName.endsWith('.css'));
      expect(String((stylesheet as Rolldown.OutputAsset).source)).toContain('.probe');
    });

    test('only stubs the stylesheet import, not lookalike method calls and strings', async () => {
      const { taskCode } = await buildClient({
        taskBody: [
          `await import('./probe.css');`,
          `globalThis.loader.import('./probe.js');`,
          'globalThis.example = `import("./probe.js")`;',
        ],
        minify,
        chunkFileNames: 'build/[name].js',
      });

      const [methodCall, templateAssignment] = minify
        ? ['globalThis.loader.import(`./probe.js`)', 'globalThis.example=`import("./probe.js")`']
        : ['globalThis.loader.import("./probe.js")', 'globalThis.example = `import("./probe.js")`'];
      expect(taskCode).toContain(methodCall);
      expect(taskCode).toContain(templateAssignment);
      expect(taskCode.split('Promise.resolve({})')).toHaveLength(2);
      expect(collectStaticDynamicImports(parseAst(taskCode))).toEqual([]);
    });

    test('stubs a stylesheet import nested in another dynamic import', async () => {
      const { missingImportedFiles, taskCode } = await buildClient({
        taskBody: [
          `await import(/* @vite-ignore */ (await import('./probe.css'), globalThis.widgetModuleUrl));`,
        ],
        minify,
      });

      expect(missingImportedFiles).toEqual([]);
      expect(taskCode.split('Promise.resolve({})')).toHaveLength(2);
      expect(taskCode.match(/\bimport\(/g)).toHaveLength(1);
    });

    test.each([true, 'hidden', 'inline'] as const)(
      'keeps the sourcemap valid after the stub (sourcemap: %s)',
      async (sourcemap) => {
        const result = await buildClient({
          taskBody: [`await import('./probe.css');`, `globalThis.afterCss = 12345;`],
          minify,
          sourcemap,
        });

        expect(result.taskCode).toContain('Promise.resolve({})');
        await expectMappedToOriginalSource(result, 'globalThis.afterCss');
      }
    );

    test('maps code to the original source without a stylesheet import', async () => {
      const taskBody = [`globalThis.afterCss = 12345;`];
      const result = await buildClient({ taskBody, minify, sourcemap: true });

      await expectMappedToOriginalSource(result, 'globalThis.afterCss');
    });

    test.each([true, 'relative'] as const)(
      'keeps a dynamic import of an external module (external: %s)',
      async (external) => {
        const { taskCode } = await buildClient({
          taskBody: [`await import('./external.js');`],
          minify,
          createPlugins: (appDir) => [
            {
              name: 'test-resolve-external',
              enforce: 'pre',
              resolveId(source) {
                if (source.endsWith('/external.js')) {
                  return { id: join(appDir, 'src', 'external.js'), external };
                }
              },
            },
          ],
        });

        const externalImports = collectStaticDynamicImports(parseAst(taskCode)).filter(
          (specifier) => specifier.endsWith('/external.js')
        );
        expect(externalImports).toHaveLength(1);
        expect(taskCode).not.toContain('Promise.resolve({})');
      }
    );
  }
);
