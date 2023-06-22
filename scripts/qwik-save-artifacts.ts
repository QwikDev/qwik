import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const token = process.env.QWIK_API_TOKEN_GITHUB;
const root = join(__dirname, '..');
const srcRepoRef = 'https://github.com/BuilderIO/qwik/commit/';

(async () => {
  const finishQwik = await prepare({
    buildRepo: 'qwik-build',
    artifactsDir: join(root, 'packages', 'qwik', 'dist'),
  });
  const finishQwikCity = await prepare({
    buildRepo: 'qwik-city-build',
    artifactsDir: join(root, 'packages', 'qwik-city', 'lib'),
  });
  const finishCreateQwikCli = await prepare({
    buildRepo: 'qwik-create-cli-build',
    artifactsDir: join(root, 'packages', 'create-qwik', 'dist'),
  });
  const finishQwikLabs = await prepare({
    buildRepo: 'qwik-labs-build',
    artifactsDir: join(root, 'packages', 'qwik-labs'),
  });
  await finishQwik();
  await finishQwikCity();
  await finishCreateQwikCli();
  await finishQwikLabs();
})();

async function prepare({ buildRepo, artifactsDir }: { buildRepo: string; artifactsDir: string }) {
  if (!existsSync(artifactsDir)) {
    // if no artifacts, then nothing to do.
    console.log('No artifacts to save. (no artifacts found at ' + artifactsDir);
    return () => null;
  }
  console.log(
    'preparing to save artifacts from ' + artifactsDir + ' into BuilderIO/' + buildRepo + ' repo.'
  );
  const buildRepoDir = join(root, 'dist-dev', buildRepo);
  const repo = token
    ? `https://${token}:x-oauth-basic@github.com/BuilderIO/${buildRepo}.git`
    : `git@github.com:BuilderIO/${buildRepo}.git`;

  await $('rm', '-rf', buildRepoDir);
  const SHA = await $('git', 'rev-parse', 'HEAD');
  await mkdir(join(root, 'dist-dev'), {
    recursive: true,
  });
  $chdir(join(root, 'dist-dev'));
  const branch = await $('git', 'branch', '--show-current');
  const msg = await $('git', 'log', '--oneline', '-1', '--no-decorate');
  const userName = await $('git', 'log', '-1', "--pretty=format:'%an'");
  const userEmail = await $('git', 'log', '-1', "--pretty=format:'%ae'");
  try {
    // first try to get the specific branch only
    await $('git', 'clone', '--depth=1', '--branch=' + branch, repo);
    $chdir(buildRepoDir);
    await $('rm', '-rf', ...(await expand(buildRepoDir)));
  } catch (e) {
    // Specific branch not found, so create empty repository.
    await $('mkdir', buildRepoDir);
    $chdir(buildRepoDir);
    await $('git', 'init');
    await $('git', 'remote', 'add', 'origin', repo);
    await $('git', 'checkout', '-b', branch);
  }

  await $('cp', '-r', ...(await expand(artifactsDir)), buildRepoDir);
  await $('git', 'add', '--all');
  await $(
    'git',
    '-c',
    `user.name=${userName}`,
    '-c',
    `user.email=${userEmail}`,
    'commit',
    '--allow-empty',
    '-m',
    msg + '\n\n' + srcRepoRef + SHA
  );
  const dstSHA = await $('git', 'rev-parse', 'HEAD');
  console.log('##############################################################');
  console.log('##############################################################');
  console.log(`### ${artifactsDir} => BuilderIO/${buildRepo}`);
  console.log(`### ${srcRepoRef}/${dstSHA}`);
  console.log('##############################################################');
  console.log('##############################################################');
  const cwd = process.cwd();
  return async () => {
    process.chdir(cwd);
    console.log('PUSHING:', repo, `HEAD:${branch}`, 'in', cwd);
    await $('git', 'push', repo, `HEAD:${branch}`);
    await $('rm', '-rf', buildRepoDir);
  };
}

function $chdir(path: string) {
  console.log('CHDIR:', path);
  process.chdir(path);
}

async function $(cmd: string, ...args: string[]): Promise<string> {
  console.log('EXEC:', cmd, ...args);
  const { stdout } = await execa(cmd, args);
  const output = String(stdout).trim();
  console.log('     ', output);
  return output;
}

async function expand(path: string): Promise<string[]> {
  const { stdout } = await execa('ls', ['-a', path]);
  const paths = String(stdout)
    .split('\n')
    .filter((v) => v !== '.' && v !== '..' && v !== '.git')
    .map((file) => path + '/' + file.trim());
  return paths;
}
