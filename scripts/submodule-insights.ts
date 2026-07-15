import { join } from 'node:path';
import ts from 'typescript';
import { build } from 'vite';
import { ensureDir, type BuildConfig, readFile, writeFile } from './util.ts';

export async function submoduleInsights(config: BuildConfig) {
  await buildComponents(config);
  await buildVite(config);

  console.log(`📈 insights`);
}

async function buildComponents(config: BuildConfig) {
  const entryPoint = join(config.srcQwikDir, 'insights', 'insights.tsx');
  const distBase = join(config.distQwikPkgDir, 'insights');
  const outputFile = join(distBase, 'index.qwik.mjs');
  const result = ts.transpileModule(await readFile(entryPoint, 'utf-8'), {
    fileName: entryPoint,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      sourceMap: true,
    },
  });
  ensureDir(distBase);
  await writeFile(
    outputFile,
    result.outputText.replace(
      /\/\/# sourceMappingURL=.*$/m,
      '//# sourceMappingURL=index.qwik.mjs.map'
    )
  );
  if (result.sourceMapText) {
    const sourceMap = JSON.parse(result.sourceMapText);
    sourceMap.file = 'index.qwik.mjs';
    await writeFile(`${outputFile}.map`, JSON.stringify(sourceMap));
  }
}

async function buildVite(config: BuildConfig) {
  const entryPoint = join(config.srcQwikDir, 'insights', 'vite', 'index.ts');
  const distBase = join(config.distQwikPkgDir, 'insights', 'vite');

  await build({
    build: {
      lib: {
        entry: entryPoint,
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: distBase,
      emptyOutDir: false,
      rollupOptions: {
        external: (id) => /^(@|node:)/i.test(id),
      },
    },
  });
}
