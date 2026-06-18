// postinstall hook: (re)generate Ruler's assistant files from the committed `.ruler/` source,
// but only when something actually changed.
//
// Generated assistant files (CLAUDE.md, AGENTS.md, .claude/, ...) are local, gitignored Ruler
// outputs. Running at postinstall — after `pnpm install` has populated `node_modules` — lets us
// invoke the pinned local `ruler` via `pnpm exec` rather than fetching it, so no network is needed
// and generation keeps working inside AI-agent command sandboxes.
//
// To keep ordinary reinstalls fast, we hash the `.ruler/` source and record it after each apply,
// then skip when the generated outputs exist and that hash is unchanged. We regenerate when the
// outputs are missing (fresh clone/worktree) or the source moved (a pull or local edit). The marker
// lives under node_modules/ (gitignored, per-worktree), so a clean install regenerates. It only
// writes the gitignored outputs, never blocks the install on failure, and skips CI.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

if (process.env.CI || !existsSync('.ruler/ruler.toml')) {
  process.exit(0);
}

// A representative generated output; its absence (fresh clone/worktree, or a manual delete) forces a
// regenerate regardless of the source hash.
const OUTPUT = 'CLAUDE.md';
// Records the `.ruler/` hash last applied, so an unchanged source is a no-op on the next install.
const MARKER = 'node_modules/.cache/ruler-applied';

function rulerSourceHash() {
  const hash = createHash('sha256');
  const files = readdirSync('.ruler', { recursive: true })
    .map((rel) => join('.ruler', rel))
    .filter((file) => statSync(file).isFile())
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

const sourceHash = rulerSourceHash();
const appliedHash = existsSync(MARKER) ? readFileSync(MARKER, 'utf8') : '';
if (existsSync(OUTPUT) && appliedHash === sourceHash) {
  // Generated files already match the current `.ruler/` source — nothing to do.
  process.exit(0);
}

try {
  process.stdout.write(
    '[ruler] .ruler changed or outputs missing — generating assistant guidance...\n'
  );
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['exec', 'ruler', 'apply', '--no-gitignore', '--no-mcp'];
  execFileSync(pnpm, args, { stdio: 'inherit' });
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, sourceHash);
} catch (err) {
  // Never block the install on guidance generation.
  process.stderr.write(`[ruler] skipped: ${err?.message ?? err}\n`);
}
