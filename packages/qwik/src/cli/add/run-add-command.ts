/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import color from 'kleur';
import { loadIntegrations } from '../utils/integrations';
import { pmRunCmd } from '../utils/utils';
import { runAddInteractive } from './run-add-interactive';
import { updateApp } from './update-app';

export async function runAddCommand(app: AppCommand) {
  const id = app.args[1];
  if (id === 'help') {
    await printAddHelp();
    return;
  }

  if (typeof id === 'string') {
    try {
      const result = await updateApp({
        rootDir: app.rootDir,
        integration: id,
      });
      await result.commit();
      return;
    } catch (e) {
      console.error(`\n❌ ${color.red(String(e))}\n`);
      await printAddHelp();
      process.exit(1);
    }
  }

  await runAddInteractive(app);
}

export async function printAddHelp() {
  const integrations = await loadIntegrations();
  const servers = integrations.filter((i) => i.type === 'server');
  const staticGenerators = integrations.filter((i) => i.type === 'static-generator');
  const features = integrations.filter((i) => i.type === 'feature');
  const pmRun = pmRunCmd();

  console.log(``);
  console.log(`${color.magenta(`${pmRun} qwik add`)} [integration]`);
  console.log(``);

  console.log(`  ${color.cyan('Servers')}`);
  for (const s of servers) {
    console.log(`    ${s.id}  ${color.dim(s.pkgJson.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Static Generator')}`);
  for (const s of staticGenerators) {
    console.log(`    ${s.id}  ${color.dim(s.pkgJson.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Features')}`);
  for (const s of features) {
    console.log(`    ${s.id}  ${color.dim(s.pkgJson.description)}`);
  }
  console.log(``);
}
