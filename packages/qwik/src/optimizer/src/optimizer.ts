import {
  getPlatformInputFiles,
  getSystem,
  loadPlatformBinding,
  type PlatformBinding,
} from './platform';
import type {
  TransformModulesOptions,
  TransformFsOptions,
  Optimizer,
  OptimizerSystem,
  OptimizerOptions,
} from './types';

/** @public */
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

/** Transforms the input code string, does not access the file system. */
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
    input.forEach((file) => {
      file.path = sys.path.relative(fsOpts.srcDir, file.path);
    });
    const modulesOpts: Required<TransformModulesOptions> = {
      srcDir: fsOpts.srcDir,
      rootDir: fsOpts.rootDir!,
      entryStrategy: fsOpts.entryStrategy!,
      minify: fsOpts.minify!,
      sourceMaps: !!fsOpts.sourceMaps,
      transpileTs: fsOpts.transpileTs!,
      transpileJsx: fsOpts.transpileJsx!,
      explicitExtensions: fsOpts.explicitExtensions!,
      preserveFilenames: fsOpts.preserveFilenames!,
      mode: fsOpts.mode!,
      scope: fsOpts.scope!,
      input,
      regCtxName: fsOpts.regCtxName!,
      stripEventHandlers: fsOpts.stripEventHandlers!,
      stripCtxName: fsOpts.stripCtxName!,
      stripExports: fsOpts.stripExports!,
      isServer: fsOpts.isServer!,
    };
    return binding.transform_modules(convertOptions(modulesOpts));
  }

  throw new Error('Not implemented');
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
