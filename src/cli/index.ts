import { join } from 'path';
import type { CliGenerateOptions } from '../../scripts/util';
import { generateStarter } from './generate';
import { runInteractive } from './interactive';
import { loadStarters } from './load-stater-data';

const args = process.argv.slice(2);

const starters = loadStarters(join(__dirname, 'starters'));

if (args.length >= 2) {
  const opts: CliGenerateOptions = {
    appId: args[0],
    projectName: args[1],
    serverId: 'express',
  };
  generateStarter(starters, opts);
} else {
  runInteractive(starters);
}
