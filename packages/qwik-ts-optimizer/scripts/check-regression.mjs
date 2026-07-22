#!/usr/bin/env node
// Compares the just-run vitest output against `.ci/baseline.json`.
// Exits non-zero if any test ID that was passing on the baseline is no
// longer in the current passing set. Reports new passing IDs as
// informational extras (the baseline auto-update workflow on `main` will
// pick them up after merge).
//
// Usage: node scripts/check-regression.mjs <vitest-json>

import { parseVitestJson, readBaseline } from './lib/baseline.mjs';

const [, , jsonPath] = process.argv;
if (!jsonPath) {
  console.error('Usage: node scripts/check-regression.mjs <vitest-json>');
  process.exit(2);
}

const baseline = readBaseline();
const current = parseVitestJson(jsonPath);

let failed = false;

for (const suite of ['convergence', 'full']) {
  const baselinePassing = new Set(baseline[suite].passing);
  const currentPassing = new Set(current[suite].passing);

  const regressed = [...baselinePassing].filter(id => !currentPassing.has(id));
  const extras = [...currentPassing].filter(id => !baselinePassing.has(id));

  if (regressed.length > 0) {
    console.error(`\n❌ ${suite}: ${regressed.length} test(s) regressed (passing on baseline, failing or missing now):`);
    for (const id of regressed.slice(0, 25)) console.error(`  - ${id}`);
    if (regressed.length > 25) console.error(`  ... and ${regressed.length - 25} more`);
    failed = true;
  } else {
    console.log(`✅ ${suite}: all ${baselinePassing.size} baseline-passing tests still pass.`);
  }

  if (extras.length > 0) {
    console.log(`   ⤴︎ ${extras.length} new test(s) passing (not in baseline yet — auto-update on merge to main).`);
  }

  if (current[suite].total < baseline[suite].total) {
    console.error(`\n⚠️  ${suite}: total test count dropped from ${baseline[suite].total} to ${current[suite].total}. Possible silent test deletion.`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
