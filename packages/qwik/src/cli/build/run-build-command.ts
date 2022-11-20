/* eslint-disable no-console */
import color from 'kleur';
import type { AppCommand } from '../utils/app-command';
import { execaCommand } from 'execa';
import { getPackageManager, pmRunCmd } from '../utils/utils';
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

  const scripts = [
    buildTypes,
    buildClientScript,
    buildLibScript,
    buildPreviewScript,
    buildServerScript,
    buildStaticScript,
    lint,
  ].filter((s) => typeof s === 'string' && s.trim().length > 0)!;

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
  for (const script of scripts) {
    console.log(color.dim(script!));
  }
  console.log(``);

  let typecheck: Promise<Step> | null = null;

  if (buildTypes && buildTypes.startsWith('tsc')) {
    let copyScript = buildTypes;
    if (!copyScript.includes('--pretty')) {
      // ensures colors flow throw when we console log the stdout
      copyScript += ' --pretty';
    }
    typecheck = execaCommand(copyScript, {
      cwd: app.rootDir,
    })
    .then(() => ({
      title: 'Type checked',
    }))
    .catch((e) => {
      let out = e.stdout;
      if (out.startsWith('tsc')) {
        out = out.slice(3);
      }
      console.log('\n' + out);
      process.exit(1);
    });
  }

  if (buildClientScript) {
    await execaCommand(buildClientScript, {
      stdio: 'inherit',
      cwd: app.rootDir,
    }).catch(() => {
      process.exit(1);
    });

    console.log(``);
    console.log(`${color.cyan('✓')} Built client modules`);
  }

  const step2: Promise<Step>[] = [];

  if (buildLibScript) {
    const libBuild = execaCommand(buildLibScript, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
    .then(e => ({
      title: 'Built library modules',
      stdout: e.stdout
    }))
    .catch((e) => {
      console.log(``);
      if (e.stderr) {
        console.log(e.stderr);
      } else {
        console.log(e.stdout);
      }
      console.log(``);
      process.exit(1);
    });
    step2.push(libBuild);
  }

  if (buildPreviewScript) {
    const previewBuild = execaCommand(buildPreviewScript, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
    .then(e => ({
      title: 'Built preview (ssr) modules',
      stdout: e.stdout
    }))
    .catch((e) => {
      console.log(``);
      if (e.stderr) {
        console.log(e.stderr);
      } else {
        console.log(e.stdout);
      }
      console.log(``);
      process.exit(1);
    });
    step2.push(previewBuild);
  }

  if (buildServerScript) {
    const serverBuild = execaCommand(buildServerScript, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
    .then(e => ({
      title: 'Built server (ssr) modules',
      stdout: e.stdout
    }))
    .catch((e) => {
      console.log(``);
      if (e.stderr) {
        console.log(e.stderr);
      } else {
        console.log(e.stdout);
      }
      console.log(``);
      process.exit(1);
    });
    step2.push(serverBuild);
  }

  if (buildStaticScript) {
    const staticBuild = execaCommand(buildStaticScript, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true',
      },
    })
    .then(e => ({
      title: 'Built static (ssg) modules',
      stdout: e.stdout
    }))
    .catch((e) => {
      console.log(``);
      if (e.stderr) {
        console.log(e.stderr);
      } else {
        console.log(e.stdout);
      }
      console.log(``);
      process.exit(1);
    });
    step2.push(staticBuild);
  }

  if (typecheck) {
    step2.push(typecheck);
  }

  if (lint) {
    const lintBuild = execaCommand(lint, {
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
      if (e.stderr) {
        console.log(e.stderr);
      } else {
        console.log(e.stdout);
      }
      console.log(``);
      process.exit(1);
    });
    step2.push(lintBuild);
  }

  if (step2.length > 0) {
    await Promise.all(step2).then((steps) => {
      steps.forEach(step => {
        if (step.stdout) {
          console.log('');
          console.log(step.stdout);
        }
        console.log(`${color.cyan('✓')} ${step.title}`);
      });

      if (!isPreviewBuild && !buildServerScript && !buildStaticScript && !isLibraryBuild) {
        const pmRun = pmRunCmd()
        console.log(``);
        console.log(`${color.bgMagenta(' Missing an integration ')}`);
        console.log(``);
        console.log(`${color.magenta('・')} Use ${color.magenta(pmRun + ' qwik add')} to add an integration`);
        console.log(`${color.magenta('・')} Use ${color.magenta(pmRun + ' preview')} to preview the build`);
      }

      if (isPreviewBuild && buildStaticScript && runSsgScript) {
        return execaCommand(buildStaticScript, {
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
          process.exit(1);
        });
      }
    });
  }

  console.log(``);
}

