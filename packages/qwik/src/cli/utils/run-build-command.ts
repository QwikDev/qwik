/* eslint-disable no-console */
import { execaCommand } from 'execa';
import { bgMagenta, cyan, dim, magenta, red } from 'kleur/colors';
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
  for (const script of prebuildScripts) {
    console.log(dim(script!));
  }
  for (const script of scripts) {
    console.log(dim(script!));
  }
  for (const script of postbuildScripts) {
    console.log(dim(script!));
  }
  console.log(``);

  let typecheck: Promise<Step> | null = null;

  for (const script of prebuildScripts) {
    try {
      await execaCommand(script, {
        cwd: app.rootDir,
        stdout: 'inherit',
        stderr: 'inherit',
        env: {
          FORCE_COLOR: 'true',
        },
      });
    } catch (e) {
      console.error(script, 'failed');
      process.exitCode = 1;
      throw e;
    }
  }

  if (buildTypes) {
    let copyScript = buildTypes;
    if (!copyScript.includes('--pretty')) {
      // ensures colors flow throw when we console log the stdout
      copyScript += ' --pretty';
    }
    typecheck = execaCommand(copyScript, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
    })
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
  }

  if (buildClientScript) {
    const script = attachArg(buildClientScript, 'mode', mode);
    await execaCommand(script, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
    }).catch((error) => {
      process.exitCode = 1;
      throw new Error(`Client build failed: ${error}`);
    });

    console.log(``);
    console.log(`${cyan('✓')} Built client modules`);
  }

  const step2: Promise<Step>[] = [];

  if (buildLibScript) {
    const script = attachArg(buildLibScript, 'mode', mode);
    const libBuild = execaCommand(script, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
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
  }

  if (buildPreviewScript) {
    const script = attachArg(buildPreviewScript, 'mode', mode);
    const previewBuild = execaCommand(script, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
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
    const serverBuild = execaCommand(script, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
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
    const staticBuild = execaCommand(buildStaticScript, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
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
    const lintBuild = execaCommand(lint, {
      stdout: 'inherit',
      stderr: 'inherit',
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
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
        steps.forEach((step) => {
          if (step.stdout) {
            console.log('');
            console.log(step.stdout);
          }
          console.log(`${cyan('✓')} ${step.title}`);
        });

        if (!isPreviewBuild && !buildServerScript && !buildStaticScript && !isLibraryBuild) {
          const pmRun = pmRunCmd();
          console.log(``);
          console.log(`${bgMagenta(' Missing an integration ')}`);
          console.log(``);
          console.log(`${magenta('・')} Use ${magenta(pmRun + ' qwik add')} to add an integration`);
          console.log(`${magenta('・')} Use ${magenta(pmRun + ' preview')} to preview the build`);
        }

        if (isPreviewBuild && buildStaticScript && runSsgScript) {
          return execaCommand(buildStaticScript, {
            stdout: 'inherit',
            stderr: 'inherit',
            cwd: app.rootDir,
            env: {
              FORCE_COLOR: 'true',
            },
          }).catch((e) => {
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
      .catch((error) => console.log(red(error)));
  }

  for (const script of postbuildScripts) {
    try {
      await execaCommand(script, {
        stdout: 'inherit',
        stderr: 'inherit',
        cwd: app.rootDir,
        env: {
          FORCE_COLOR: 'true',
        },
      });
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
