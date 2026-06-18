// post-merge git hook: regenerate AI guidance when shared `.ruler/` source changed in a pull.
//
// Generated assistant files (`.claude/`, `.codex/`, `.cursor/`, ...) are local, gitignored Ruler
// outputs. When `.ruler/` source changes upstream, a developer's generated files go stale until
// Ruler runs again. This hook re-applies Ruler from the pinned local devDependency (`pnpm exec`,
// so no network — it works inside AI-agent command sandboxes) whenever a pull touched `.ruler/`,
// keeping generated guidance fresh without a manual step. It only rewrites the gitignored generated
// outputs, never blocks the merge on failure, and skips CI, where these files are not expected.
import { execFileSync, execSync } from 'node:child_process';

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

try {
  process.stdout.write(
    `[ruler] .ruler guidance changed in this pull (${changed.length} file(s)) — regenerating...\n`
  );
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['exec', 'ruler', 'apply', '--no-gitignore', '--no-mcp'];
  execFileSync(pnpm, args, { stdio: 'inherit' });
} catch (err) {
  // Never block a merge on guidance generation; a manual `ruler apply` still works.
  process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
}
