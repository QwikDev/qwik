/* eslint-disable no-console */
import color from 'kleur';
import type { AppCommand } from '../utils/app-command';
import { execa, ExecaReturnValue } from 'execa';

export async function runBuildCommand(app: AppCommand) {
  const pkgJsonScripts = app.packageJson.scripts;
  if (!pkgJsonScripts) {
    throw new Error(`No "scripts" property found in package.json`);
  }

  const typecheckScript = pkgJsonScripts.typecheck;
  const buildClientScript = pkgJsonScripts['build.client'];
  const buildServerScript = pkgJsonScripts['build.server'];
  const buildStaticScript = pkgJsonScripts['build.static'];

  const scripts = [typecheckScript, buildClientScript, buildServerScript, buildStaticScript]
    .filter(s => typeof s === 'string' && s.trim().length > 0);

  if (!buildClientScript) {
    throw new Error(`"build.client" script not found in package.json`);
  }

  console.log(``);
  for (const script of scripts) {
    console.log(color.dim(script));
  }
  console.log(``);
  
  let typecheck: Promise<ExecaReturnValue<string>> | null = null;

  if (typecheckScript && typecheckScript.startsWith('tsc')) {
    const tscScript = parseScript(typecheckScript);
    if (!tscScript.flags.includes('--pretty')) {
      // ensures colors flow throw when we console log the stdout
      tscScript.flags.push('--pretty');
    }
    typecheck = execa(tscScript.cmd, tscScript.flags, {
      cwd: app.rootDir
    }).catch((e) => {
      let out = e.stdout;
      if (out.startsWith('tsc')) {
        out = out.slice(3);
      }
      console.log('\n' + out);
      process.exit(1);
    });
  }
 
  const clientScript = parseScript(buildClientScript);
  const clientBuild = execa(clientScript.cmd, clientScript.flags, {
    stdio: 'inherit',
    cwd: app.rootDir
  }).catch(() => {
    process.exit(1);
  });
 
  await clientBuild;

  console.log(``);
  console.log(`${color.green('✓')} Built client modules`);

  const step2: Promise<ExecaReturnValue<string>>[] = [];

  if (buildServerScript) {
    const serverScript = parseScript(buildServerScript);
    const serverBuild = execa(serverScript.cmd, serverScript.flags, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true'
      }
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
    step2.push(serverBuild);  
  }

  if (buildStaticScript) {
    const staticScript = parseScript(buildStaticScript);
    const staticBuild = execa(staticScript.cmd, staticScript.flags, {
      cwd: app.rootDir,
      env: {
        FORCE_COLOR: 'true'
      }
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
    step2.push(staticBuild);  
  }

  if (typecheck) {
    step2.push(typecheck);  
  }

  if (step2.length > 0) {
    await Promise.all(step2)
      .then(() => {
        if (buildServerScript) {
          console.log(`${color.green('✓')} Built server (ssr) modules`);
        }
        if (buildStaticScript) {
          console.log(`${color.green('✓')} Built static (ssg) modules`);
        }
        if (typecheck) {
          console.log(`${color.green('✓')} Type checked`);
        }
      });
  }

  console.log(``);
}

function parseScript(s: string) {
  const parts = s.split(' ');
  const cmd = parts[0];
  const flags = parts.slice(1);
  return { cmd, flags };
}