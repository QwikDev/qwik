/* eslint-disable no-console */
import color from 'kleur';
import type { AppCommand } from '../utils/app-command';
import { execa, ExecaReturnValue } from 'execa';
import { readdirSync } from 'fs';
import { join, relative } from 'path';

export async function runBuildCommand(app: AppCommand) {
  const srcFileNames = readdirSync(app.srcDir);

  const step1: Promise<ExecaReturnValue<string>>[] = [];
  const step2: Promise<ExecaReturnValue<string>>[] = [];
  
  console.log(``);
  console.log(color.dim(`tsc --incremental --noEmit`));
  console.log(color.dim(`vite build`));

  const entryServerNames = srcFileNames.filter(f => f === 'entry.server.tsx' || f === 'entry.static.tsx');
  for (const entryServerName of entryServerNames) {
    const entryServerPath = join(app.srcDir, entryServerName);
    console.log(color.dim( `vite build --ssr ${relative(app.rootDir, entryServerPath)}`));
  }
  console.log(``);

  const typecheck = execa('tsc', ['--incremental', '--noEmit', '--pretty']).catch((e) => {
    let out = e.stdout;
    if (out.startsWith('tsc')) {
      out = out.slice(3);
    }
    console.log('\n' + out);
    process.exit(1);
  });
  step1.push(typecheck);
 

  const clientBuild = execa('vite', ['build'], {
    stdio: 'inherit',
  }).catch(() => {
    process.exit(1);
  });
  step1.push(clientBuild);

  await Promise.all(step1).then(() => {
    console.log('');
    console.log(`${color.green('✓')} Type checked source`);
    console.log(`${color.green('✓')} Built client modules`);
  })

  for (const entryServerName of entryServerNames) {
    if (entryServerName === 'entry.server.tsx') {
      const execPath = join(app.srcDir, entryServerName);

      const serverBuild = execa('vite', ['build', '--ssr', execPath])
        .catch((e) => {
          console.log(e.stdout);
          process.exit(1);
        })
        .then((cp) => {
          console.log(`${color.green('✓')} Built server (ssr) modules`);
          return cp;
        });
      step2.push(serverBuild);    
    } else if ( entryServerName === 'entry.static.tsx') {
      const extPath = join(app.srcDir, entryServerName);

      console.log(color.dim(`vite build --ssr ${relative(app.rootDir, extPath)}`));
      
      const staticBuild = execa('vite', ['build', '--ssr', extPath])
        .catch((e) => {
          console.log(e);
          process.exit(1);
        })
        .then((cp) => {
          console.log(`${color.green('✓')} Built static (ssg) modules`);
          return cp;
        });
      step2.push(staticBuild);
    }
  }

  await Promise.all(step2);

  console.log('');
}
