import type { TransformResult, TransformModule, TransformModuleInput } from '.';
import { getSystem, InternalSystem, PlatformBinding } from './platform';
import type { TransformModulesOptions, TransformFsOptions, Optimizer } from './types';

/**
 * @alpha
 */
export const createOptimizer = async (): Promise<Optimizer> => {
  const sys = await getSystem();
  const binding = sys.binding;

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

      const result = await transformFsAsync(sys, binding, opts);
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

    path: sys.path,
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

const transformFsAsync = (
  sys: InternalSystem,
  binding: PlatformBinding,
  opts: TransformFsOptions
) => {
  if (binding.transform_fs) {
    return binding.transform_fs(convertOptions(opts));
  }
  return transformFsVirtual(sys, opts);
};

const transformFsVirtual = async (sys: InternalSystem, opts: TransformFsOptions) => {
  const extensions = ['.js', '.ts', '.tsx', '.jsx'];

  async function getFiles(dir: string) {
    const subdirs = await readDir(sys, dir);
    const files: string[] = await Promise.all(
      subdirs.flatMap(async (subdir: any) => {
        const res = sys.path.resolve(dir, subdir);
        const isDir = await isDirectory(sys, res);
        return (isDir ? getFiles(res) : res) as any;
      })
    );
    return files.filter((a) => extensions.includes(sys.path.extname(a)));
  }

  const files = await getFiles(opts.rootDir);
  const input: TransformModuleInput[] = await Promise.all(
    files.map(async (file) => {
      return {
        code: (await readFile(sys, file)) as string,
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
  return sys.binding.transform_modules(convertOptions(newOpts));
};

const readDir = (sys: InternalSystem, dirPath: string) =>
  new Promise<string[]>((resolve, reject) => {
    sys.fs.readdir(dirPath, (err, items) => {
      if (err) {
        reject(err);
      } else {
        resolve(items);
      }
    });
  });

const readFile = (sys: InternalSystem, filePath: string) =>
  new Promise<string>((resolve, reject) => {
    sys.fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });

const isDirectory = (sys: InternalSystem, path: string) =>
  new Promise<boolean>((resolve, reject) => {
    sys.fs.stat(path, (err, stat) => {
      if (err) {
        reject(err);
      } else {
        resolve(stat.isDirectory());
      }
    });
  });

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
