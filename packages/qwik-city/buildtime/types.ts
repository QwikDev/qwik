export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  routes: BuildRoute[];
  errors: BuildRoute[];
  layouts: BuildLayout[];
  entries: BuildEntry[];
  serviceWorkers: BuildEntry[];
  menus: BuildMenu[];
  frontmatter: Map<string, FrontmatterAttrs>;
  diagnostics: Diagnostic[];
  target: 'ssr' | 'client';
  isDevServer: boolean;
  isDevServerClientOnly: boolean;
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
  /**
   * Filename without the extension
   */
  extlessName: string;
  /**
   * Just the extension
   */
  ext: string;
}

export type RouteSourceType = 'route' | 'layout' | 'entry' | 'menu' | 'error' | 'service-worker';

export interface BuildRoute extends ParsedPathname {
  /**
   * Unique id built from its relative file system path
   */
  id: string;
  /**
   * Local file system path
   */
  filePath: string;
  ext: string;
  /**
   * URL Pathname
   */
  pathname: string;
  layouts: BuildLayout[];
}

export interface ParsedPathname {
  pattern: RegExp;
  paramNames: string[];
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

/**
 * @alpha
 */
export interface PluginOptions {
  /**
   * Directory of the `routes`. Defaults to `src/routes`.
   */
  routesDir?: string;
  /**
   * The base pathname is used to create absolute URL paths up to
   * the `hostname`, and must always start and end with a
   * `/`.  Defaults to `/`.
   */
  basePathname?: string;
  /**
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
  /**
   * Enable or disable MDX plugins included by default in qwik-city.
   */
  mdxPlugins?: MdxPlugins;
  /**
   * MDX Options https://mdxjs.com/
   */
  mdx?: any;
  /**
   * @deprecated Please use "basePathname" instead.
   */
  baseUrl?: string;
}

export interface MdxPlugins {
  remarkGfm: boolean;
  rehypeSyntaxHighlight: boolean;
  rehypeAutolinkHeadings: boolean;
}

export interface NormalizedPluginOptions extends Required<PluginOptions> {}

export interface MarkdownAttributes {
  [name: string]: string;
}
