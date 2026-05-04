import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Replaces `import.meta.env.TEST` with `false` in published `.mjs` artifacts so that non-Vite
 * consumers (webpack, etc.) don't blow up at runtime when accessing `.TEST` on an undefined
 * `import.meta.env`.
 *
 * Run as a publish-time post-processing step (not at build time) so that the `dist/` artifacts used
 * by Qwik's own vitest tests keep the `import.meta.env.TEST` literal — vitest populates that value
 * at runtime, and several dual-mode SSR/CSR guards rely on the runtime override.
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, '..', 'packages', 'qwik', 'dist');

const TEST_PATTERN = /import\.meta\.env\.TEST/g;
const JS_EXTENSIONS = ['.mjs', '.cjs', '.js'];
// `starters/` and `templates/` ship user-facing scaffolding files (copied verbatim into new
// projects by create-qwik). They may legitimately reference `import.meta.env.TEST` as user code,
// to be substituted by the consuming app's bundler — don't rewrite them here.
const SKIP_DIRS = new Set(['starters', 'templates']);

function* walkBundles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkBundles(full);
    } else if (stat.isFile() && JS_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      yield full;
    }
  }
}

let totalReplacements = 0;
let touchedFiles = 0;

for (const file of walkBundles(distDir)) {
  const original = readFileSync(file, 'utf-8');
  const matches = original.match(TEST_PATTERN);
  if (!matches) {
    continue;
  }
  const updated = original.replace(TEST_PATTERN, 'false');
  writeFileSync(file, updated);
  totalReplacements += matches.length;
  touchedFiles += 1;
  console.log(`  ${file.replace(distDir, 'dist')}: ${matches.length} replacement(s)`);
}

console.log(
  `🧹 strip-test-env: replaced ${totalReplacements} \`import.meta.env.TEST\` reference(s) across ${touchedFiles} file(s)`
);
