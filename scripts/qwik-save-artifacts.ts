import { execa } from 'execa';
import { mkdir } from 'fs/promises';

const token = process.env.API_TOKEN_GITHUB;
const repo = `https://${token}:x-oauth-basic@github.com/BuilderIO/qwik-build.git`;
const srcRepoRef = 'https://github.com/BuilderIO/qwik/commit/';
const root = __dirname + '/..';
const qwik_build_artifacts = root + '/dist-dev/qwik-build';
const qwik_package = root + '/packages/qwik/dist';

(async () => {
  await $('rm', '-rf', qwik_build_artifacts);
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

  process.chdir(`${qwik_build_artifacts}`);
  try {
    await $('git', 'checkout', branch);
  } catch (e) {
    await $('git', 'checkout', '-b', branch);
  }
  await $('rm', '-rf', ...(await expand(qwik_build_artifacts)));
  await $('cp', '-r', ...(await expand(qwik_package)), qwik_build_artifacts);
  process.chdir(`${qwik_build_artifacts}`);
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
  console.log(`### https://github.com/BuilderIO/qwik-build/commit/${dstSHA}`);
  console.log('##############################################################');
  console.log('##############################################################');
  await $('git', 'push', repo, `HEAD:${branch}`);
  await $('rm', '-rf', qwik_build_artifacts);
})();

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
