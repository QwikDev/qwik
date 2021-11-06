import type {
  TransformModulesOptions,
  TransformFsOptions,
  TransformModuleInput,
} from '.';
import { loadPlatformBinding, PlatformBinding } from './platform-binding';

/**
 * Transforms the input code string, does not access the file system.
 */
export async function transformModules(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transform_modules(convertOptions(opts));
}

/**
 * Transforms the input code string, does not access the file system.
 */
export function transformModulesSync(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transform_modules(convertOptions(opts));
}

/**
 * Transforms the file read from the file system.
 */
export async function transformFs(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  if (binding.transform_fs) {
    return binding.transform_fs(convertOptions(opts));
  }
  return transformFsVirtual(opts, binding);
}

/**
 * Transforms the file read from the file system.
 */
 export function transformFsSync(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  if (!binding.transform_fs) {
    throw new Error('transformFsSync not available in this platform');
  }
  return binding.transform_fs(convertOptions(opts));
}

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
    const files = await Promise.all(subdirs.flatMap(async (subdir: any) => {
      const res = resolve(dir, subdir);
      return (await stat(res)).isDirectory() ? getFiles(res) : res;
    }));
    return files.filter(a => extensions.includes(extname(a)));
  }
  const files = await getFiles(opts.rootDir);
  const input: TransformModuleInput[] = await Promise.all(files.map(async file => {
    return {
      code: await read(file, 'utf-8') as string,
      path: (file as string).slice(opts.rootDir.length + 1),
    };
  }));

  const newOpts: TransformModulesOptions = {
    rootDir: opts.rootDir,
    entryStrategy: opts.entryStrategy,
    minify: opts.minify,
    sourceMaps: opts.sourceMaps,
    transpile: opts.transpile,
    input,
  };
  return binding.transform_modules(convertOptions(newOpts));
}

export function convertOptions(opts: any) {
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
  output.entryStrategy = opts.entryStrategy?.type ?? 'Single';
  return output;
}
