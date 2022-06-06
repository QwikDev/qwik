import type { PageHead } from '../runtime/types';

export interface BuildContext {
  rootDir: string;
  opts: NormalizedPluginOptions;
  pages: ParsedPage[];
  layouts: PageLayout[];
  indexes: ParsedIndexData[];
  log: {
    warn: (msg: string) => void;
  };
}

export interface ParsedPage {
  path: string;
  head: PageHead;
  layouts: PageLayout[];
  route: PageRoute;
  attributes: { [prop: string]: string };
}

export interface PageRoute {
  pathname: string;
  pattern: RegExp;
  names: string[];
  types: string[];
}

export interface PageLayout {
  path: string;
  name: string;
  dir: string;
  id: string;
}

export interface ParamMatcher {
  (param: string): boolean;
}

////////////

export interface ParsedData {}

export interface ParsedIndexData extends ParsedIndex {
  pathname: string;
  filePath: string;
}

export interface ParsedIndex {
  text: string;
  href?: string;
  items?: ParsedIndex[];
}

/**
 * @alpha
 */
export interface PluginOptions {
  /**
   * Directory of the `pages`. Defaults to `src/pages`.
   */
  pagesDir?: string;
  /**
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
  mdx?: any;
}

export interface NormalizedPluginOptions extends Required<PluginOptions> {}
