/* eslint-disable no-console */
import { execa, parseCommandString } from 'execa';
import pc from 'picocolors';
import type { AppCommand } from './app-command';
import { getPackageManager, pmRunCmd } from './utils';

interface Step {
  title: string;
  stdout?: string;
}
export async function runBuildCommand(app: AppCommand) {
  const pkgJsonScripts = app.packageJson.scripts;
  if (!pkgJsonScripts) {
    throw new Error(`No "scripts" property found in package.json`);
  }
  const pkgManager = getPackageManager();

  const getScript = (name: string) => {
    if (pkgJsonScripts[name]) {
      return `${pkgManager} run ${name}`;
    }
    return undefined;
  };

  const isPreviewBuild = app.args.includes('preview');
  const buildLibScript = getScript('build.lib');
  const isLibraryBuild = !!buildLibScript;
  const buildClientScript = getScript('build.client');
  const buildPreviewScript = isPreviewBuild ? getScript('build.preview') : undefined;
  const buildServerScript = !isPreviewBuild ? getScript('build.server') : undefined;
  const buildStaticScript = getScript('build.static');
  const runSsgScript = getScript('ssg');
  const buildTypes = getScript('build.types');
  const lint = getScript('lint');
  const mode = app.getArg('mode');

  const prebuildScripts = Object.keys(pkgJsonScripts)
    .filter((s) => s.startsWith('prebuild.'))
    .map(getScript)
    .filter(isString);

  const postbuildScripts = Object.keys(pkgJsonScripts)
    .filter((s) => s.startsWith('postbuild.'))
    .map(getScript)
    .filter(isString);

  const scripts = [
    buildTypes,
    buildClientScript,
    buildLibScript,
    buildPreviewScript,
    buildServerScript,
    buildStaticScript,
    lint,
  ].filter(isString);

  if (!isLibraryBuild && !buildClientScript) {
    console.log(pkgJsonScripts);
    throw new Error(`"build.client" script not found in package.json`);
  }

  if (isPreviewBuild && !buildPreviewScript && !buildStaticScript) {
    throw new Error(
      `Neither "build.preview" or "build.static" script found in package.json for preview`
    );
  }

  console.log(``);
  for (let i = 0; i < prebuildScripts.length; i++) {
    const script = prebuildScripts[i];
    console.log(pc.dim(script!));
  }
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    console.log(pc.dim(script!));
  }
  for (let i = 0; i < postbuildScripts.length; i++) {
    const script = postbuildScripts[i];
    console.log(pc.dim(script!));
  }
  console.log(``);

  let typecheck: Promise<Step> | null = null;
  const buildTypesCmd = buildTypes
    ? buildTypes.includes('--pretty')
      ? buildTypes
      : // ensures colors flow throw when we console log the stdout
        `${buildTypes} --pretty`
    : null;

  const runTypecheck = (): Promise<Step> =>
    execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
    })`${parseCommandString(buildTypesCmd!)}`
      .then(() => ({
        title: 'Type checked',
      }))
      .catch((e) => {
        let out = e.stdout || '';
        if (out.startsWith('tsc')) {
          out = out.slice(3);
        }
        console.log('\n' + out);
        process.exitCode = 1;
        throw new Error(`Type check failed: ${out}`);
      });

  for (let i = 0; i < prebuildScripts.length; i++) {
    const script = prebuildScripts[i];
    try {
      await execa({
        cwd: app.rootDir,
        stdout: 'inherit',
        stderr: 'inherit',
        env: {
          FORCE_COLOR: 'true',
        },
      })`${parseCommandString(script)}`;
    } catch (e) {
      console.error(script, 'failed');
      process.exitCode = 1;
      throw e;
    }
  }

  // For library builds we defer the typecheck until after `build.lib`
  // finishes — vite empties `outDir` (typically `lib/`) at the start of
  // its build, which races with tsc's `.d.ts` emit into the same dir
  // and silently wipes the freshly written declarations.
  if (buildTypesCmd && !buildLibScript) {
    typecheck = runTypecheck();
  }

  if (buildClientScript) {
    const script = attachArg(buildClientScript, 'mode', mode);
    await execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
    })`${parseCommandString(script)}`.catch((error) => {
      process.exitCode = 1;
      throw new Error(`Client build failed: ${error}`);
    });

    console.log(``);
    console.log(`${pc.cyan('✓')} Built client modules`);
  }

  const step2: Promise<Step>[] = [];

  if (buildLibScript) {
    const script = attachArg(buildLibScript, 'mode', mode);
    const libBuild = execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })`${parseCommandString(script)}`
      .then((e) => ({
        title: 'Built library modules',
        stdout: e.stdout,
      }))
      .catch((e) => {
        console.log(``);
        if (e.stderr) {
          console.log(e.stderr);
        } else {
          console.log(e.stdout);
        }
        console.log(``);
        process.exitCode = 1;
        throw e;
      });
    step2.push(libBuild);

    if (buildTypesCmd) {
      step2.push(libBuild.then(() => runTypecheck()));
    }
  }

  if (buildPreviewScript) {
    const script = attachArg(buildPreviewScript, 'mode', mode);
    const previewBuild = execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })`${parseCommandString(script)}`
      .then((e) => ({
        title: 'Built preview (ssr) modules',
        stdout: e.stdout,
      }))
      .catch((e) => {
        console.log(``);
        if (e.stderr) {
          console.log(e.stderr);
        } else {
          console.log(e.stdout);
        }
        console.log(``);
        process.exitCode = 1;
        throw e;
      });
    step2.push(previewBuild);
  }

  if (buildServerScript) {
    const script = attachArg(buildServerScript, 'mode', mode);
    const serverBuild = execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })`${parseCommandString(script)}`
      .then((e) => ({
        title: 'Built server (ssr) modules',
        stdout: e.stdout,
      }))
      .catch((e) => {
        console.log(``);
        if (e.stderr) {
          console.log(e.stderr);
        } else {
          console.log(e.stdout);
        }
        console.log(``);
        process.exitCode = 1;
        throw e;
      });
    step2.push(serverBuild);
  }

  if (buildStaticScript) {
    const staticBuild = execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })`${parseCommandString(buildStaticScript)}`
      .then((e) => ({
        title: 'Built static (ssg) modules',
        stdout: e.stdout,
      }))
      .catch((e) => {
        console.log(``);
        if (e.stderr) {
          console.log(e.stderr);
        } else {
          console.log(e.stdout);
        }
        console.log(``);
        process.exitCode = 1;
        throw e;
      });
    step2.push(staticBuild);
  }

  if (typecheck) {
    step2.push(typecheck);
  }

  if (lint) {
    const lintBuild = execa({
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })`${parseCommandString(lint)}`
      .then(() => ({
        title: 'Lint checked',
      }))
      .catch((e) => {
        console.log(``);
        console.log(e.stdout);
        console.error(e.stderr);
        console.log(``);
        process.exitCode = 1;
        throw e;
      });
    step2.push(lintBuild);
  }

  if (step2.length > 0) {
    await Promise.all(step2)
      .then((steps) => {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (step.stdout) {
            console.log('');
            console.log(step.stdout);
          }
          console.log(`${pc.cyan('✓')} ${step.title}`);
        }

        if (!isPreviewBuild && !buildServerScript && !buildStaticScript && !isLibraryBuild) {
          const pmRun = pmRunCmd();
          console.log(``);
          console.log(`${pc.bgMagenta(' Missing an integration ')}`);
          console.log(``);
          console.log(
            `${pc.magenta('・')} Use ${pc.magenta(pmRun + ' qwik add')} to add an integration`
          );
          console.log(
            `${pc.magenta('・')} Use ${pc.magenta(pmRun + ' preview')} to preview the build`
          );
        }

        if (isPreviewBuild && buildStaticScript && runSsgScript) {
          return execa({
            stdout: 'inherit',
            stderr: 'inherit',
            cwd: app.rootDir,
            env: {
              FORCE_COLOR: 'true',
            },
          })`${parseCommandString(buildStaticScript)}`.catch((e) => {
            console.log(``);
            if (e.stderr) {
              console.log(e.stderr);
            } else {
              console.log(e.stdout);
            }
            console.log(``);
            process.exitCode = 1;
          });
        }
      })
      .catch((error) => console.log(pc.red(error)));
  }

  for (let i = 0; i < postbuildScripts.length; i++) {
    const script = postbuildScripts[i];
    try {
      await execa({
        stdout: 'inherit',
        stderr: 'inherit',
        cwd: app.rootDir,
        env: {
          FORCE_COLOR: 'true',
        },
      })`${parseCommandString(script)}`;
    } catch (e) {
      console.error(script, 'failed');
      process.exitCode = 1;
      throw e;
    }
  }

  console.log(``);
}

function attachArg(command: string, key: string, value?: string): string {
  if (value !== undefined) {
    return `${command} --${key} ${value}`;
  }
  return command;
}

function isString(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}
