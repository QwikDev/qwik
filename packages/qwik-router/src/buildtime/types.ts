import type { LinkDataPrefetchOptions } from '../runtime/src/types';
import type { SerializationStrategy } from '@qwik.dev/core/internal';

/**
 * Build-time route trie node. Mirrors the runtime RouteData shape with the same key conventions
 * (`_W`, `_A`, lowercase static) plus build-only metadata (`_files`, `_dirPath`).
 *
 * During the filesystem walk, `_files` and `_dirPath` are populated. During codegen, `_L`, `_I`,
 * `_G`, `_B`, `_4`, `_E` are emitted as JS expressions.
 */
export interface BuildTrieNode {
  /** Parameter name (for `_W` and `_A` nodes) */
  _P?: string;
  /** Prefix for infix params (e.g. `pre` for `pre[slug]post`) — only on `_W` nodes */
  _0?: string;
  /** Suffix for infix params (e.g. `post` for `pre[slug]post`) — only on `_W` nodes */
  _9?: string;
  /** Rewrite target path (set by rewriteRoutes), e.g. '/about/' or '/blog/_W/' */
  _G?: string;
  /** Source files at this directory level */
  _files: RouteSourceFile[];
  /** Filesystem path of this directory */
  _dirPath: string;
  /** Children keyed by trie key (lowercase static, `_W`, `_A`, or `(groupName)`) */
  children: Map<string, BuildTrieNode>;
}

export interface RoutingContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  /** The route trie built from the filesystem walk */
  routeTrie: BuildTrieNode;
  /** Derived flat arrays (populated after trie walk for backward compat) */
  routes: BuiltRoute[];
  serverPlugins: BuiltServerPlugin[];
  layouts: BuiltLayout[];
  entries: BuiltEntry[];
  serviceWorkers: BuiltEntry[];
  menus: BuiltMenu[];
  frontmatter: Map<string, FrontmatterAttrs>;
  diagnostics: Diagnostic[];
  target: 'ssr' | 'client' | undefined;
  dynamicImports: boolean;
  isDirty: boolean;
  activeBuild: Promise<void> | null;
}

export type Yaml = string | number | boolean | null | { [attrName: string]: Yaml } | Yaml[];

export interface FrontmatterAttrs {
  [attrName: string]: Yaml;
}

export interface Diagnostic {
  type: 'error' | 'warn';
  message: string;
}

export interface RouteSourceFile extends RouteSourceFileName {
  dirPath: string;
  dirName: string;
  filePath: string;
  fileName: string;
}

export interface RouteSourceFileName {
  type: RouteSourceType;
  /** Filename without the extension */
  extlessName: string;
  /** Just the extension */
  ext: string;
}

export type RouteSourceType = 'route' | 'layout' | 'entry' | 'menu' | 'service-worker';

export interface BuiltRoute extends ParsedPathname {
  /** Unique id built from its relative file system path */
  id: string;
  /** Local file system path */
  filePath: string;
  ext: string;
  /** URL Pathname */
  pathname: string;
  layouts: BuiltLayout[];
}

export interface BuiltServerPlugin {
  /** Unique id built from its relative file system path */
  id: string;
  /** Local file system path */
  filePath: string;
  ext: string;
}

export interface ParsedPathname {
  routeName: string;
  pattern: RegExp; // TODO(misko): duplicate information from `routeName` refactor to normalize
  paramNames: string[]; // TODO(misko): duplicate information from `routeName` refactor to normalizehttps://github.com/QwikDev/qwik/pull/4954
  segments: PathnameSegment[];
}

export type PathnameSegment = PathnameSegmentPart[];

export interface PathnameSegmentPart {
  content: string;
  dynamic: boolean;
  rest: boolean;
}

export interface BuiltLayout {
  filePath: string;
  dirPath: string;
  id: string;
  layoutType: 'top' | 'nested';
  layoutName: string;
}

export interface BuiltEntry extends ParsedPathname {
  id: string;
  chunkFileName: string;
  filePath: string;
}

export interface BuiltMenu {
  pathname: string;
  filePath: string;
}

export interface ParsedMenuItem {
  text: string;
  href?: string;
  items?: ParsedMenuItem[];
}

/** @public */
export interface RewriteRouteOption {
  prefix?: string;
  paths: Record<string, string>;
}

/** @public */
export interface PluginOptions {
  /** Directory of the `routes`. Defaults to `"src/routes"`. */
  routesDir?: string;
  /** Directory of the `server plugins`. Defaults to `routesDir`. */
  serverPluginsDir?: string;
  /**
   * The base pathname is used to create absolute URL paths up to the `hostname`, and must always
   * start and end with a `/`. Defaults to `"/""`.
   */
  basePathname?: string;
  /**
   * Ensure a trailing slash ends page urls. Defaults to `true`. (Note: Previous versions defaulted
   * to `false`).
   */
  trailingSlash?: boolean;
  /** Enable or disable MDX plugins included by default in qwik-router. */
  mdxPlugins?: MdxPlugins;
  /** MDX Options https://mdxjs.com/ */
  mdx?: any;
  /**
   * Extend the `platform` object in RequestEvent, which can be used to e.g. mock Cloudflare
   * bindings.
   *
   * This only works in **dev mode** and only when using the in-process Vite dev server middleware
   * (the default).
   */
  platform?: Record<string, unknown>;
  /** Configuration to rewrite url paths */
  rewriteRoutes?: RewriteRouteOption[];
  /** The serialization strategy for route loaders. Defaults to `never`. */
  defaultLoadersSerializationStrategy?: SerializationStrategy;
  /** Specifies when link data should be prefetched to improve navigation performance. */
  linkDataPrefetch?: LinkDataPrefetchOptions;
}

export interface MdxPlugins {
  remarkGfm: boolean;
  rehypeSyntaxHighlight: boolean;
  rehypeAutolinkHeadings: boolean;
}

export interface NormalizedPluginOptions extends Omit<Required<PluginOptions>, 'trailingSlash'> {
  assetsDir?: string;
}

export interface MarkdownAttributes {
  [name: string]: string;
}
