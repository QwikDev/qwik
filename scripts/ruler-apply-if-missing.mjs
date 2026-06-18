// postinstall hook: generate Ruler's assistant files when a checkout lacks them.
//
// Generated assistant files (CLAUDE.md, AGENTS.md, .claude/, ...) are local, gitignored Ruler
// outputs, so a fresh clone or new `git worktree add` starts without them and AI assistants miss
// the shared `.ruler/` guidance. Running at postinstall means `node_modules` exists, so we invoke
// the pinned local `ruler` via `pnpm exec` instead of fetching it — no network needed, which keeps
// generation working inside AI-agent command sandboxes. It overwrites nothing once CLAUDE.md
// exists (no-op), and skips CI, where the files are not expected.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.ruler/ruler.toml') || existsSync('CLAUDE.md')) {
  process.exit(0);
}

try {
  process.stdout.write('[ruler] assistant guidance missing — generating...\n');
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['exec', 'ruler', 'apply', '--no-gitignore', '--no-mcp'];
  execFileSync(pnpm, args, { stdio: 'inherit' });
} catch (err) {
  // Never block a checkout on guidance generation.
  process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
}
