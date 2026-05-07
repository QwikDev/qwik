// Shared helpers for parsing vitest --reporter=json output and producing
// the `.ci/baseline.json` shape consumed by check-regression and
// update-baseline.

import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_PATH = path.join('.ci', 'baseline.json');

/**
 * A test ID is "<repo-relative file>::<vitest fullName>". Stable across
 * machines (no absolute paths) and uniquely identifies a single `it()`.
 *
 * The relative path is computed against `projectRoot`, which defaults to
 * `process.cwd()`. Pass an explicit value when parsing a JSON produced
 * under a different cwd (e.g., Linux Docker `/workspace`).
 */
function testIdFor(fileResult, assertion, projectRoot) {
  const relativeFile = path.relative(projectRoot, fileResult.name);
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
 * Detect the project root for a vitest JSON by finding the longest
 * absolute prefix common to every file path that ends in a `tests/` or
 * `src/` segment. Falls back to `process.cwd()` if detection fails.
 *
 * This makes the parser robust to JSONs produced under any cwd
 * (macOS local, Linux Docker `/workspace`, GH Actions runner, etc.).
 */
function detectProjectRoot(testResults) {
  for (const fr of testResults ?? []) {
    const p = fr.name ?? '';
    const m = p.match(/^(.*?)(\/tests\/|\/src\/)/);
    if (m) return m[1];
  }
  return process.cwd();
}

/**
 * Parse a vitest --reporter=json output file into:
 *   { convergence: { passing: [...ids], total: N },
 *     full:        { passing: [...ids], total: N } }
 *
 * `passing` is sorted for deterministic diffs. `total` includes failures.
 *
 * `projectRoot` is auto-detected from the JSON when omitted, so the same
 * baseline file is produced regardless of which cwd the test run used.
 */
export function parseVitestJson(jsonPath, projectRoot) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const root = projectRoot ?? detectProjectRoot(data.testResults);
  const convergence = { passing: [], total: 0 };
  const full = { passing: [], total: 0 };

  for (const fileResult of data.testResults ?? []) {
    const relativeFile = path.relative(root, fileResult.name);
    const inConvergence = isConvergence(relativeFile);

    for (const assertion of fileResult.assertionResults ?? []) {
      const id = testIdFor(fileResult, assertion, root);
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
