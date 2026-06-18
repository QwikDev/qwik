// Shared helper for the Ruler git/install hooks (`ruler-apply.mjs`, `ruler-postmerge-check.mjs`).
import { execFileSync } from 'node:child_process';

// Offline `pnpm exec ruler apply` to regenerate .ruler/ assistant files. Best-effort: returns true on success, false on failure (logged, not thrown).
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
