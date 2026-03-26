/**
 * Restores CI build artifacts from downloaded artifact directories into their correct package
 * locations. Cross-platform (works on Windows).
 *
 * Usage: node --require ./scripts/runBefore.ts scripts/ci-restore-artifacts.ts
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** Each entry maps an artifact source to its package destination. */
const artifacts: Array<{ src: string; dest: string }> = [
  { src: 'artifact-qwik', dest: 'packages/qwik/dist' },
  { src: 'artifact-optimizer', dest: 'packages/optimizer' },
  { src: 'artifact-qwikrouter', dest: 'packages/qwik-router/lib' },
  { src: 'artifact-create-qwik', dest: 'packages/create-qwik/dist' },
  { src: 'artifact-eslint-plugin-qwik', dest: 'packages/eslint-plugin-qwik/dist' },
  // qwik-react artifact nests its output in a `lib` subdirectory
  { src: 'artifact-qwikreact', dest: 'packages/qwik-react/lib' },
];

let restored = 0;

for (const { src, dest } of artifacts) {
  const srcPath = join(root, src);
  if (!existsSync(srcPath)) {
    console.log(`  skip: ${src} (not found)`);
    continue;
  }
  const destPath = join(root, dest);
  mkdirSync(destPath, { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
  console.log(`  ${src} → ${dest}`);
  restored++;
}

// Clean up all artifact-* directories
for (const entry of readdirSync(root)) {
  if (entry.startsWith('artifact-')) {
    rmSync(join(root, entry), { recursive: true, force: true });
  }
}

console.log(`Restored ${restored} artifact(s).`);
