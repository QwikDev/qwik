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
const artifacts: Array<{ artifact: string; src: string; dest: string }> = [
  { artifact: 'artifact-qwik', src: 'artifact-qwik', dest: 'packages/qwik/dist' },
  { artifact: 'artifact-optimizer', src: 'artifact-optimizer', dest: 'packages/optimizer' },
  {
    artifact: 'artifact-qwikrouter',
    src: 'artifact-qwikrouter',
    dest: 'packages/qwik-router/lib',
  },
  {
    artifact: 'artifact-create-qwik',
    src: 'artifact-create-qwik',
    dest: 'packages/create-qwik/dist',
  },
  {
    artifact: 'artifact-eslint-plugin-qwik',
    src: 'artifact-eslint-plugin-qwik',
    dest: 'packages/eslint-plugin-qwik/dist',
  },
  // qwik-react artifact nests its output in a `lib` subdirectory
  { artifact: 'artifact-qwikreact', src: 'artifact-qwikreact', dest: 'packages/qwik-react/lib' },
  // docs build output (upload LCA is packages/docs/, so paths are relative to that)
  { artifact: 'artifact-docs', src: 'artifact-docs/dist', dest: 'packages/docs/dist' },
  { artifact: 'artifact-docs', src: 'artifact-docs/server', dest: 'packages/docs/server' },
];

const requestedArtifacts = new Set(process.argv.slice(2));
const knownArtifacts = new Set(artifacts.map(({ artifact }) => artifact));

for (const artifact of requestedArtifacts) {
  if (!knownArtifacts.has(artifact)) {
    throw new Error(`Unknown artifact allowlist entry: ${artifact}`);
  }
}

let restored = 0;

for (const { artifact, src, dest } of artifacts) {
  const required = requestedArtifacts.has(artifact);
  if (requestedArtifacts.size > 0 && !required) {
    continue;
  }

  const srcPath = join(root, src);
  if (!existsSync(srcPath)) {
    if (required) {
      throw new Error(`Required artifact source not found: ${src}`);
    }
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

console.log(`Restored ${restored} artifact path(s).`);
