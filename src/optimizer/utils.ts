import type { Optimizer, OptimizerOptions } from './types';

export function normalizeOptions(optimizer: Optimizer, opts?: OptimizerOptions) {
  if (opts) {
    if (typeof opts.cache === 'boolean') optimizer.enableCache(opts.cache);
    if (typeof opts.sourcemap === 'string' || typeof opts.sourcemap === 'boolean')
      optimizer.setSourceMapOption(opts.sourcemap);
    if (typeof opts.typescriptPath === 'string') optimizer.setTypescriptPath(opts.typescriptPath);
  }
}

export const platform = (() => {
  if (typeof global !== 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
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

export function pathJoin(...paths: string[]) {
  if (Array.isArray(paths)) {
    const parts: string[] = [];
    const sep = paths.some((p) => typeof p === 'string' && p.includes('\\')) ? '\\' : '/';
    for (const path of paths) {
      if (typeof path === 'string') {
        parts.push(...path.split(sep));
      }
    }
    return parts.join(sep);
  }
  return '';
}

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

export function pathBasenameWithoutExtname(path: string) {
  if (typeof path === 'string') {
    const basename = pathBasename(path);
    const extname = pathExtname(path);
    return basename.substring(0, basename.length - extname.length);
  }
  return '';
}

export function isJsxFile(filePath: string) {
  const extname = pathExtname(filePath);
  return extname === '.tsx' || extname === '.jsx';
}

export const dashToCamelCase = (str: string) =>
  str
    .trim()
    .toLocaleLowerCase()
    .split('-')
    .map((s, i) => (i > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join('');

export async function dynamicImport(id: string) {
  // if (!id.endsWith('.mjs') && typeof require === 'function') {
  //   const mod = require(id);
  //   const defaultExport = mod.__esModule ? mod.default : mod;
  //   // rollup-style default import interop for cjs
  //   return new Proxy(mod, {
  //     get(mod, prop) {
  //       if (prop === 'default') return defaultExport;
  //       return mod[prop];
  //     },
  //   });
  // }
  // console.log('import1', id);
  // await import(id);
  // console.log('import2', id);
  return import(id);
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
