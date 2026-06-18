// postinstall hook: (re)generate Ruler's assistant files from the committed `.ruler/` source.
//
// Generated assistant files (CLAUDE.md, AGENTS.md, .claude/, ...) are local, gitignored Ruler
// outputs. Running at postinstall — after `pnpm install` has populated `node_modules` — lets us
// invoke the pinned local `ruler` via `pnpm exec` rather than fetching it, so no network is needed
// and generation keeps working inside AI-agent command sandboxes. It re-applies on every install so
// the generated files track the current source, covering fresh clones, new worktrees, and `.ruler/`
// edits picked up on the next install. It only writes the gitignored outputs, never blocks the
// install on failure, and skips CI, where these files are not expected.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.ruler/ruler.toml')) {
  process.exit(0);
}

try {
  process.stdout.write('[ruler] generating assistant guidance...\n');
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['exec', 'ruler', 'apply', '--no-gitignore', '--no-mcp'];
  execFileSync(pnpm, args, { stdio: 'inherit' });
} catch (err) {
  // Never block the install on guidance generation.
  process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
}
