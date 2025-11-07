import type {
  OptimizerSystem,
  SystemEnvironment,
  TransformModuleInput,
  TransformOutput,
} from './types';
import { createPath } from './path';
import { QWIK_BINDING_MAP } from './qwik-binding-map';

export async function getSystem() {
  const sysEnv = getEnv();

  const sys: OptimizerSystem = {
    dynamicImport: (path) => {
      throw new Error(
        `Qwik Optimizer sys.dynamicImport() not implemented, trying to import: "${path}"`
      );
    },
    strictDynamicImport: (path) => {
      throw new Error(
        `Qwik Optimizer sys.strictDynamicImport() not implemented, trying to import: "${path}"`
      );
    },
    path: null as any,
    cwd: () => '/',
    os: 'unknown',
    env: sysEnv,
  };

  sys.path = createPath(sys);

  if (globalThis.IS_ESM) {
    sys.strictDynamicImport = sys.dynamicImport = (path) => import(path);
  }

  if (sysEnv !== 'webworker' && sysEnv !== 'browsermain') {
    try {
      sys.path = await sys.dynamicImport('node:path');
      sys.cwd = () => process.cwd();
      sys.os = process.platform;
    } catch {
      // ignore
    }
  }

  return sys;
}

export const getPlatformInputFiles = async (sys: OptimizerSystem) => {
  if (typeof sys.getInputFiles === 'function') {
    return sys.getInputFiles;
  }

  if (sys.env === 'node') {
    const fs: typeof import('fs') = await sys.dynamicImport('node:fs');

    return async (rootDir: string) => {
      const getChildFilePaths = async (dir: string): Promise<string[]> => {
        const stats = await fs.promises.stat(dir);
        const flatted: string[] = [];
        if (stats.isDirectory()) {
          const dirItems = await fs.promises.readdir(dir);

          const files = await Promise.all(
            dirItems.map(async (subdir: any) => {
              const resolvedPath = sys.path.resolve(dir, subdir);
              const stats = await fs.promises.stat(resolvedPath);
              return stats.isDirectory() ? getChildFilePaths(resolvedPath) : [resolvedPath];
            })
          );
          for (const file of files) {
            flatted.push(...file);
          }
        } else {
          flatted.push(dir);
        }
        return flatted.filter((a) => sys.path.extname(a).toLowerCase() in extensions);
      };

      const filePaths = await getChildFilePaths(rootDir);

      const inputs = (
        await Promise.all(
          filePaths.map(async (filePath) => {
            const input: TransformModuleInput = {
              code: await fs.promises.readFile(filePath, 'utf8'),
              path: filePath,
            };
            return input;
          })
        )
      ).sort((a, b) => {
        if (a.path < b.path) {
          return -1;
        }
        if (a.path > b.path) {
          return 1;
        }
        return 0;
      });

      return inputs;
    };
  }

  return null;
};

export async function loadPlatformBinding(sys: OptimizerSystem) {
  const sysEnv = getEnv();

  // Try native build
  if (sysEnv === 'node' || sysEnv === 'bun') {
    // Node.js
    const platform = (QWIK_BINDING_MAP as any)[process.platform];
    if (platform) {
      const triples = platform[process.arch];
      if (triples) {
        for (const triple of triples) {
          // Node.js - Native Binding
          try {
            if (globalThis.IS_ESM) {
              const module = await sys.dynamicImport('node:module');
              const mod = module.default.createRequire(import.meta.url)(
                `../bindings/${triple.platformArchABI}`
              );
              return mod;
            }
            const mod = await sys.dynamicImport(`../bindings/${triple.platformArchABI}`);
            return mod;
          } catch (e) {
            console.warn(
              `Unable to load native binding ${triple.platformArchABI}. Falling back to wasm build.`,
              (e as Error)?.message
            );
          }
        }
      }
    }
  }

  if (globalThis.IS_ESM) {
    if (sysEnv === 'node' || sysEnv === 'bun') {
      // ESM WASM Node.js
      const url: typeof import('url') = await sys.dynamicImport('node:url');
      const __dirname = sys.path.dirname(url.fileURLToPath(import.meta.url));
      const wasmPath = sys.path.join(__dirname, '..', 'bindings', 'qwik_wasm_bg.wasm');
      const mod = await sys.dynamicImport(`../bindings/qwik.wasm.mjs`);
      const fs: typeof import('fs') = await sys.dynamicImport('node:fs');

      const buf = await fs.promises.readFile(wasmPath);
      const wasm = await WebAssembly.compile(buf as any);
      await mod.default(wasm);
      return mod;
    } else {
      const module = await sys.dynamicImport(`../bindings/qwik.wasm.mjs`);
      await module.default();
      return module;
    }
  }

  throw new Error(`Platform not supported`);
}

export interface PlatformBinding {
  transform_fs?: (opts: any) => TransformOutput;
  transform_modules: (opts: any) => Promise<TransformOutput>;
}

const getEnv = (): SystemEnvironment => {
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  if (
    typeof process !== 'undefined' &&
    typeof global !== 'undefined' &&
    process.versions &&
    process.versions.node
  ) {
    return 'node';
  }

  if (
    typeof self !== 'undefined' &&
    typeof location !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof fetch === 'function' &&
    typeof WorkerGlobalScope === 'function' &&
    typeof (self as any).importScripts === 'function'
  ) {
    return 'webworker';
  }

  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof location !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof Window === 'function' &&
    typeof fetch === 'function'
  ) {
    return 'browsermain';
  }

  return 'unknown';
};

const extensions: { [ext: string]: boolean } = {
  '.js': true,
  '.ts': true,
  '.tsx': true,
  '.jsx': true,
  '.mjs': true,
};

declare const globalThis: { IS_ESM: boolean; [key: string]: any };
declare const WorkerGlobalScope: any;
declare const Deno: any;
declare const Bun: any;
