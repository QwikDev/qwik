import { mkdirSync } from 'fs';
import { generateStarter } from '../api';
import type { GenerateOptions } from '../types';
import { logResult } from './log';
import { createOutDir, createOutDirName, validateOutDir } from './utils-interface';

export async function runGenerate(appId: string, projectName: string) {
  const outDirName = createOutDirName(projectName);
  let outDir: string;

  if (writeToCwd()) {
    // write to the current working directory
    outDir = process.cwd();
  } else {
    // create a sub directory
    outDir = createOutDir(outDirName);
    validateOutDir(outDir);
    mkdirSync(outDir, { recursive: true });
  }

  const opts: GenerateOptions = {
    appId,
    projectName,
    serverId: 'express',
    outDir,
    featureIds: [],
  };

  const result = await generateStarter(opts);

  logResult(result);
}

export function writeToCwd() {
  return isStackBlitz();
}

function isStackBlitz() {
  try {
    // /home/projects/abc123
    return process.cwd().startsWith('/home/projects/');
  } catch (e) {
    /**/
  }
  return false;
}
