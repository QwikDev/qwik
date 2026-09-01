/**
 * Publishes changesets releases under the `latest` dist-tag, except packages whose npm names are
 * shared with Qwik v1 — those stay on `beta` so that v1 users installing by `latest` keep getting
 * the v1 line.
 *
 * Delete this script (use plain `changeset publish`) once v2 final is out.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const v1SharedNameManifests = [
  'packages/eslint-plugin-qwik/package.json',
  'packages/create-qwik/package.json',
  'packages/supabase-auth-helpers-qwik/package.json',
];

const run = (command) => {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
};
const publish = (tag) => {
  const command = `pnpm changeset publish --tag ${tag}`;
  if (process.env.RELEASE_DRY_RUN) {
    console.log(`[dry-run] ${command}`);
    return;
  }
  run(command);
};

// `changeset publish` forbids --tag in pre mode; exit it in the working tree
// only (the committed pre.json keeps versioning on 2.x.y-beta.N).
if (existsSync('.changeset/pre.json')) {
  run('pnpm changeset pre exit');
}

// Hide the v1-named packages from the `latest` pass by marking them private.
const savedManifests = new Map(
  v1SharedNameManifests.map((path) => [path, readFileSync(path, 'utf8')])
);
for (const [path, source] of savedManifests) {
  writeFileSync(path, JSON.stringify({ private: true, ...JSON.parse(source) }, null, 2));
}
// The two passes are independent; a failure in one must not block the other.
let latestError;
try {
  publish('latest');
} catch (error) {
  latestError = error;
} finally {
  for (const [path, source] of savedManifests) {
    writeFileSync(path, source);
  }
}
publish('beta');
if (latestError) {
  throw latestError;
}
