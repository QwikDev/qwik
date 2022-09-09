/* eslint-disable no-console */
import type { AppCommand } from './app-command';
import color from 'kleur';
import prompts from 'prompts';
import { loadStarterData } from './starters';
import { updateApp } from './update-app';

export async function runAddCommand(app: AppCommand) {
  const id = app.args[1];
  if (id === 'help') {
    await printAddHelp();
    return;
  }

  if (typeof id === 'string') {
    try {
      await updateApp({
        rootDir: app.rootDir,
        addIntegration: id,
      });
      return;
    } catch (e) {
      console.error(`\n❌ ${color.red(String(e))}\n`);
      await printAddHelp();
      process.exit(1);
    }
  }

  await runAddInteractiveCli(app);
}

async function runAddInteractiveCli(app: AppCommand) {
  console.clear();

  const typeAnswer = await prompts(
    {
      type: 'select',
      name: 'starterType',
      message: `What feature would you like to add?`,
      choices: [
        { title: 'Server (SSR)', value: 'server' },
        { title: 'Static Generator (SSG)', value: 'static-generator' },
      ],
      hint: ' ',
    },
    {
      onCancel: () => {
        console.log(``);
        process.exit(0);
      },
    }
  );
  console.log(``);

  if (typeAnswer.starterType === 'server') {
    const servers = await loadStarterData('servers');
    const serverAnswer = await prompts(
      {
        type: 'select',
        name: 'id',
        message: `Which server would you like to add?`,
        choices: servers.map((f) => {
          return { value: f.id, title: f.id, description: f.description };
        }),
        hint: ' ',
      },
      {
        onCancel: () => {
          console.log(``);
          process.exit(0);
        },
      }
    );
    console.log(``);

    await updateApp({
      rootDir: app.rootDir,
      addIntegration: serverAnswer.id,
    });
    return;
  }

  if (typeAnswer.starterType === 'static-generator') {
    const staticGenerators = await loadStarterData('static-generators');
    const staticAnswer = await prompts(
      {
        type: 'select',
        name: 'id',
        message: `Which static generator would you like to add?`,
        choices: staticGenerators.map((f) => {
          return { value: f.id, title: f.id, description: f.description };
        }),
        hint: ' ',
      },
      {
        onCancel: () => {
          console.log(``);
          process.exit(0);
        },
      }
    );
    console.log(``);

    await updateApp({
      rootDir: app.rootDir,
      addIntegration: staticAnswer.id,
    });
    return;
  }
}

export async function printAddHelp() {
  const [features, servers, staticGenerators] = await Promise.all([
    loadStarterData('features'),
    loadStarterData('servers'),
    loadStarterData('static-generators'),
  ]);

  console.log(`${color.green(`qwik add`)} ${color.cyan(`[feature]`)}`);
  console.log(``);

  console.log(`  ${color.cyan('Servers')}`);
  for (const s of servers) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Static Generators')}`);
  for (const s of staticGenerators) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Features')}`);
  for (const s of features) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);
}
