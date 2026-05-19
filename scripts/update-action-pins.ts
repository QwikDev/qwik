/**
 * Update GitHub Action pins in .github workflow files.
 *
 * Handles two formats:
 *
 * 1. Tag-based: uses: owner/repo@v4 → pinned to SHA
 * 2. SHA-pinned: uses: owner/repo@<sha> # v4 → updated to latest SHA+tag
 *
 * Requires the `gh` CLI to be authenticated.
 *
 * Usage: node --experimental-strip-types scripts/update-action-pins.ts node
 * --experimental-strip-types scripts/update-action-pins.ts --dry-run
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DRY_RUN = process.argv.includes('--dry-run');

// uses: owner/repo@<40-char sha> # tag
const PINNED_RE =
  /(?<=uses:\s{1,10})([a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+)@([0-9a-f]{40})\s*#\s*(\S+)/g;

// uses: owner/repo@vX or @vX.Y.Z (tag-based, not pinned)
const TAG_RE = /(?<=uses:\s{1,10})([a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+)@(v[0-9][^\s]*)/g;

function ghApi(path: string): unknown {
  return JSON.parse(
    execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  );
}

function getLatestTag(repo: string): string {
  try {
    return (ghApi(`repos/${repo}/releases/latest`) as { tag_name: string }).tag_name;
  } catch {
    return (ghApi(`repos/${repo}/tags`) as { name: string }[])[0]?.name;
  }
}

function getCommitSha(repo: string, ref: string): string {
  return (ghApi(`repos/${repo}/commits/${encodeURIComponent(ref)}`) as { sha: string }).sha;
}

function findWorkflowFiles(): string[] {
  const workflowDir = join(ROOT, '.github', 'workflows');
  const actionsDir = join(ROOT, '.github', 'actions');
  const files: string[] = [];

  const collect = (dir: string, pattern: RegExp) => {
    try {
      for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
        if (pattern.test(f)) files.push(join(dir, f as string));
      }
    } catch {
      // directory may not exist
    }
  };

  collect(workflowDir, /\.ya?ml$/);
  collect(actionsDir, /\.ya?ml$/);
  return files;
}

interface PinInfo {
  repo: string;
  currentRef: string; // sha or tag
  currentTag: string;
}

const files = findWorkflowFiles();
console.log(`Found ${files.length} workflow file(s).\n`);

// Collect unique actions (keyed by repo@currentRef)
const pinnedActions = new Map<string, PinInfo>();
const tagActions = new Map<string, PinInfo>();

for (const file of files) {
  const content = readFileSync(file, 'utf-8');

  for (const [, repo, sha, tag] of content.matchAll(PINNED_RE)) {
    if (!repo.startsWith('.')) {
      pinnedActions.set(`${repo}@${sha}`, { repo, currentRef: sha, currentTag: tag });
    }
  }

  for (const [, repo, tag] of content.matchAll(TAG_RE)) {
    if (!repo.startsWith('.')) {
      const key = `${repo}@${tag}`;
      if (!pinnedActions.has(key)) {
        tagActions.set(key, { repo, currentRef: tag, currentTag: tag });
      }
    }
  }
}

console.log(
  `  ${pinnedActions.size} SHA-pinned action(s), ${tagActions.size} tag-based action(s)\n`
);

type UpdateInfo = {
  repo: string;
  oldRef: string;
  oldTag: string;
  newSha: string;
  newTag: string;
};

const updates = new Map<string, UpdateInfo>();

// Process SHA-pinned — check if a newer version exists
for (const [key, { repo, currentRef: sha, currentTag: tag }] of pinnedActions) {
  process.stdout.write(`  [pinned] ${repo} (${tag}) → `);
  let latestTag: string;
  let latestSha: string;
  try {
    latestTag = getLatestTag(repo);
    latestSha = getCommitSha(repo, latestTag);
  } catch (e) {
    console.log(`ERROR: ${(e as Error).message}`);
    continue;
  }

  if (latestSha === sha) {
    console.log('up to date');
  } else {
    console.log(`${latestTag} (${latestSha.slice(0, 7)})`);
    updates.set(key, { repo, oldRef: sha, oldTag: tag, newSha: latestSha, newTag: latestTag });
  }
}

// Process tag-based — pin to SHA
for (const [key, { repo, currentRef: tag }] of tagActions) {
  process.stdout.write(`  [tag]    ${repo}@${tag} → `);
  let sha: string;
  try {
    sha = getCommitSha(repo, tag);
  } catch (e) {
    console.log(`ERROR: ${(e as Error).message}`);
    continue;
  }

  console.log(`${sha.slice(0, 7)} (pin)`);
  updates.set(key, { repo, oldRef: tag, oldTag: tag, newSha: sha, newTag: tag });
}

if (updates.size === 0) {
  console.log('\nAll actions up to date.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`\n[dry-run] Would update ${updates.size} action(s). No files written.`);
  process.exit(0);
}

let filesChanged = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  let changed = false;

  for (const { repo, oldRef, oldTag, newSha, newTag } of updates.values()) {
    // Replace SHA-pinned format
    const beforePinned = `${repo}@${oldRef} # ${oldTag}`;
    const afterPinned = `${repo}@${newSha} # ${newTag}`;
    if (content.includes(beforePinned)) {
      content = content.replaceAll(beforePinned, afterPinned);
      changed = true;
    }

    // Replace tag-based format (pin it)
    const beforeTag = `${repo}@${oldRef}`;
    const afterTag = `${repo}@${newSha} # ${newTag}`;
    // Only replace exact tag refs (not already-pinned sha refs)
    if (oldRef === oldTag && content.includes(beforeTag)) {
      // Make sure we're not replacing inside a sha-pinned line
      const tagLineRe = new RegExp(
        `(uses:\\s{1,10})${repo.replace(/\//g, '\\/')}@${oldRef}(?!\\s*#)`,
        'g'
      );
      const newContent = content.replace(tagLineRe, `$1${afterTag}`);
      if (newContent !== content) {
        content = newContent;
        changed = true;
      }
    }
  }

  if (changed) {
    writeFileSync(file, content, 'utf-8');
    filesChanged++;
    console.log(`  updated: ${file.replace(ROOT, '')}`);
  }
}

console.log(`\nUpdated ${updates.size} action(s) across ${filesChanged} file(s).`);
