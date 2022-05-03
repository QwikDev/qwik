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

export interface ParsedPage {
  pathname: string;
  filePath: string;
  attrs: { [prop: string]: string };
}

export interface PluginContext {
  opts: PluginOptions;
  extensions: string[];
  pages: ParsedPage[];
  indexes: ParsedIndexData[];
}

/**
 * @alpha
 */
export interface PluginOptions {
  layouts: {
    [layoutName: string]: string;
    default: string;
  };
  pagesDir: string;
  /**
   * File extensions to parse. Defaults to `['.md', '.mdx']`.
   */
  extensions?: string[];
  /**
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
  mdx?: MdxOptions;
}

/**
 * @alpha
 */
export type MdxOptions = import('@mdx-js/mdx/lib/compile').CompileOptions;
