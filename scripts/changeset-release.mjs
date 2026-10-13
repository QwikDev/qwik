/**
 * Publishes changesets releases under the `latest` dist-tag, except packages whose npm names are
 * shared with Qwik v1 — those go to `rc` so that v1 users installing by `latest` keep getting the
 * v1 line.
 *
 * Delete this script (use plain `changeset publish`) once v2 final is out.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const v1SharedNameManifests = [
  'packages/eslint-plugin-qwik/package.json',
  'packages/create-qwik/package.json',
  'packages/supabase-auth-helpers-qwik/package.json',
];
const v2OnlyNameManifests = readdirSync('packages')
  .map((dir) => `packages/${dir}/package.json`)
  .filter((path) => existsSync(path) && !v1SharedNameManifests.includes(path));

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
// only (the committed pre.json keeps versioning on 2.x.y-rc.N).
if (existsSync('.changeset/pre.json')) {
  run('pnpm changeset pre exit');
}

// Hide the other pass's packages: npm may still report them unpublished.
const publishWithout = (hiddenManifests, tag) => {
  const savedManifests = new Map(hiddenManifests.map((path) => [path, readFileSync(path, 'utf8')]));
  for (const [path, source] of savedManifests) {
    writeFileSync(path, JSON.stringify({ ...JSON.parse(source), private: true }, null, 2));
  }
  try {
    publish(tag);
  } finally {
    for (const [path, source] of savedManifests) {
      writeFileSync(path, source);
    }
  }
};

// The two passes are independent; a failure in one must not block the other.
let latestError;
try {
  publishWithout(v1SharedNameManifests, 'latest');
} catch (error) {
  latestError = error;
}
publishWithout(v2OnlyNameManifests, 'rc');
if (latestError) {
  throw latestError;
}
