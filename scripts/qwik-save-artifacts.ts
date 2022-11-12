import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const token = process.env.API_TOKEN_GITHUB;
const root = __dirname + '/..';
const srcRepoRef = 'https://github.com/BuilderIO/qwik/commit/';

(async () => {
  const finishQwik = await prepare({
    buildRepo: 'qwik-build',
    artifactsDir: root + '/packages/qwik/dist',
  });
  const finishQwikCity = await prepare({
    buildRepo: 'qwik-city-build',
    artifactsDir: root + '/packages/qwik-city/lib',
  });
  await finishQwik();
  await finishQwikCity();
})();

async function prepare({ buildRepo, artifactsDir }: { buildRepo: string; artifactsDir: string }) {
  if (!existsSync(artifactsDir)) {
    // if no artifacts, then nothing to do.
    return () => null;
  }
  const buildRepoDir = root + '/dist-dev/' + buildRepo;
  const repo = token
    ? `https://${token}:x-oauth-basic@github.com/BuilderIO/${buildRepo}.git`
    : `git@github.com:BuilderIO/${buildRepo}.git`;

  await $('rm', '-rf', buildRepoDir);
  const SHA = await $('git', 'rev-parse', 'HEAD');
  await mkdir(`${root}/dist-dev`, {
    recursive: true,
  });
  process.chdir(`${root}/dist-dev`);
  await $('git', 'clone', repo);
  const branch = await $('git', 'branch', '--show-current');
  const msg = await $('git', 'log', '--oneline', '-1', '--no-decorate');
  const userName = await $('git', 'log', '-1', "--pretty=format:'%an'");
  const userEmail = await $('git', 'log', '-1', "--pretty=format:'%ae'");

  process.chdir(`${buildRepoDir}`);
  try {
    await $('git', 'checkout', branch);
  } catch (e) {
    await $('git', 'checkout', '-b', branch);
  }
  await $('rm', '-rf', ...(await expand(buildRepoDir)));
  await $('cp', '-r', ...(await expand(artifactsDir)), buildRepoDir);
  process.chdir(`${buildRepoDir}`);
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
  console.log(`### ${srcRepoRef}/${dstSHA}`);
  console.log('##############################################################');
  console.log('##############################################################');
  return async () => {
    await $('git', 'push', repo, `HEAD:${branch}`);
    await $('rm', '-rf', buildRepoDir);
  };
}

async function $(cmd: string, ...args: string[]): Promise<string> {
  console.log('EXEC:', cmd, ...args);
  const { stdout } = await execa(cmd, args);
  const output = String(stdout).trim();
  console.log('     ', output);
  return output;
}

async function expand(path: string): Promise<string[]> {
  const { stdout } = await execa('ls', [path]);
  const paths = String(stdout)
    .split('\n')
    .map((file) => path + '/' + file.trim());
  return paths;
}
