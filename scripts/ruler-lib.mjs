// Shared helper for the Ruler git/install hooks (`ruler-apply.mjs`, `ruler-postmerge-check.mjs`).
import { execFileSync } from 'node:child_process';

// Regenerate the gitignored assistant files from `.ruler/` by running the pinned local `ruler`
// devDependency via `pnpm exec`. Using `pnpm exec` (not `pnpm dlx`) means no registry fetch, so it
// stays offline and keeps working inside AI-agent command sandboxes. Best-effort: returns true on
// success and false on failure (logged, not thrown) so callers never block an install or merge on
// guidance generation.
export function applyRuler() {
  try {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const args = ['exec', 'ruler', 'apply', '--no-gitignore', '--no-mcp'];
    execFileSync(pnpm, args, { stdio: 'inherit' });
    return true;
  } catch (err) {
    process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
    return false;
  }
}
