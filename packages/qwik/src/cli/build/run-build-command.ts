/* eslint-disable no-console */
import color from 'kleur';
import type { AppCommand } from '../utils/app-command';
import { execa } from 'execa';
import { pmRunCmd } from '../utils/utils';
interface Step {
  title: string;
  stdout?: string;
}
export async function runBuildCommand(app: AppCommand) {
  const pkgJsonScripts = app.packageJson.scripts;
  if (!pkgJsonScripts) {
    throw new Error(`No "scripts" property found in package.json`);
  }

  const isPreviewBuild = app.args.includes('preview');
  const buildLibScript = pkgJsonScripts['build.lib'];
  const isLibraryBuild = !!buildLibScript;
  const buildClientScript = pkgJsonScripts['build.client'];
  const buildPreviewScript = isPreviewBuild ? pkgJsonScripts['build.preview'] : undefined;
  const buildServerScript = !isPreviewBuild ? pkgJsonScripts['build.server'] : undefined;
  const buildStaticScript = pkgJsonScripts['build.static'];
  const runSsgScript = pkgJsonScripts['ssg'];
  const buildTypes = pkgJsonScripts['build.types'];
  const lint = pkgJsonScripts['lint'];

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
    const tscScript = parseScript(buildTypes);
    if (!tscScript.flags.includes('--pretty')) {
      // ensures colors flow throw when we console log the stdout
      tscScript.flags.push('--pretty');
    }
    typecheck = execa(tscScript.cmd, tscScript.flags, {
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
    const clientScript = parseScript(buildClientScript);
    await execa(clientScript.cmd, clientScript.flags, {
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
    const libScript = parseScript(buildLibScript);
    const libBuild = execa(libScript.cmd, libScript.flags, {
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
    const previewScript = parseScript(buildPreviewScript);
    const previewBuild = execa(previewScript.cmd, previewScript.flags, {
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
    const serverScript = parseScript(buildServerScript);
    const serverBuild = execa(serverScript.cmd, serverScript.flags, {
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
    const staticScript = parseScript(buildStaticScript);
    const staticBuild = execa(staticScript.cmd, staticScript.flags, {
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
    const lintScript = parseScript(lint);
    const lintBuild = execa(lintScript.cmd, lintScript.flags, {
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
        const ssgScript = parseScript(buildStaticScript);
        return execa(ssgScript.cmd, ssgScript.flags, {
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

function parseScript(s: string) {
  const flags = s.split(' ');
  const cmd = flags.shift()!;
  return { cmd, flags };
}
