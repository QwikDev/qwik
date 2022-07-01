#!/usr/bin/env node

import { runGenerate } from './generate';
import { runInteractive } from './interactive';
import { panic } from './log';

async function run() {
  try {
    const args = process.argv.slice(2);

    if (args.length >= 2) {
      const appId = args[0];
      const projectName = args[1];
      await runGenerate(appId, projectName);
    } else {
      await runInteractive();
    }
  } catch (e: any) {
    panic(e.message || e);
  }
}

run();
