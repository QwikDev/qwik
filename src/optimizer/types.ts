import type { Optimizer } from './optimizer';

export interface OptimizerOptions {
  cache?: boolean;
  entryInputs?: EntryInput[];
  mode?: Mode;
  rootDir?: string;
  sourcemap?: SourceMapOption;
  ts?: any;
  tsconfig?: any;
  typescriptPath?: string;
}

export interface TransformModuleOptions {
  filePath: string;
  text: string;
  module?: 'es' | 'cjs';
  sourcemap?: SourceMapOption;
  createCacheKey?: (content: string) => string;
  readFromCacheSync?: (cacheKey: string) => TransformModuleResult | null | undefined;
  writeToCacheSync?: (cacheKey: string, result: TransformModuleResult) => void;
}

export interface TransformModuleResult {
  filePath: string;
  text: string;
  map: any;
  cacheKey: string | null;
}

export type Mode = 'development' | 'production';

export type OutputPlatform = 'client' | 'server';

export type SourceMapOption = 'external' | 'inline' | null;

export type { Optimizer };

export interface InternalCache {
  modules: TransformModuleResult[];
  resolved: Map<string, string>;
  tsResolveCache?: any;
}

export interface EntryInput {
  filePath: string;
}

/**
 * @public
 */
export interface OutputFile {
  path: string;
  text: string;
  platform?: OutputPlatform;
}

export interface Diagnostic {
  type: 'error' | 'warn';
  message: string;
  platform?: OutputPlatform;
  location?: {
    column: number;
    file: string;
    length: number;
    line: number;
    lineText: string;
  } | null;
}

export interface EntryPointOptions {
  platform?: OutputPlatform;
}

export interface ResolveModuleOptions {
  moduleName: string;
  containingFile: string;
  host?: ResolveModuleHost;
}

export interface ResolveModuleHost {
  fileExists(fileName: string): boolean;
  readFile(fileName: string): string | undefined;
  directoryExists?(directoryName: string): boolean;
  realpath?(path: string): string;
  getDirectories?(path: string): string[];
}

export interface ResolveModuleResult {
  /** Path of the file the module was resolved to. */
  resolvedFileName?: string;
  /** True if `resolvedFileName` comes from `node_modules`. */
  isExternalLibraryImport?: boolean;
  /**
   * Name of the package.
   * Should not include `@types`.
   * If accessing a non-index file, this should include its name e.g. "foo/bar".
   */
  name?: string;
  /**
   * Name of a submodule within this package.
   * May be "".
   */
  subModuleName?: string;
  /** Version of the package, e.g. "1.2.3" */
  version?: string;
}
