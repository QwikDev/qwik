/* eslint-disable no-console */
import type { NormalizedStaticGeneratorOptions, System } from '../generator/types';
import fs from 'fs';
import { join } from 'path';

export function createNodeSystem() {
  const getFilePath = (outDir: string, pathname: string) => {
    pathname = pathname.slice(1);
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }
    pathname += 'index.html';
    return join(outDir, pathname);
  };

  const readFile = (filePath: string) => {
    return fs.promises.readFile(filePath, 'utf-8');
  };

  const writeFile = (filePath: string, data: any) => {
    return fs.promises.writeFile(filePath, data);
  };

  const sys: System = {
    readFile,
    writeFile,
    getFilePath,
  };

  return sys;
}

export function createNodeLogger(opts: NormalizedStaticGeneratorOptions) {
  return {
    debug: opts.log === 'debug' ? console.debug.bind(console) : () => {},
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
}
