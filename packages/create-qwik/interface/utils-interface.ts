import { existsSync } from 'fs';
import { resolve } from 'path';
import { panic } from './log';

export function createOutDirName(projectName: string) {
  return projectName.toLocaleLowerCase().replace(/ /g, '-');
}

export function createOutDir(outDirName: string) {
  return resolve(process.cwd(), outDirName);
}

export function validateOutDir(outDir: string) {
  if (existsSync(outDir)) {
    panic(
      `Directory "${outDir}" already exists. Please either remove this directory, or choose another location.`
    );
  }
}
