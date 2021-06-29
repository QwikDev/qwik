import type {
  OptimizerOptions,
  SourceMapOption,
  TransformModuleOptions,
  InternalCache,
} from './types';
import {
  getTsConfigCompilerOptions,
  getTypeScriptPath,
  getTypeScriptVersion,
} from './typescript-platform';
import { normalizeOptions, platform } from './utils';
import { transformModule } from './transform';

export class Optimizer {
  private rootDir: string | null = null;
  private sourceMapOpt: SourceMapOption = true;
  private tsPath: string | null = null;
  private enabledCache = true;
  private internalCache: InternalCache = {
    modules: [],
    resolved: new Map(),
  };

  constructor(opts?: OptimizerOptions) {
    normalizeOptions(this, opts);
  }

  transformModule(opts: TransformModuleOptions) {
    return transformModule(this, this.internalCache, opts);
  }

  setRootDir(rootDir: string) {
    this.rootDir = rootDir;
  }

  getRootDir() {
    let rootDir = this.rootDir as string;
    if (typeof rootDir !== 'string') {
      if (platform === 'node') {
        rootDir = process.cwd();
      } else {
        rootDir = '/';
      }
    }
    return rootDir;
  }

  enableCache(useCache: boolean) {
    this.enabledCache = useCache;
  }

  isCacheEnabled() {
    return this.enabledCache;
  }

  setSourceMapOption(sourceMapOpt: SourceMapOption) {
    this.sourceMapOpt = sourceMapOpt;
  }

  getSourceMapOption() {
    return this.sourceMapOpt;
  }

  getTsConfigCompilerOptions() {
    return getTsConfigCompilerOptions(this, this.internalCache);
  }

  getTypeScriptPath() {
    return getTypeScriptPath(this.tsPath);
  }

  setTypescriptPath(typescriptPath: string | null) {
    this.tsPath = typescriptPath;
  }

  getTypeScriptVersion() {
    return getTypeScriptVersion(this, this.internalCache);
  }
}
