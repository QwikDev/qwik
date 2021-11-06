import type {
  Diagnostic,
  TransformModulesOptions,
  TransformFsOptions,
  TransformResult,
} from '.';
import { loadPlatformBinding } from './platform-binding';

/**
 * Transforms the input code string, does not access the file system.
 */
export async function transformModules(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transformModules({
    minify: false,
    sourceMaps: false,
    transpile: false,
    ...opts,
    entryStrategy: opts.entryStrategy?.type ?? 'Single',
  });
}

/**
 * Transforms the input code string, does not access the file system.
 */
export function transformModulesSync(opts: TransformModulesOptions) {
  const binding = loadPlatformBinding();
  return binding.transformModules({
    minify: false,
    sourceMaps: false,
    transpile: false,
    ...opts,
    entryStrategy: opts.entryStrategy?.type ?? 'Single',
  });
}

/**
 * Transforms the file read from the file system.
 */
export async function transformFs(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  return binding.transformFs({
    minify: false,
    sourceMaps: false,
    transpile: false,
    ...opts,
    entryStrategy: opts.entryStrategy?.type ?? 'Single',
  });
}

/**
 * Transforms the file read from the file system.
 */
export function transformFsSync(opts: TransformFsOptions) {
  const binding = loadPlatformBinding();
  return binding.transformFs({
    minify: false,
    sourceMaps: false,
    transpile: false,
    ...opts,
    entryStrategy: opts.entryStrategy?.type ?? 'Single',
  });
}

