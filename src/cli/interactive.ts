/* eslint-disable no-console */
import prompts from 'prompts';
import { generateStarter } from './generate';
import color from 'kleur';
import { createOutDir, createOutDirName, validateOutDir } from './utils';
import type { CliGenerateOptions, CliStarters } from 'scripts/util';

export async function runInteractive(starters: CliStarters) {
  console.clear();

  console.log(`💫 ${color.cyan(`Let's create a Qwik project`)} 💫`);
  console.log(``);

  const response = await prompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      initial: 'qwik-app',
      validate: (value: string) => {
        const outDirName = createOutDirName(value);
        const outDir = createOutDir(outDirName);
        validateOutDir(outDir);
        return true;
      },
    },
    {
      type: 'select',
      name: 'appId',
      message: 'Select a starter',
      choices: starters.apps.map((s) => {
        return { title: s.name, value: s.id, description: s.description };
      }),
    },
    {
      type: 'select',
      name: 'serverId',
      message: 'Select a server',
      choices: [
        ...starters.servers.map((s) => {
          return { title: s.name, value: s.id, description: s.description };
        }),
        {
          title: 'Setup later',
          value: 'no-hosting',
          description: `I'll setup my own hosting`,
        },
      ],
    },
  ]);

  const opts: CliGenerateOptions = {
    projectName: response.projectName,
    appId: response.appId,
    serverId: response.serverId,
  };

  generateStarter(starters, opts);
}
