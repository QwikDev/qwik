import type { Optimizer, OptimizerOptions, EntryPointOptions } from './types';

export function normalizeOptions(optimizer: Optimizer, opts?: OptimizerOptions) {
  if (opts) {
    if (typeof opts.cache === 'boolean') optimizer.enableCache(opts.cache);
    if (typeof opts.sourcemap === 'string') optimizer.setSourceMapOption(opts.sourcemap);
    if (typeof opts.mode === 'string') optimizer.setMode(opts.mode);
    if (typeof opts.rootDir === 'string') optimizer.setRootDir(opts.rootDir);
    if (opts.ts) optimizer.setTypeScript(opts.ts);
    if (opts.tsconfig) optimizer.setTsconfig(opts.tsconfig);
    if (typeof opts.typescriptPath === 'string') optimizer.setTypeScriptPath(opts.typescriptPath);
  }
}

export const platform = (() => {
  if (typeof process !== 'undefined' && process.nextTick && !(process as any).browser) {
    return 'node';
  }
  if (typeof self !== 'undefined' && typeof (self as any).importScripts === 'function') {
    return 'browser-webworker';
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser-main';
  }
  throw Error(`unsupported platform`);
})();

const queryRE = /\?.*$/;
const hashRE = /#.*$/;

export function pathExtname(path: string) {
  if (typeof path === 'string') {
    const basename = pathBasename(path);
    const pos = basename.lastIndexOf('.');
    if (pos > 0) {
      return basename.slice(pos).toLowerCase().replace(hashRE, '').replace(queryRE, '');
    }
  }
  return '';
}

export function pathBasename(path: string) {
  if (typeof path === 'string') {
    const last = path.split(/[\\/]/).pop();
    if (typeof last === 'string') {
      return last.replace(hashRE, '').replace(queryRE, '');
    }
  }
  return '';
}

export function isJsxFile(filePath: string) {
  const extname = pathExtname(filePath);
  return extname === '.tsx' || extname === '.jsx';
}

export function toBase64(content: any) {
  if (content) {
    try {
      if (typeof Buffer === 'function' && typeof Buffer.from === 'function') {
        return Buffer.from(content, 'utf8').toString('base64');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('toBase64', e);
    }
  }
  return '';
}

export function normalizeUrl(url: string) {
  return new URL(url, 'http://app.qwik.dev/').href;
}

const TEST_FILE_REG = new RegExp('(/__tests__/.*|\\.(test|spec|unit))\\.(tsx|ts)$');
const TS_FILE_REG = new RegExp('\\.(tsx|ts)$');
const DTS_FILE_REG = new RegExp('\\.d\\.ts$');
const SERVER_FILE_REG = new RegExp('\\.server\\.(tsx|ts)$');

export function getEntryPoints(opts: EntryPointOptions, files: string[]) {
  return files.filter((f) => {
    if (!TS_FILE_REG.test(f) || TEST_FILE_REG.test(f) || DTS_FILE_REG.test(f)) {
      return false;
    }
    if (opts.platform === 'client') {
      if (SERVER_FILE_REG.test(f)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Utility timer function for performance profiling.
 * @alpha
 */
export function createTimer() {
  const start = process.hrtime();
  return () => {
    const end = process.hrtime(start);
    return (end[0] * 1000000000 + end[1]) / 1000000;
  };
}
