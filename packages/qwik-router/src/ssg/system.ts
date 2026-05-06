/* eslint-disable no-console */
import type { SsgGenerateOptions, System } from './types';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { createWorkerPool } from './worker-pool';
import { getLoaderName } from '../middleware/request-handler/request-path';
import { normalizePath } from '../utils/fs';

/** @public */
export async function createSystem(opts: SsgGenerateOptions, threadId?: number): Promise<System> {
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

  const noop = () => {};
  const createLogger = async () => {
    const isQuiet = opts.log === 'quiet';
    const isDebug = opts.log === 'debug';
    if (threadId !== undefined) {
      return {
        debug: isDebug ? console.debug.bind(console, `[${threadId}]`) : noop,
        error: console.error.bind(console, `[${threadId}]`),
        info: isQuiet ? noop : console.info.bind(console, `[${threadId}]`),
      };
    }
    return {
      debug: isDebug ? console.debug.bind(console) : noop,
      error: console.error.bind(console),
      info: isQuiet ? noop : console.info.bind(console),
    };
  };

  const outDir = normalizePath(opts.outDir);

  const basePathname = opts.basePathname || '/';
  const basenameLen = basePathname.length;

  const getRouteFilePath = (pathname: string, isHtml: boolean) => {
    pathname = decodeURIComponent(pathname.slice(basenameLen));
    if (isHtml) {
      if (!pathname.endsWith('.html')) {
        if (pathname.endsWith('/')) {
          pathname += 'index.html';
        } else {
          pathname += '/index.html';
        }
      }
    } else {
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
    }
    return join(outDir, pathname);
  };

  const getLoaderFilePath = (pathname: string, loaderId: string, manifestHash: string) => {
    pathname = decodeURIComponent(pathname.slice(basenameLen));
    const suffix = getLoaderName(loaderId, manifestHash);
    if (pathname.endsWith('/')) {
      pathname += suffix;
    } else {
      pathname += '/' + suffix;
    }
    return join(outDir, pathname);
  };

  const sys: System = {
    createMainProcess: null,
    createLogger,
    getOptions: () => opts,
    ensureDir,
    createWriteStream,
    createTimer,
    access,
    getRouteFilePath,
    getLoaderFilePath,
    getEnv: (key) => process.env[key],
    platform: {
      static: true,
      node: process.versions.node,
    },
  };
  sys.createMainProcess = () => createWorkerPool(sys, opts);

  return sys;
}

export const ensureDir = async (filePath: string) => {
  await fs.promises.mkdir(dirname(filePath), { recursive: true });
};

export const access = async (path: string) => {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
};
