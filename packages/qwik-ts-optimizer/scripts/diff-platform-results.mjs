#!/usr/bin/env node
// Compare a Linux vitest result against the macOS-derived baseline and
// report which tests pass on macOS but fail (or are missing) on Linux.
//
// Usage: node scripts/diff-platform-results.mjs <linux-vitest-json>

import fs from 'node:fs';
import path from 'node:path';
import { parseVitestJson } from './lib/baseline.mjs';

const [, , linuxJsonPath] = process.argv;
if (!linuxJsonPath) {
  console.error('Usage: node scripts/diff-platform-results.mjs <linux-vitest-json>');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync('.ci/baseline.json', 'utf8'));
const linux = parseVitestJson(linuxJsonPath);

for (const suite of ['convergence', 'full']) {
  const macosPassing = new Set(baseline[suite].passing);
  const linuxPassing = new Set(linux[suite].passing);

  const macosOnly = [...macosPassing].filter(id => !linuxPassing.has(id)).sort();
  const linuxOnly = [...linuxPassing].filter(id => !macosPassing.has(id)).sort();
  const both = [...macosPassing].filter(id => linuxPassing.has(id)).length;

  console.log(`\n=== ${suite.toUpperCase()} ===`);
  console.log(`  macOS passing only: ${macosOnly.length}`);
  console.log(`  Linux passing only: ${linuxOnly.length}`);
  console.log(`  Both passing:       ${both}`);

  if (macosOnly.length > 0) {
    const out = path.join('.ci', `divergence-${suite}-macos-only.txt`);
    fs.writeFileSync(out, macosOnly.join('\n') + '\n');
    console.log(`  → wrote ${out}`);
  }
  if (linuxOnly.length > 0) {
    const out = path.join('.ci', `divergence-${suite}-linux-only.txt`);
    fs.writeFileSync(out, linuxOnly.join('\n') + '\n');
    console.log(`  → wrote ${out}`);
  }
}
