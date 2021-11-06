import type {
  TransformModulesOptions,
  TransformFsOptions,
} from '.';
import { loadPlatformBinding } from './platform-binding';

/**
 * Transforms the input code string, does not access the file system.
 */
export async function transformModules(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transformModules(convertOptions(opts));
}

/**
 * Transforms the input code string, does not access the file system.
 */
export function transformModulesSync(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transformModules(convertOptions(opts));
}

/**
 * Transforms the file read from the file system.
 */
export async function transformFs(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  return binding.transformFs(convertOptions(opts));
}

/**
 * Transforms the file read from the file system.
 */
 export function transformFsSync(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  return binding.transformFs(convertOptions(opts));
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
