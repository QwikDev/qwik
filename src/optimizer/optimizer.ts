import type {
  EntryPointOptions,
  Mode,
  InternalCache,
  OptimizerOptions,
  OutputFile,
  SourceMapOption,
  ResolveModuleOptions,
  ResolveModuleResult,
  TransformModuleOptions,
  TransformModuleResult,
} from './types';
import {
  resolveModuleSync,
  getTsconfig,
  getTypeScript,
  getTypeScriptSync,
} from './typescript-platform';
import { getEntryPoints, normalizeOptions, normalizeUrl, platform } from './utils';
import { transformModule } from './transform';
import type TypeScript from 'typescript';
import { postBuild } from './post-build';

/**
 * Optimizer which provides utility functions to be used by external tooling.
 * @alpha
 */
export class Optimizer {
  private baseUrl = normalizeUrl('/');
  private rootDir: string | null = null;
  private sourceMapOpt: SourceMapOption = true;
  private enabledCache = true;
  private internalCache: InternalCache = {
    modules: [],
    resolved: new Map(),
  };
  private mode: Mode = 'development';
  private ts: any = null;
  private tsconfig: any = null;
  private entryInputs: string[] | null = null;
  private moduleResolveCache: TypeScript.ModuleResolutionCache | null = null;

  constructor(opts?: OptimizerOptions) {
    normalizeOptions(this, opts);
  }

  setEntryInputs(entryInputs: string[]) {
    this.entryInputs = entryInputs;
  }

  getEntryInputs(opts: EntryPointOptions) {
    if (Array.isArray(this.entryInputs)) {
      return this.entryInputs;
    }
    const tsconfig: TypeScript.ParsedCommandLine = this.getTsconfigSync();
    return getEntryPoints(opts, tsconfig.fileNames);
  }

  postBuild(outFile: OutputFile) {
    return postBuild(outFile);
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
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

  setMode(mode: Mode) {
    this.mode = mode === 'development' ? 'development' : 'production';
  }

  getMode() {
    return this.mode;
  }

  isDev() {
    return this.mode === 'development';
  }

  setSourceMapOption(sourceMapOpt: SourceMapOption) {
    this.sourceMapOpt = sourceMapOpt;
  }

  getSourceMapOption() {
    return this.sourceMapOpt;
  }

  resolveModuleSync(opts: ResolveModuleOptions): ResolveModuleResult {
    const ts: typeof TypeScript = this.getTypeScriptSync();
    const tsconfig: TypeScript.ParsedCommandLine = this.getTsconfigSync();
    if (!this.moduleResolveCache) {
      this.moduleResolveCache = ts.createModuleResolutionCache(this.getRootDir(), (s) =>
        s.toLowerCase()
      );
    }
    return resolveModuleSync(ts, tsconfig.options, this.moduleResolveCache, opts);
  }

  async transformModule(opts: TransformModuleOptions): Promise<TransformModuleResult> {
    const ts = await this.getTypeScript();
    const tsconfig: TypeScript.ParsedCommandLine = await this.getTsconfig();
    return transformModule(this, this.internalCache, opts, ts, tsconfig.options);
  }

  transformModuleSync(opts: TransformModuleOptions): TransformModuleResult {
    const ts = this.getTypeScriptSync();
    const tsconfig: TypeScript.ParsedCommandLine = this.getTsconfigSync();
    return transformModule(this, this.internalCache, opts, ts, tsconfig.options);
  }

  async getTsconfig() {
    if (!this.tsconfig) {
      this.tsconfig = getTsconfig(await this.getTypeScript(), this.getRootDir());
    }
    return this.tsconfig;
  }

  getTsconfigSync() {
    if (!this.tsconfig) {
      this.tsconfig = getTsconfig(this.getTypeScriptSync(), this.getRootDir());
    }
    return this.tsconfig;
  }

  setTsconfig(tsconfig: any) {
    this.tsconfig = tsconfig;
  }

  async getTypeScript() {
    if (!this.ts) {
      this.ts = await getTypeScript(this.getRootDir());
    }
    return this.ts;
  }

  getTypeScriptSync() {
    if (!this.ts) {
      this.ts = getTypeScriptSync();
    }
    return this.ts;
  }

  setTypeScript(ts: any) {
    this.ts = ts;
  }
}
