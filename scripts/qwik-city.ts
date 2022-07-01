import { BuildConfig, panic, run, watcher } from './util';
import { build } from 'esbuild';
import { join } from 'path';
import { readPackageJson, writePackageJson } from './package-json';
import { checkExistingNpmVersion, releaseVersionPrompt } from './release';
import semver from 'semver';
import mri from 'mri';
import { execa } from 'execa';

const PACKAGE = 'qwik-city';

export async function buildQwikCity(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);
  const output = join(input, 'lib');

  await Promise.all([
    buildVite(config, input, output),
    buildCloudflarePages(config, input, output),
    buildExpress(config, input, output),
  ]);

  await buildRuntime(config, input);

  const loaderPkg = {
    ...(await readPackageJson(input)),
    main: './index.qwik.cjs',
    module: './index.qwik.mjs',
    qwik: './index.qwik.mjs',
    types: './index.d.ts',
    exports: {
      '.': {
        import: './index.qwik.mjs',
        require: './index.qwik.cjs',
      },
      './middleware/cloudflare-pages': {
        import: './middleware/cloudflare-pages/index.mjs',
      },
      './middleware/express': {
        import: './middleware/express/index.mjs',
        require: './middleware/express/index.cjs',
      },
      './vite': {
        import: './vite/index.mjs',
        require: './vite/index.cjs',
      },
    },
    private: false,
    publishConfig: {
      access: 'public',
    },
    files: ['index.d.ts', 'index.qwik.mjs', 'index.qwik.cjs', 'modules.d.ts', 'middleware', 'vite'],
    devDependencies: undefined,
    scripts: undefined,
  };
  await writePackageJson(output, loaderPkg);

  console.log(`🏙  ${PACKAGE}`);
}

async function buildRuntime(config: BuildConfig, input: string) {
  const result = await execa('yarn', ['build.runtime'], {
    stdout: 'inherit',
    cwd: input,
  });
  if (result.failed) {
    panic(`tsc failed`);
  }
}

async function buildVite(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'buildtime', 'vite', 'index.ts')];

  const external = ['source-map', 'vfile', '@mdx-js/mdx'];

  await build({
    entryPoints,
    outfile: join(output, 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}

async function buildCloudflarePages(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'middleware', 'cloudflare-pages', 'index.ts')];

  await build({
    entryPoints,
    outfile: join(output, 'middleware', 'cloudflare-pages', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    watch: watcher(config),
  });
}

async function buildExpress(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'middleware', 'express', 'index.ts')];

  const external = ['express', 'path'];

  await build({
    entryPoints,
    outfile: join(output, 'middleware', 'express', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'middleware', 'express', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}

export async function prepareReleaseQwikCity() {
  const pkgRootDir = join(__dirname, '..');
  const pkg = await readPackageJson(pkgRootDir);

  console.log(`⛴ preparing ${pkg.name} ${pkg.version} release`);

  const answers = await releaseVersionPrompt(pkg.name, pkg.version);
  if (!semver.valid(answers.version)) {
    panic(`Invalid version`);
  }

  pkg.version = answers.version;

  await checkExistingNpmVersion(pkg.name, pkg.version);

  await writePackageJson(pkgRootDir, pkg);

  // git add the changed package.json
  const gitAddArgs = ['add', join(pkgRootDir, 'package.json')];
  await run('git', gitAddArgs);

  // git commit the changed package.json
  const commitMessage = `qwik-city ${pkg.version}`;
  const gitCommitArgs = ['commit', '--message', commitMessage];
  await run('git', gitCommitArgs);

  console.log(``);
  console.log(`Next:`);
  console.log(` - Submit a PR to main with the package.json update`);
  console.log(` - Once merged, run the "Release Qwik City" workflow`);
  console.log(` - https://github.com/BuilderIO/qwik/actions/workflows/release-qwik-city.yml`);
  console.log(``);
}

export async function releaseQwikCity() {
  const args = mri(process.argv.slice(2));

  const distTag = args['set-dist-tag'];

  const pkgRootDir = join(__dirname, '..');
  const pkg = await readPackageJson(pkgRootDir);

  console.log(`🚢 publishing ${pkg.name} ${pkg.version}`);

  const npmPublishArgs = ['publish', '--tag', distTag, '--access', 'public'];
  await run('npm', npmPublishArgs, false, false, { cwd: pkgRootDir });
}
