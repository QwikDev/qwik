import { build } from 'esbuild';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLlmsManifest, createLlmsMirrors } from '../docs/scripts/generate-llms.ts';
const kit = fileURLToPath(new URL('./src/devtools.ts', import.meta.url));
const shared = {
  bundle: true,
  format: 'esm',
  target: 'esnext',
  alias: { '@qwik.dev/devtools/kit': kit },
  logLevel: 'info',
};
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const { version } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const mirrors = createLlmsMirrors({
  baseUrl: 'https://next.qwik.dev',
  packageDir: fileURLToPath(new URL('../docs', import.meta.url)),
  outputDir: fileURLToPath(new URL('./dist', import.meta.url)),
  entries: createLlmsManifest(),
});
await writeFile(
  'dist/docs.json',
  JSON.stringify({
    version,
    documents: mirrors.map(({ entry, canonicalUrl, content }) => ({
      id: entry.pathname,
      title: entry.title,
      description: entry.description,
      url: canonicalUrl,
      content,
    })),
  })
);
await build({
  ...shared,
  entryPoints: ['src/browser.ts'],
  outfile: 'dist/browser.js',
  platform: 'browser',
});
await build({
  ...shared,
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  outdir: 'dist',
  platform: 'node',
  packages: 'external',
});
await writeFile(
  'dist/index.d.ts',
  "import type { Plugin } from 'vite';\nexport declare function qwikMcp(): Plugin;\n"
);
await chmod('dist/cli.js', 0o755);
