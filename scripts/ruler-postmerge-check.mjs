// post-merge git hook: notify when shared AI guidance under `.ruler/` changed in a pull.
//
// Generated assistant files (`.claude/`, `.codex/`, `.cursor/`, ...) are local, gitignored Ruler
// outputs. When `.ruler/` source changes upstream, a developer's generated files go stale until
// they re-run Ruler. This hook only prints a reminder — it never writes files — so there are no
// surprise scaffolds, no CI noise (post-merge does not fire on fetch/checkout), and no trust cost.
import { execSync } from 'node:child_process';

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
if (changed.length > 0) {
  const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
  process.stdout.write(
    yellow(`\n⚠ .ruler AI guidance changed in this pull (${changed.length} file(s)).`) +
      '\n  Refresh your generated agent files so they are not stale:\n' +
      '    ruler apply --agents <your-tool>\n\n'
  );
}
