/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import { readdirSync } from 'fs';
import { execa } from 'execa';
import color from 'kleur';
import { join, relative } from 'path';
import { runBuildCommand } from '../build/run-build';

export async function runSsgCommand(app: AppCommand) {
  await runBuildCommand(app);

  let serverBuilds: string[];
  try {
    serverBuilds = readdirSync(app.serverDir);
  } catch (e) {
    throw new Error(`Unable to find a static build directory`);
  }

  for (const buildName of serverBuilds) {
    for (const ext of ssgExts) {
      const ssgBuildName = 'entry.static' + ext;
      if (buildName === ssgBuildName) {
        const exePath = join(app.serverDir, ssgBuildName);

        console.log(color.dim(`node ${relative(app.rootDir, exePath)}`) + '\n');

        await execa('node', [exePath], {
          stdio: 'inherit',
        });
        console.log(``);
        return;
      }
    }
  }

  throw new Error(`Unable to find a static build module`);
}

const ssgExts = ['.js', '.cjs', '.mjs'];
