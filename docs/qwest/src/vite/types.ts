export interface ParsedData {
  pages: ParsedPage[];
  indexes: ParsedIndexData[];
}

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
  title: string;
  filePath: string;
}

export interface NormalizedPluginOptions extends PluginOptions {
  extensions: string[];
}

/**
 * @public
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
 * @public
 */
export type MdxOptions = import('@mdx-js/mdx/lib/compile.js').CompileOptions;
