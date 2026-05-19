import type { EntryStrategy } from '@qwik.dev/optimizer';

export type * from '@qwik.dev/optimizer';

/**
 * The metadata of the build. One of its uses is storing where QRL symbols are located.
 *
 * @public
 */
export interface QwikManifest {
  /** Content hash of the manifest, if this changes, the code changed */
  manifestHash: string;
  /** QRL symbols */
  symbols: { [symbolName: string]: QwikSymbol };
  /** Where QRLs are located. The key is the symbol name, the value is the bundle fileName */
  mapping: { [symbolName: string]: string };
  /**
   * All code bundles, used to know the import graph. The key is the bundle fileName relative to
   * "build/"
   */
  bundles: { [fileName: string]: QwikBundle };
  /** All assets. The key is the fileName relative to the rootDir */
  assets?: { [fileName: string]: QwikAsset };
  /** All bundles in a compact graph format with probabilities */
  bundleGraph?: QwikBundleGraph;
  /** The bundle graph fileName */
  bundleGraphAsset?: string;
  /** The preloader bundle fileName */
  preloader?: string;
  /** The Qwik core bundle fileName */
  core?: string;
  /** The Qwik loader bundle fileName */
  qwikLoader?: string;
  /** CSS etc to inject in the document head */
  injections?: GlobalInjections[];
  /** The version of the manifest */
  version: string;
  /** The options used to build the manifest */
  options?: {
    target?: string;
    buildMode?: string;
    entryStrategy?: { type: EntryStrategy['type'] };
  };
  /** The platform used to build the manifest */
  platform?: { [name: string]: string };
}
/**
 * The manifest values that are needed for SSR.
 *
 * @public
 */
export type ServerQwikManifest = Pick<
  QwikManifest,
  | 'manifestHash'
  | 'injections'
  | 'bundleGraph'
  | 'bundleGraphAsset'
  | 'mapping'
  | 'preloader'
  | 'core'
  | 'qwikLoader'
>;

/**
 * Bundle graph.
 *
 * Format: [ 'bundle-a.js', 3, 5 // Depends on 'bundle-b.js' and 'bundle-c.js' 'bundle-b.js', 5, //
 * Depends on 'bundle-c.js' 'bundle-c.js', ]
 *
 * @public
 */
export type QwikBundleGraph = Array<string | number>;

/** @public */
export type SymbolMapper = Record<string, readonly [symbol: string, chunk: string]>;

/** @public */
export type SymbolMapperFn = (
  symbolName: string,
  mapper: SymbolMapper | undefined,
  parent?: string
) => readonly [symbol: string, chunk: string] | undefined;

/** @public */
export interface QwikSymbol {
  origin: string;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  ctxKind: 'function' | 'eventHandler';
  ctxName: string;
  /** Whether the symbol captures a variable */
  captures: boolean;
  parent: string | null;
  loc: [number, number];
  /** The parameter names if it's a function with parameters */
  paramNames?: string[];
  /** The transformed names of scoped variables, if any */
  captureNames?: string[];
}

/** @public */
export interface QwikBundle {
  /** Size of the bundle */
  size: number;
  /** Total size of this bundle's static import graph */
  total: number;
  /** Interactivity score of the bundle */
  interactivity?: number;
  /** Symbols in the bundle */
  symbols?: string[];
  /** Direct imports */
  imports?: string[];
  /** Dynamic imports */
  dynamicImports?: string[];
  /** Source files of the bundle */
  origins?: string[];
}

/** @public */
export interface QwikAsset {
  /** Name of the asset */
  name: string | undefined;
  /** Size of the asset */
  size: number;
}

/** @public */
export interface GlobalInjections {
  tag: string;
  attributes?: { [key: string]: string };
  location: 'head' | 'body';
}

/** @public */
export interface ResolvedManifest {
  mapper: SymbolMapper;
  manifest: ServerQwikManifest;
  injections?: GlobalInjections[];
  bundleGraph?: QwikBundleGraph;
}
