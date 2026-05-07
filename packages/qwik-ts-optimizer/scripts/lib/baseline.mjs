// Shared helpers for parsing vitest --reporter=json output and producing
// the `.ci/baseline.json` shape consumed by check-regression and
// update-baseline.

import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_PATH = path.join('.ci', 'baseline.json');

/**
 * A test ID is "<repo-relative file>::<vitest fullName>". Stable across
 * machines (no absolute paths) and uniquely identifies a single `it()`.
 */
function testIdFor(fileResult, assertion) {
  const relativeFile = path.relative(process.cwd(), fileResult.name);
  return `${relativeFile} :: ${assertion.fullName}`;
}

/**
 * Returns true if a test's relative file path identifies it as part of the
 * convergence suite (matches what `pnpm vitest convergence` would run).
 */
function isConvergence(relativeFile) {
  return relativeFile.includes('convergence');
}

/**
 * Parse a vitest --reporter=json output file into:
 *   { convergence: { passing: [...ids], total: N },
 *     full:        { passing: [...ids], total: N } }
 *
 * `passing` is sorted for deterministic diffs. `total` includes failures.
 */
export function parseVitestJson(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const convergence = { passing: [], total: 0 };
  const full = { passing: [], total: 0 };

  for (const fileResult of data.testResults ?? []) {
    const relativeFile = path.relative(process.cwd(), fileResult.name);
    const inConvergence = isConvergence(relativeFile);

    for (const assertion of fileResult.assertionResults ?? []) {
      const id = testIdFor(fileResult, assertion);
      full.total += 1;
      if (inConvergence) convergence.total += 1;
      if (assertion.status === 'passed') {
        full.passing.push(id);
        if (inConvergence) convergence.passing.push(id);
      }
    }
  }

  full.passing.sort();
  convergence.passing.sort();
  return { convergence, full };
}

export function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`Baseline file missing: ${BASELINE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

export function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
}
