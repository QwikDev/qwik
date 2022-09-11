/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import { readdirSync } from 'fs';
import color from 'kleur';
import { execa } from 'execa';
import { join, relative } from 'path';

export async function runServeCommand(app: AppCommand) {
  let serverBuilds: string[];
  try {
    serverBuilds = readdirSync(app.serverDir);
  } catch (e) {
    throw new Error(`Unable to find a server build directory`);
  }

  for (const buildName of serverBuilds) {
    for (const ext of serverExts) {
      const serverBuildName = 'entry.server' + ext;
      if (buildName === serverBuildName) {
        const exePath = join(app.serverDir, serverBuildName);

        console.log(color.dim(`node ${relative(app.rootDir, exePath)}`) + '\n');

        await execa('node', [exePath], {
          stdio: 'inherit',
        });
        console.log(``);
        return;
      }
    }
  }

  throw new Error(`Unable to find a server build module`);
}

const serverExts = ['.js', '.cjs', '.mjs'];
