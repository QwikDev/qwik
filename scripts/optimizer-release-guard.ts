import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  CORE_PACKAGE,
  OPTIMIZER_PACKAGE,
  getChangedFiles,
  getOptimizerChangedFiles,
} from './optimizer-change-utils.ts';

async function main() {
  const changedFiles = await getChangedFiles();
  const optimizerFiles = getOptimizerChangedFiles(changedFiles);

  if (optimizerFiles.length === 0) {
    console.log('No optimizer package changes detected.');
    return;
  }

  const changedChangesets = changedFiles.filter(
    (file) =>
      file.status !== 'removed' &&
      file.filename.startsWith('.changeset/') &&
      file.filename.endsWith('.md')
  );

  const releaseEntries = await Promise.all(changedChangesets.map(readChangesetReleaseEntries));
  const releasedPackages = new Set(releaseEntries.flat());
  // Core imports @qwik.dev/optimizer at runtime and pnpm rewrites workspace:* to the packed
  // optimizer version. If optimizer code changes without releasing both packages, a new core can
  // still install the old published optimizer.
  const hasOptimizer = releasedPackages.has(OPTIMIZER_PACKAGE);
  const hasCore = releasedPackages.has(CORE_PACKAGE);

  if (hasOptimizer && hasCore) {
    console.log(
      `Optimizer changes include release metadata for ${OPTIMIZER_PACKAGE} and ${CORE_PACKAGE}.`
    );
    return;
  }

  const missing = [!hasOptimizer ? OPTIMIZER_PACKAGE : null, !hasCore ? CORE_PACKAGE : null].filter(
    Boolean
  );

  throw new Error(
    [
      `Optimizer package files changed, but missing changeset release entries for: ${missing.join(
        ', '
      )}.`,
      '',
      'Add a .changeset/*.md file that releases both packages so core previews/releases',
      'depend on the matching optimizer version.',
      '',
      'Optimizer files:',
      ...optimizerFiles.map((file) => `  - ${file.filename}`),
    ].join('\n')
  );
}

async function readChangesetReleaseEntries(file: { filename: string }) {
  if (!existsSync(file.filename)) {
    return [];
  }
  const content = await readFile(file.filename, 'utf-8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    return [];
  }

  const releases: string[] = [];
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = line.match(/^['"]?([^'":]+(?:\/[^'":]+)?)['"]?\s*:/);
    if (match) {
      releases.push(match[1]);
    }
  }
  return releases;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
