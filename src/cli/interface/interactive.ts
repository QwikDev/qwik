/* eslint-disable no-console */
import prompts from 'prompts';
import color from 'kleur';
import { createOutDir, createOutDirName, validateOutDir } from './utils-interface';
import type { GenerateOptions } from '../types';
import { generateStarter, getStarters } from '../api';
import { logResult } from './log';

export async function runInteractive() {
  console.clear();

  console.log(`💫 ${color.cyan(`Let's create a Qwik project`)} 💫`);
  console.log(``);

  const starters = await getStarters();

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
    {
      type: 'multiselect',
      name: 'featureIds',
      message: 'Features',
      instructions: false,
      choices: [
        ...starters.features.map((s) => {
          return { title: s.name, value: s.id, description: s.description, selected: true };
        }),
      ],
    },
  ]);

  const outDirName = createOutDirName(response.projectName);
  const outDir = createOutDir(outDirName);

  const opts: GenerateOptions = {
    projectName: response.projectName,
    appId: response.appId,
    serverId: response.serverId,
    featureIds: response.featureIds,
    outDir,
  };

  const result = await generateStarter(opts);

  logResult(result);
}
