/* eslint-disable no-console */
import prompts from 'prompts';
import color from 'kleur';
import { createOutDir, createOutDirName, validateOutDir } from './utils-interface';
import type { GenerateOptions } from '../types';
import { generateStarter, getStarters } from '../api';
import { logResult } from './log';

export async function runInteractive() {
  console.clear();

  console.log(`💫 ${color.cyan(`Let's create a Qwik app`)} 💫`);
  console.log(``);

  const starters = await getStarters();
  const apps = starters.apps.filter((a) => a.id !== 'base');

  const opts: GenerateOptions = {
    projectName: '',
    appId: '',
    serverId: '',
    featureIds: [],
    outDir: '',
  };

  await prompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      initial: 'qwik-app',
      validate: (projectName: string) => {
        const outDirName = createOutDirName(projectName);
        opts.outDir = createOutDir(outDirName);
        validateOutDir(opts.outDir);
        return true;
      },
      format: (projectName: string) => {
        return (opts.projectName = projectName);
      },
    },
    {
      type: 'select',
      name: 'appId',
      message: 'Select a starter',
      choices: apps.map((s) => {
        return { title: s.name, value: s.id, description: s.description };
      }),
      format: (appId: string) => {
        return (opts.appId = appId);
      },
    },
    {
      type: () => {
        const selected = starters.apps.find((a) => a.id === opts.appId);
        return selected?.selectServer ? 'select' : null;
      },
      name: 'serverId',
      message: 'Select a server',
      choices: () => {
        return [
          ...starters.servers.map((s) => {
            return { title: s.name, value: s.id, description: s.description };
          }),
          {
            title: 'Setup later',
            value: 'no-hosting',
            description: `I'll setup my own hosting`,
          },
        ];
      },
      format: (serverId: string) => {
        return (opts.serverId = serverId);
      },
    },
    {
      type: () => {
        const starter = starters.apps.find((a) => a.id === opts.appId);
        return starter && starter.featureOptions.length > 0 ? 'multiselect' : null;
      },
      name: 'featureIds',
      message: 'Features',
      instructions: false,
      choices: () => {
        const starter = starters.apps.find((a) => a.id === opts.appId);
        const featureOptions = [...starter!.featureOptions];
        return featureOptions.map((featureId) => {
          const f = starters.features.find((f) => f.id === featureId)!;
          const selected = f.id !== 'tailwindcss';
          return { title: f.name, value: f.id, description: f.description, selected };
        });
      },
      format: (featureIds: string[]) => {
        return (opts.featureIds = featureIds);
      },
    },
  ]);

  const result = await generateStarter(opts);

  logResult(result);
}
