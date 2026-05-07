#!/usr/bin/env node
// Regenerates `.ci/baseline.json` from a vitest --reporter=json output.
// Used by the update-baseline workflow on push to main, and for local
// re-baselining when a test legitimately flips and the baseline needs
// to advance.
//
// Usage: node scripts/update-baseline.mjs <vitest-json>

import { parseVitestJson, writeBaseline } from './lib/baseline.mjs';

const [, , jsonPath] = process.argv;
if (!jsonPath) {
  console.error('Usage: node scripts/update-baseline.mjs <vitest-json>');
  process.exit(2);
}

const baseline = parseVitestJson(jsonPath);
writeBaseline(baseline);

console.log(`✅ Baseline written:`);
console.log(`   convergence: ${baseline.convergence.passing.length} / ${baseline.convergence.total} passing`);
console.log(`   full:        ${baseline.full.passing.length} / ${baseline.full.total} passing`);
