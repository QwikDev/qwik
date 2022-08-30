/* eslint-disable no-console */
import type { System } from '../generator/types';
import fs from 'fs';
import { dirname, join } from 'path';
import { patchGlobalFetch } from '../../middleware/express/node-fetch';
import type { NodeStaticGeneratorOptions } from './types';
import { createNodeMainProcess } from './node-main';
import { createNodeWorkerProcess } from './node-worker';
import { isMainThread } from 'worker_threads';
import { normalizePath } from '../../utils/fs';

export async function createNodeSystem(opts: NodeStaticGeneratorOptions) {
  opts = { ...opts };

  patchGlobalFetch();

  const createWriteStream = (filePath: string) => {
    return fs.createWriteStream(filePath, {
      flags: 'w',
    });
  };

  const NS_PER_SEC = 1e9;
  const MS_PER_NS = 1e-6;

  const createTimer = () => {
    const start = process.hrtime();
    return () => {
      const diff = process.hrtime(start);
      return (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS;
    };
  };

  const createLogger = async () => {
    return {
      debug: opts.log === 'debug' ? console.debug.bind(console) : () => {},
      error: console.error.bind(console),
      info: console.info.bind(console),
    };
  };

  const outDir = normalizePath(opts.outDir);

  const getPageFilePath = (pathname: string) => {
    pathname = pathname.slice(1);
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }
    pathname += 'index.html';
    return join(outDir, pathname);
  };

  const getDataFilePath = (pathname: string) => {
    pathname = pathname.slice(1);
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }
    pathname += 'qdata.json';
    return join(outDir, pathname);
  };

  const sys: System = {
    createMainProcess: () => createNodeMainProcess(opts),
    createWorkerProcess: createNodeWorkerProcess,
    createLogger,
    isMainThread: () => isMainThread,
    getOptions: () => opts,
    ensureDir,
    createWriteStream,
    createTimer,
    getPageFilePath,
    getDataFilePath,
  };

  return sys;
}

export const ensureDir = async (filePath: string) => {
  try {
    await fs.promises.mkdir(dirname(filePath), { recursive: true });
  } catch (e) {
    //
  }
};
