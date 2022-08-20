export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  routes: BuildRoute[];
  errors: BuildRoute[];
  layouts: BuildLayout[];
  entries: BuildEntry[];
  menus: BuildMenu[];
  frontmatter: Map<string, FrontmatterAttrs>;
  diagnostics: Diagnostic[];
  target: 'ssr' | 'client';
  isDevServer: boolean;
  isDevServerClientOnly: boolean;
}

export interface FrontmatterAttrs {
  [attrName: string]: any;
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

export type RouteSourceType = 'route' | 'layout' | 'entry' | 'menu' | 'error';

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

export interface BuildEntry {
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
   * The base url is used to create absolute URL paths to
   * the hostname.  Defaults to `/`.
   */
  baseUrl?: string;
  /**
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
  /**
   * MDX Options https://mdxjs.com/
   */
  mdx?: any;
}

export interface NormalizedPluginOptions extends Required<PluginOptions> {}

export interface MarkdownAttributes {
  [name: string]: string;
}
