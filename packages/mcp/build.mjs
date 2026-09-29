import { build } from 'esbuild';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
