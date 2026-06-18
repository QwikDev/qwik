// post-checkout git hook: generate Ruler's assistant files when a fresh worktree lacks them.
//
// Generated assistant files (CLAUDE.md, AGENTS.md, .claude/, ...) are local, gitignored Ruler
// outputs, so a newly created worktree starts without them and AI assistants miss the shared
// `.ruler/` guidance. Unlike the post-merge reminder, this hook *applies* Ruler — but only when
// the outputs are entirely absent, i.e. a new `git worktree add`. It overwrites nothing in an
// existing checkout (no-op once CLAUDE.md exists), is silent on ordinary branch switches, and
// skips CI, where the files are not expected and a network fetch would only add noise.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.ruler/ruler.toml') || existsSync('CLAUDE.md')) {
  process.exit(0);
}

try {
  process.stdout.write('[ruler] new worktree detected — generating assistant guidance...\n');
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['dlx', '@intellectronica/ruler', 'apply', '--no-gitignore', '--no-mcp'];
  execFileSync(pnpm, args, { stdio: 'inherit' });
} catch (err) {
  // Never block a checkout on guidance generation.
  process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
}
