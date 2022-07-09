import { getPlatformInputFiles, getSystem, loadPlatformBinding, PlatformBinding } from './platform';
import type {
  TransformModulesOptions,
  TransformFsOptions,
  Optimizer,
  OptimizerSystem,
  OptimizerOptions,
} from './types';

/**
 * @alpha
 */
export const createOptimizer = async (optimizerOptions: OptimizerOptions = {}) => {
  const sys = optimizerOptions?.sys || (await getSystem());
  const binding = optimizerOptions?.binding || (await loadPlatformBinding(sys));

  const optimizer: Optimizer = {
    async transformModules(opts: TransformModulesOptions) {
      return transformModulesSync(binding, opts);
    },
    transformModulesSync(opts: TransformModulesOptions) {
      return transformModulesSync(binding, opts);
    },
    async transformFs(opts: TransformFsOptions) {
      return transformFsAsync(sys, binding, opts);
    },
    transformFsSync(opts: TransformFsOptions) {
      return transformFsSync(binding, opts);
    },
    sys,
  };

  return optimizer;
};

/**
 * Transforms the input code string, does not access the file system.
 */
const transformModulesSync = (binding: PlatformBinding, opts: TransformModulesOptions) => {
  return binding.transform_modules(convertOptions(opts));
};

const transformFsSync = (binding: PlatformBinding, opts: TransformFsOptions) => {
  if (binding.transform_fs) {
    return binding.transform_fs(convertOptions(opts));
  }
  throw new Error('Not implemented');
};

const transformFsAsync = async (
  sys: OptimizerSystem,
  binding: PlatformBinding,
  fsOpts: TransformFsOptions
) => {
  if (binding.transform_fs && !sys.getInputFiles) {
    return binding.transform_fs(convertOptions(fsOpts));
  }

  const getInputFiles = await getPlatformInputFiles(sys);

  if (getInputFiles) {
    const input = await getInputFiles(fsOpts.srcDir);
    for (const root of fsOpts.vendorRoots) {
      const rootFiles = await getInputFiles(root);
      input.push(...rootFiles);
    }
    const modulesOpts: TransformModulesOptions = {
      srcDir: fsOpts.srcDir,
      entryStrategy: fsOpts.entryStrategy,
      minify: fsOpts.minify,
      sourceMaps: fsOpts.sourceMaps,
      transpile: fsOpts.transpile,
      dev: fsOpts.dev,
      scope: fsOpts.scope,
      input,
    };

    return binding.transform_modules(convertOptions(modulesOpts));
  }

  throw new Error('Not implemented');
};

const convertOptions = (opts: any) => {
  const output: any = {
    minify: 'simplify',
    sourceMaps: false,
    transpile: false,
    explicitExtensions: false,
    dev: true,
    scope: undefined,
    stripExports: undefined,
  };
  Object.entries(opts).forEach(([key, value]) => {
    if (value != null) {
      output[key] = value;
    }
  });
  output.entryStrategy = opts.entryStrategy?.type ?? 'smart';
  return output;
};
