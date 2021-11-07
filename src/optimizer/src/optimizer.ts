import type { TransformResult, TransformModule, TransformModuleInput } from '.';
import { loadPlatformBinding, PlatformBinding } from './platform-binding';
import type { TransformModulesOptions, TransformFsOptions } from './types';

/**
 * @alpha
 */
export interface Optimizer {
  isDirty: boolean;

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModules(opts: TransformModulesOptions): Promise<TransformResult>;

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModulesSync(opts: TransformModulesOptions): TransformResult;

  /**
   * Transforms the directory from the file system.
   */
  transformFs(opts: TransformFsOptions): Promise<TransformResult>;

  /**
   * Transforms the directory from the file system.
   */
  transformFsSync(opts: TransformFsOptions): TransformResult;

  getTransformedModule(path: string): TransformModule | undefined;

  hasTransformedModule(path: string): boolean;

  watchChange(id: string, event: 'create' | 'update' | 'delete'): void;
}

/**
 * @alpha
 */
export const createOptimizer = async (): Promise<Optimizer> => {
  const binding = await loadPlatformBinding();
  const transformedOutputs = new Map<string, TransformModule>();
  let lastDirectoryResult: TransformResult | undefined;
  let isDirty = true;

  return {
    /**
     * Transforms the input code string, does not access the file system.
     */
    async transformModules(opts: TransformModulesOptions) {
      const result = transformModules(binding, opts);
      return result;
    },

    /**
     * Transforms the input code string, does not access the file system.
     */
    transformModulesSync(opts: TransformModulesOptions) {
      const result = transformModules(binding, opts);
      return result;
    },

    /**
     * Transforms the directory from the file system.
     */
    async transformFs(opts: TransformFsOptions) {
      if (!isDirty) {
        return lastDirectoryResult!;
      }

      const result = await transformFsAsync(binding, opts);
      lastDirectoryResult = result;

      result.modules.forEach((output) => {
        const path = output.path.split('.').slice(0, -1).join('.');
        const key = result.rootDir + '/' + path;
        transformedOutputs.set(key, output);
      });

      return result;
    },

    /**
     * Transforms the directory from the file system.
     */
    transformFsSync(opts: TransformFsOptions) {
      if (!isDirty) {
        return lastDirectoryResult!;
      }

      const result = transformFs(binding, opts);
      lastDirectoryResult = result;

      result.modules.forEach((output) => {
        const path = output.path.split('.').slice(0, -1).join('.');
        const key = result.rootDir + '/' + path;
        transformedOutputs.set(key, output);
      });

      return result;
    },

    getTransformedModule(path: string) {
      path = path.replace(/\.(j|t)sx?$/, '');
      return transformedOutputs.get(path);
    },

    hasTransformedModule(path: string) {
      return transformedOutputs.has(path);
    },

    set isDirty(isDirty: boolean) {
      if (isDirty) {
        lastDirectoryResult = undefined;
      }
    },
    get isDirty(): boolean {
      return lastDirectoryResult === undefined;
    },

    watchChange(id: string, event: 'create' | 'update' | 'delete') {
      isDirty = true;
      console.debug('watch change', id, event);
    },
  };
};

/**
 * Transforms the input code string, does not access the file system.
 */
const transformModules = (binding: PlatformBinding, opts: TransformModulesOptions) => {
  return binding.transform_modules(convertOptions(opts));
};

const transformFs = (binding: PlatformBinding, opts: TransformFsOptions) => {
  if (binding.transform_fs) {
    return binding.transform_fs(convertOptions(opts));
  }
  throw new Error('not implemented');
};

const transformFsAsync = (binding: PlatformBinding, opts: TransformFsOptions) => {
  if (binding.transform_fs) {
    return binding.transform_fs(convertOptions(opts));
  }
  return transformFsVirtual(opts, binding);
};

const transformFsVirtual = async (opts: TransformFsOptions, binding: PlatformBinding) => {
  const { promisify } = require('util');
  const { resolve, extname } = require('path');
  const fs = require('fs');
  const readdir = promisify(fs.readdir);
  const stat = promisify(fs.stat);
  const read = promisify(fs.readFile);

  const extensions = ['.js', '.ts', '.tsx', '.jsx'];
  async function getFiles(dir: string) {
    const subdirs = await readdir(dir);
    const files = await Promise.all(
      subdirs.flatMap(async (subdir: any) => {
        const res = resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? getFiles(res) : res;
      })
    );
    return files.filter((a) => extensions.includes(extname(a)));
  }
  const files = await getFiles(opts.rootDir);
  const input: TransformModuleInput[] = await Promise.all(
    files.map(async (file) => {
      return {
        code: (await read(file, 'utf-8')) as string,
        path: (file as string).slice(opts.rootDir.length + 1),
      };
    })
  );

  const newOpts: TransformModulesOptions = {
    rootDir: opts.rootDir,
    entryStrategy: opts.entryStrategy,
    minify: opts.minify,
    sourceMaps: opts.sourceMaps,
    transpile: opts.transpile,
    input,
  };
  return binding.transform_modules(convertOptions(newOpts));
};

const convertOptions = (opts: any) => {
  const output: any = {
    minify: 'simplify',
    sourceMaps: false,
    transpile: false,
  };
  Object.entries(opts).forEach(([key, value]) => {
    if (value != null) {
      output[key] = value;
    }
  });
  output.entryStrategy = opts.entryStrategy?.type ?? 'single';
  return output;
};
