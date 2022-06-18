import type { PageHead } from '../runtime/types';

export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  routes: BuildRoute[];
  layouts: BuildLayout[];
  menus: ParsedMenu[];
  diagnostics: Diagnostic[];
  ids: Set<string>;
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
  head: PageHead | undefined;
  attributes: { [prop: string]: string } | undefined;
  layouts: BuildLayout[];
  default: any;
}

export interface EndpointRoute extends BaseRoute {
  type: 'endpoint';
}

export interface BuildLayout {
  filePath: string;
  name: string;
  dir: string;
  id: string;
}

export interface ParamMatcher {
  (param: string): boolean;
}

export interface ParsedMenu extends ParsedMenuItem {
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
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
  /**
   * Source directories to evaluate for pages, in addition to the `routesDir` config.
   * This can be used to evaluate addition directories that could possibly contain markdown files,
   * such as `src/blog` or `src/docs`. Defaults to `undefined`.
   */
  dirs?: string[];
  /**
   * MDX Options https://mdxjs.com/
   */
  mdx?: any;
}

export interface NormalizedPluginOptions extends Required<PluginOptions> {}
