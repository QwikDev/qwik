import type { SerializationStrategy } from '@qwik.dev/core/internal';

export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  routes: BuildRoute[];
  serverPlugins: BuildServerPlugin[];
  layouts: BuildLayout[];
  entries: BuildEntry[];
  serviceWorkers: BuildEntry[];
  menus: BuildMenu[];
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

export interface BuildRoute extends ParsedPathname {
  /** Unique id built from its relative file system path */
  id: string;
  /** Local file system path */
  filePath: string;
  ext: string;
  /** URL Pathname */
  pathname: string;
  layouts: BuildLayout[];
}

export interface BuildServerPlugin {
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

export interface BuildLayout {
  filePath: string;
  dirPath: string;
  id: string;
  layoutType: 'top' | 'nested';
  layoutName: string;
}

export interface BuildEntry extends ParsedPathname {
  id: string;
  chunkFileName: string;
  filePath: string;
}

export interface BuildMenu {
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
  /** Directory of the `routes`. Defaults to `src/routes`. */
  routesDir?: string;
  /** Directory of the `server plugins`. Defaults to `src/server-plugins`. */
  serverPluginsDir?: string;
  /**
   * The base pathname is used to create absolute URL paths up to the `hostname`, and must always
   * start and end with a `/`. Defaults to `/`.
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
  /** The platform object which can be used to mock the Cloudflare bindings. */
  platform?: Record<string, unknown>;
  /** Configuration to rewrite url paths */
  rewriteRoutes?: RewriteRouteOption[];
  /** The serialization strategy for route loaders. Defaults to `never`. */
  defaultLoadersSerializationStrategy?: SerializationStrategy;
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
