import type { Optimizer } from './optimizer';

export interface OptimizerOptions {
  cache?: boolean;
  sourcemap?: SourceMapOption;
  rootDir?: string;
  typescriptPath?: string;
}

export interface TransformModuleOptions {
  code: string;
  filePath: string;
  module?: 'es' | 'cjs';
  sourcemap?: SourceMapOption;
  createCacheKey?: (content: string) => string;
  readFromCacheSync?: (cacheKey: string) => TransformModuleResult | null | undefined;
  writeToCacheSync?: (cacheKey: string, result: TransformModuleResult) => void;
}

export interface TransformModuleResult {
  code: string;
  filePath: string;
  map: any;
  cacheKey: string | null;
}

export type SourceMapOption = boolean | 'inline';

export type { Optimizer };

export interface InternalCache {
  modules: TransformModuleResult[];
  ts?: any;
  compilerOpts?: any;
  resolved: Map<string, string>;
  tsResolveCache?: any;
}
