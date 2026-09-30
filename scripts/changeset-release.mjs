/**
 * Publishes changesets releases under the `latest` dist-tag, except packages whose npm names are
 * shared with Qwik v1 — those stay on `beta` so that v1 users installing by `latest` keep getting
 * the v1 line.
 *
 * Delete this script (use plain `changeset publish`) once v2 final is out.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const v1SharedNameManifests = [
  'packages/eslint-plugin-qwik/package.json',
  'packages/create-qwik/package.json',
  'packages/supabase-auth-helpers-qwik/package.json',
];
const v1SharedNames = new Set(v1SharedNameManifests);
const v2NameManifests = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}/package.json`)
  .filter((path) => existsSync(path) && !v1SharedNames.has(path));

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
const publishWithHiddenPackages = (tag, manifests) => {
  const savedManifests = new Map(manifests.map((path) => [path, readFileSync(path, 'utf8')]));
  try {
    for (const [path, source] of savedManifests) {
      writeFileSync(path, JSON.stringify({ ...JSON.parse(source), private: true }, null, 2));
    }
    publish(tag);
  } finally {
    for (const [path, source] of savedManifests) {
      writeFileSync(path, source);
    }
  }
};

// `changeset publish` forbids --tag in pre mode; exit it in the working tree
// only (the committed pre.json keeps versioning on 2.x.y-beta.N).
if (existsSync('.changeset/pre.json')) {
  run('pnpm changeset pre exit');
}

// The two passes are independent; a failure in one must not block the other.
let latestError;
try {
  publishWithHiddenPackages('latest', v1SharedNameManifests);
} catch (error) {
  latestError = error;
}
publishWithHiddenPackages('beta', v2NameManifests);
if (latestError) {
  throw latestError;
}
