import { getSystem, loadPlatformBinding, type PlatformBinding } from './platform';
import type { TransformModulesOptions, Optimizer, OptimizerOptions } from './types';

/** @public */
export const createOptimizer = async (optimizerOptions: OptimizerOptions = {}) => {
  const sys = optimizerOptions?.sys || (await getSystem());
  const binding = optimizerOptions?.binding || (await loadPlatformBinding(sys));

  const optimizer: Optimizer = {
    async transformModules(opts: TransformModulesOptions) {
      return transformModules(binding, opts);
    },
    sys,
  };

  return optimizer;
};

/** Transforms the input code string, does not access the file system. */
const transformModules = (binding: PlatformBinding, opts: TransformModulesOptions) => {
  return binding.transform_modules(convertOptions(opts));
};

const convertOptions = (opts: any) => {
  const output: any = {
    minify: 'simplify',
    sourceMaps: false,
    transpileTs: false,
    transpileJsx: false,
    preserveFilenames: false,
    explicitExtensions: false,
    mode: 'lib',
    manualChunks: undefined,
    scope: undefined,
    regCtxName: undefined,
    stripEventHandlers: false,
    rootDir: undefined,
    stripExports: undefined,
    stripCtxName: undefined,
    isServer: undefined,
  };
  Object.entries(opts).forEach(([key, value]) => {
    if (value != null) {
      output[key] = value;
    }
  });
  output.entryStrategy = opts.entryStrategy?.type ?? 'smart';
  output.manualChunks = opts.entryStrategy?.manual ?? undefined;
  return output;
};
