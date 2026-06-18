// post-merge: regenerate .ruler/ assistant files (offline `pnpm exec ruler`) when a pull changed anything under .ruler/; skips CI.
import { execSync } from 'node:child_process';
import { applyRuler } from './ruler-lib.mjs';

if (process.env.CI) {
  process.exit(0);
}

const range = process.env.RULER_POSTMERGE_RANGE || 'ORIG_HEAD HEAD';

function changedRulerFiles() {
  try {
    const out = execSync(`git diff --name-only ${range} -- .ruler`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    // ORIG_HEAD may be unset (e.g. first commit); nothing to compare, stay silent.
    return [];
  }
}

const changed = changedRulerFiles();
if (changed.length === 0) {
  process.exit(0);
}

process.stdout.write(
  `[ruler] .ruler guidance changed in this pull (${changed.length} file(s)) — regenerating...\n`
);
applyRuler();
