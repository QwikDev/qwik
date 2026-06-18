// postinstall: regenerate gitignored .ruler/ assistant files (offline `pnpm exec ruler`) when the source hash changed or outputs are missing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyRuler } from './ruler-lib.mjs';

if (process.env.CI || !existsSync('.ruler/ruler.toml')) {
  process.exit(0);
}

// Representative output; if missing (fresh clone/worktree or manual delete), regenerate regardless of hash.
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

process.stdout.write(
  '[ruler] .ruler changed or outputs missing — generating assistant guidance...\n'
);
if (applyRuler()) {
  // Record the applied source hash only on success, so a failed run retries on the next install.
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, sourceHash);
}
