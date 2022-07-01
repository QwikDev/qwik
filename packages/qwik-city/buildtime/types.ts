export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  routes: BuildRoute[];
  layouts: BuildLayout[];
  frontmatter: Map<string, string[]>;
  menus: ParsedMenu[];
  diagnostics: Diagnostic[];
  ids: Set<string>;
  target: 'ssr' | 'client';
  dirty: boolean;
}

export interface Diagnostic {
  type: 'error' | 'warn';
  message: string;
}

export type BuildRoute = PageRoute | EndpointRoute;

interface BaseRoute {
  type: 'page' | 'endpoint';
  /**
   * Unique id built from its relative file system path
   */
  id: string;
  /**
   * Local file system path
   */
  filePath: string;
  /**
   * URL Pathname
   */
  pathname: string;
  pattern: RegExp;
  paramNames: string[];
  paramTypes: string[];
}

export interface PageRoute extends BaseRoute {
  type: 'page';
  source: 'markdown' | 'module';
  layouts: BuildLayout[];
}

export interface EndpointRoute extends BaseRoute {
  type: 'endpoint';
}

export interface BuildLayout {
  filePath: string;
  dir: string;
  id: string;
  type: 'top' | 'nested';
  name: string;
}

export interface ParsedMenu extends ParsedMenuItem {
  pathname: string;
  filePath: string;
  id: string;
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
